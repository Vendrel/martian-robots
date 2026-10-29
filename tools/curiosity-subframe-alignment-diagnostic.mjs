#!/usr/bin/env node

/**
 * Measures the residual image-to-image placement error of one Curiosity
 * subframe against a full Navcam frame. It deliberately keeps NASA camera
 * metadata as the initial hypothesis, then searches a small image-space
 * neighbourhood for the observed match. It uses the delivered-subframe pixel
 * domain used by Curiosity's H/V camera vectors, so it can distinguish a true
 * metadata residual from a source-crop origin being applied twice.
 *
 * Example:
 * node tools/curiosity-subframe-alignment-diagnostic.mjs \
 *   --manifest dist/curiosity-metadata/3001-4000/mars-rover-360-curiosity-sol-3868-research-manifest.json.gz \
 *   --target NLB_740962281EDR_S1012616NCAM00593M_ \
 *   --reference NLB_740786377EDR_F1012616NCAM00281M_ \
 *   --anchor 330,210,661,414
 */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, values) => {
  if (value.startsWith('--')) pairs.push([value.slice(2), values[index + 1]]);
  return pairs;
}, []));
const required = ['manifest', 'target', 'reference'];
const missing = required.filter(name => !args[name]);
if (missing.length) throw new Error(`Missing required arguments: ${missing.map(name => `--${name}`).join(', ')}`);
const targetOffsetDegrees = args['target-offset'] === undefined ? 0 : Number(args['target-offset']);
if (!Number.isFinite(targetOffsetDegrees)) throw new Error('--target-offset must be a finite number of degrees');
const targetHorizontalOffsetDegrees = args['target-horizontal-offset'] === undefined ? 0 : Number(args['target-horizontal-offset']);
if (!Number.isFinite(targetHorizontalOffsetDegrees)) throw new Error('--target-horizontal-offset must be a finite number of degrees');
const anchor = args.anchor?.split(',').map(Number);
if (anchor && (anchor.length !== 4 || anchor.some(value => !Number.isFinite(value)))) {
  throw new Error('--anchor must be targetX,targetY,referenceX,referenceY');
}

const numberVector = value => (String(value || '').match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/ig) || []).map(Number);
const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
const add = (a, b) => a.map((value, index) => value + b[index]);
const sub = (a, b) => a.map((value, index) => value - b[index]);
const multiply = (a, scalar) => a.map(value => value * scalar);
const normalize = vector => multiply(vector, 1 / Math.hypot(...vector));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const median = values => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

function parseModel(image) {
  const [C, A, H, V, O, R] = String(image.camera_model_component_list || '').split(';').map(numberVector);
  const sourceCrop = numberVector(image.subframe_rect || image.extended?.subframeRect);
  const q = numberVector(image.attitude);
  if (![C, A, H, V].every(vector => vector?.length === 3) || sourceCrop.length !== 4 || q.length !== 4) {
    throw new Error(`${image.imageid} lacks a usable CAHV model, crop, or attitude quaternion`);
  }
  // Curiosity's H/V values are already rebased to the delivered subframe.
  // The source-frame crop origin is descriptive metadata, not an offset to
  // add during CAHVOR projection.
  return { A: normalize(A), H, V, O: O?.length === 3 ? normalize(O) : null, R: R?.length === 3 ? R : null, crop: { left: 1, top: 1, width: sourceCrop[2], height: sourceCrop[3] }, sourceCrop: { left: sourceCrop[0], top: sourceCrop[1], width: sourceCrop[2], height: sourceCrop[3] }, q: normalize(q) };
}

function rotate(vector, q) {
  const [w, x, y, z] = q;
  return [
    (1 - 2 * (y * y + z * z)) * vector[0] + 2 * (x * y - w * z) * vector[1] + 2 * (x * z + w * y) * vector[2],
    2 * (x * y + w * z) * vector[0] + (1 - 2 * (x * x + z * z)) * vector[1] + 2 * (y * z - w * x) * vector[2],
    2 * (x * z - w * y) * vector[0] + 2 * (y * z + w * x) * vector[1] + (1 - 2 * (x * x + y * y)) * vector[2]
  ];
}

function inverseQuaternion(q) { return [q[0], -q[1], -q[2], -q[3]]; }

function rotateAroundAxis(vector, axis, degrees) {
  const angle = degrees * Math.PI / 180;
  const cosine = Math.cos(angle), sine = Math.sin(angle), perpendicular = cross(axis, vector), projection = dot(axis, vector);
  return normalize(add(add(multiply(vector, cosine), multiply(perpendicular, sine)), multiply(axis, projection * (1 - cosine))));
}

function radialForward(model, radius) {
  const [r0 = 0, r1 = 0, r2 = 0] = model.R || [];
  const squared = radius * radius;
  return radius * (1 + r0 + r1 * squared + r2 * squared * squared);
}

function radialInverse(model, observedRadius) {
  const target = Math.abs(observedRadius);
  let low = 0, high = Math.max(1, target);
  while (radialForward(model, high) < target) high *= 2;
  for (let step = 0; step < 48; step++) {
    const middle = (low + high) / 2;
    if (radialForward(model, middle) < target) low = middle;
    else high = middle;
  }
  return Math.sign(observedRadius || 1) * (low + high) / 2;
}

function undistortRay(model, distortedRay) {
  const opticalAxis = normalize(model.O || model.A);
  const axial = dot(distortedRay, opticalAxis);
  const transverse = sub(distortedRay, multiply(opticalAxis, axial));
  const transverseLength = Math.hypot(...transverse);
  if (!transverseLength || Math.abs(axial) < 1e-9) return opticalAxis;
  const tangent = radialInverse(model, transverseLength / axial);
  const angle = Math.atan(tangent);
  const unit = multiply(transverse, 1 / transverseLength);
  return normalize(add(multiply(opticalAxis, Math.cos(angle)), multiply(unit, Math.sin(angle))));
}

function distortRay(model, ray) {
  const opticalAxis = normalize(model.O || model.A);
  const axial = dot(ray, opticalAxis);
  const transverse = sub(ray, multiply(opticalAxis, axial));
  const squared = dot(transverse, transverse);
  const [r0 = 0, r1 = 0, r2 = 0] = model.R || [];
  const scale = r0 + r1 * squared + r2 * squared * squared;
  return add(ray, multiply(transverse, scale));
}

function rayAt(model, u, v) {
  const hPerpendicular = sub(model.H, multiply(model.A, dot(model.H, model.A)));
  const vPerpendicular = sub(model.V, multiply(model.A, dot(model.V, model.A)));
  const x = u - dot(model.H, model.A);
  const y = v - dot(model.V, model.A);
  const hh = dot(hPerpendicular, hPerpendicular);
  const hv = dot(hPerpendicular, vPerpendicular);
  const vv = dot(vPerpendicular, vPerpendicular);
  const determinant = hh * vv - hv * hv;
  const alpha = (x * vv - y * hv) / determinant;
  const beta = (y * hh - x * hv) / determinant;
  return undistortRay(model, normalize(add(model.A, add(multiply(hPerpendicular, alpha), multiply(vPerpendicular, beta)))));
}

function projectRay(model, ray) {
  const distortedRay = distortRay(model, ray);
  const denominator = dot(model.A, distortedRay);
  if (denominator <= 0) return null;
  return { x: dot(model.H, distortedRay) / denominator, y: dot(model.V, distortedRay) / denominator };
}

function run(binary, parameters) {
  return new Promise((resolve, reject) => {
    const process = spawn(binary, parameters);
    const errors = [];
    process.stderr.on('data', chunk => errors.push(chunk));
    process.on('error', reject);
    process.on('close', code => code === 0 ? resolve() : reject(new Error(Buffer.concat(errors).toString() || `${binary} exited ${code}`)));
  });
}

function readBmpGray(bytes) {
  if (bytes.toString('ascii', 0, 2) !== 'BM') throw new Error('sips did not produce a BMP image');
  const offset = bytes.readUInt32LE(10), width = bytes.readInt32LE(18), signedHeight = bytes.readInt32LE(22), bits = bytes.readUInt16LE(28);
  if (width <= 0 || !signedHeight || ![24, 32].includes(bits)) throw new Error('unsupported BMP format from sips');
  const height = Math.abs(signedHeight), bottomUp = signedHeight > 0, rowSize = Math.floor((bits * width + 31) / 32) * 4, pixels = Buffer.alloc(width * height);
  for (let y = 0; y < height; y++) {
    const sourceY = bottomUp ? height - y - 1 : y;
    for (let x = 0; x < width; x++) {
      const index = offset + sourceY * rowSize + x * (bits / 8), b = bytes[index], g = bytes[index + 1], r = bytes[index + 2];
      pixels[y * width + x] = Math.round(.2126 * r + .7152 * g + .0722 * b);
    }
  }
  return { pixels, width, height };
}

async function decodeGray(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Cannot download ${url}: HTTP ${response.status}`);
  const jpeg = Buffer.from(await response.arrayBuffer());
  const directory = await mkdtemp(join(tmpdir(), 'mars360-alignment-'));
  const input = join(directory, 'input.jpg'), output = join(directory, 'output.bmp');
  try {
    await writeFile(input, jpeg);
    await run('sips', ['-s', 'format', 'bmp', input, '--out', output]);
    return readBmpGray(await readFile(output));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function patchScore(source, sourceWidth, sourceHeight, sx, sy, target, targetWidth, targetHeight, tx, ty, radius) {
  if (sx - radius < 0 || sy - radius < 0 || sx + radius >= sourceWidth || sy + radius >= sourceHeight || tx - radius < 0 || ty - radius < 0 || tx + radius >= targetWidth || ty + radius >= targetHeight) return -Infinity;
  let sourceSum = 0, targetSum = 0, count = 0;
  for (let y = -radius; y <= radius; y++) for (let x = -radius; x <= radius; x++) {
    sourceSum += source[(sy + y) * sourceWidth + sx + x];
    targetSum += target[(ty + y) * targetWidth + tx + x];
    count++;
  }
  const sourceMean = sourceSum / count, targetMean = targetSum / count;
  let covariance = 0, sourceEnergy = 0, targetEnergy = 0;
  for (let y = -radius; y <= radius; y++) for (let x = -radius; x <= radius; x++) {
    const sourceValue = source[(sy + y) * sourceWidth + sx + x] - sourceMean;
    const targetValue = target[(ty + y) * targetWidth + tx + x] - targetMean;
    covariance += sourceValue * targetValue;
    sourceEnergy += sourceValue * sourceValue;
    targetEnergy += targetValue * targetValue;
  }
  return sourceEnergy > 1 && targetEnergy > 1 ? covariance / Math.sqrt(sourceEnergy * targetEnergy) : -Infinity;
}

function bestMatch(source, sourceWidth, sourceHeight, sx, sy, target, targetWidth, targetHeight, predicted) {
  // A 384-pixel Navcam subframe spans about 17°. The reported failure can be
  // several degrees, so the search must exceed the usual registration noise.
  const coarseRadius = 180, coarseStep = 4, patchRadius = 5;
  let best = { score: -Infinity, x: 0, y: 0 };
  for (let y = Math.round(predicted.y - coarseRadius); y <= Math.round(predicted.y + coarseRadius); y += coarseStep) {
    for (let x = Math.round(predicted.x - coarseRadius); x <= Math.round(predicted.x + coarseRadius); x += coarseStep) {
      const score = patchScore(source, sourceWidth, sourceHeight, sx, sy, target, targetWidth, targetHeight, x, y, patchRadius);
      if (score > best.score) best = { score, x, y };
    }
  }
  for (let y = best.y - 5; y <= best.y + 5; y++) {
    for (let x = best.x - 5; x <= best.x + 5; x++) {
      const score = patchScore(source, sourceWidth, sourceHeight, sx, sy, target, targetWidth, targetHeight, x, y, 8);
      if (score > best.score) best = { score, x, y };
    }
  }
  return best;
}

const manifestBytes = await readFile(args.manifest);
const manifest = JSON.parse(args.manifest.endsWith('.gz') ? gunzipSync(manifestBytes) : manifestBytes);
const findImage = id => manifest.images.find(image => image.imageid === id || image.imageid === `${id}_`);
const target = findImage(args.target), reference = findImage(args.reference);
if (!target || !reference) throw new Error('Target or reference image was not found in the manifest');
const targetModel = parseModel(target), referenceModel = parseModel(reference);
const targetRaster = await decodeGray(target.https_url || target.url);
const referenceRaster = await decodeGray(reference.https_url || reference.url);
if (targetRaster.width !== targetModel.crop.width || targetRaster.height !== targetModel.crop.height || referenceRaster.width !== referenceModel.crop.width || referenceRaster.height !== referenceModel.crop.height) {
  throw new Error('Downloaded image dimensions do not match the metadata crop');
}

const targetVerticalAxis = normalize(cross(targetModel.V, targetModel.A));
const targetHorizontalAxis = normalize(cross(targetModel.H, targetModel.A));
function targetToReferenceProjection(x, y, verticalOffsetDegrees = targetOffsetDegrees, horizontalOffsetDegrees = targetHorizontalOffsetDegrees) {
  const roverRay = rayAt(targetModel, targetModel.crop.left + x, targetModel.crop.top + y);
  const correctedRay = rotateAroundAxis(rotateAroundAxis(roverRay, targetVerticalAxis, verticalOffsetDegrees), targetHorizontalAxis, horizontalOffsetDegrees);
  const worldRay = rotate(correctedRay, targetModel.q);
  return projectRay(referenceModel, rotate(worldRay, inverseQuaternion(referenceModel.q)));
}

const matches = [];
for (let y = 40; y < targetModel.crop.height - 40; y += 34) {
  for (let x = 60; x < targetModel.crop.width - 60; x += 54) {
    const projected = targetToReferenceProjection(x, y);
    if (!projected) continue;
    const matched = bestMatch(targetRaster.pixels, targetModel.crop.width, targetModel.crop.height, x, y, referenceRaster.pixels, referenceModel.crop.width, referenceModel.crop.height, projected);
    if (matched.score < 0.55) continue;
    const matchedReferenceRay = rayAt(referenceModel, matched.x, matched.y);
    const matchedWorldRay = rotate(matchedReferenceRay, referenceModel.q);
    const targetRay = rotate(matchedWorldRay, inverseQuaternion(targetModel.q));
    const reverseProjection = projectRay(targetModel, targetRay);
    if (!reverseProjection) continue;
    const predictedBack = { x: reverseProjection.x - targetModel.crop.left, y: reverseProjection.y - targetModel.crop.top };
    const reverse = bestMatch(referenceRaster.pixels, referenceModel.crop.width, referenceModel.crop.height, matched.x, matched.y, targetRaster.pixels, targetModel.crop.width, targetModel.crop.height, predictedBack);
    const roundTripError = Math.hypot(reverse.x - x, reverse.y - y);
    const projectedAtOffset = offset => {
      return targetToReferenceProjection(x, y, targetOffsetDegrees + offset);
    };
    const oneDegreeHigher = projectedAtOffset(1), oneDegreeLower = projectedAtOffset(-1);
    const derivative = oneDegreeHigher && oneDegreeLower ? {
      x: (oneDegreeHigher.x - oneDegreeLower.x) / 2,
      y: (oneDegreeHigher.y - oneDegreeLower.y) / 2
    } : null;
    const residual = { x: matched.x - projected.x, y: matched.y - projected.y };
    const suggestedOffset = derivative && dot([derivative.x, derivative.y], [derivative.x, derivative.y]) > 1e-9
      ? dot([residual.x, residual.y], [derivative.x, derivative.y]) / dot([derivative.x, derivative.y], [derivative.x, derivative.y])
      : null;
    matches.push({ source: { x, y }, predicted: projected, matched, reverse, roundTripError, dx: residual.x, dy: residual.y, suggestedOffset });
  }
}

const verticalRayA = rayAt(targetModel, targetModel.crop.left + targetModel.crop.width / 2, targetModel.crop.top + targetModel.crop.height / 2);
const verticalRayB = rayAt(targetModel, targetModel.crop.left + targetModel.crop.width / 2, targetModel.crop.top + targetModel.crop.height / 2 + 1);
const degreesPerPixel = Math.acos(Math.max(-1, Math.min(1, dot(verticalRayA, verticalRayB)))) * 180 / Math.PI;
// A high correlation by itself is unsafe on Mars: sky gradients and repeated
// rocks create plausible but unrelated matches. Require a geometrically
// consistent target → reference → target round trip as well.
const accepted = matches.filter(match => match.reverse.score >= 0.55 && match.roundTripError <= 10 && Math.abs(match.dx) < 50 && Math.abs(match.dy) < 50);
const horizontalResidualPixels = median(accepted.map(match => match.dx));
const verticalResidualPixels = median(accepted.map(match => match.dy));
const report = {
  tool: 'curiosity-subframe-alignment-diagnostic/v5',
  target: { id: target.imageid, sourceCrop: targetModel.sourceCrop, pixelDomain: 'delivered-subframe', url: target.https_url || target.url },
  reference: { id: reference.imageid, sourceCrop: referenceModel.sourceCrop, pixelDomain: 'delivered-subframe', url: reference.https_url || reference.url },
  appliedTargetOffsetDegrees: targetOffsetDegrees,
  appliedTargetHorizontalOffsetDegrees: targetHorizontalOffsetDegrees,
  matchCount: matches.length,
  acceptedMatchCount: accepted.length,
  residualPixels: { horizontalMedian: horizontalResidualPixels, verticalMedian: verticalResidualPixels },
  verticalDegreesPerPixel: degreesPerPixel,
  estimatedVerticalResidualDegrees: verticalResidualPixels === null ? null : verticalResidualPixels * degreesPerPixel,
  suggestedCameraLocalVerticalOffsetDegrees: median(accepted.map(match => match.suggestedOffset)),
  matches: accepted
};
if (anchor) {
  const [targetX, targetY, referenceX, referenceY] = anchor;
  const predicted = targetToReferenceProjection(targetX, targetY);
  const plus = targetToReferenceProjection(targetX, targetY, targetOffsetDegrees + 1);
  const minus = targetToReferenceProjection(targetX, targetY, targetOffsetDegrees - 1);
  const horizontalPlus = targetToReferenceProjection(targetX, targetY, targetOffsetDegrees, targetHorizontalOffsetDegrees + 1);
  const horizontalMinus = targetToReferenceProjection(targetX, targetY, targetOffsetDegrees, targetHorizontalOffsetDegrees - 1);
  const derivative = plus && minus ? { x: (plus.x - minus.x) / 2, y: (plus.y - minus.y) / 2 } : null;
  const horizontalDerivative = horizontalPlus && horizontalMinus ? { x: (horizontalPlus.x - horizontalMinus.x) / 2, y: (horizontalPlus.y - horizontalMinus.y) / 2 } : null;
  const residual = predicted ? { x: referenceX - predicted.x, y: referenceY - predicted.y } : null;
  const determinant = derivative && horizontalDerivative ? derivative.x * horizontalDerivative.y - derivative.y * horizontalDerivative.x : 0;
  const suggestedTwoAxisOffset = residual && Math.abs(determinant) > 1e-9 ? {
    vertical: (residual.x * horizontalDerivative.y - residual.y * horizontalDerivative.x) / determinant,
    horizontal: (derivative.x * residual.y - derivative.y * residual.x) / determinant
  } : null;
  report.anchor = {
    target: { x: targetX, y: targetY },
    reference: { x: referenceX, y: referenceY },
    predicted,
    residualPixels: residual,
    suggestedAdditionalOffsetDegrees: derivative && residual
      ? dot([residual.x, residual.y], [derivative.x, derivative.y]) / dot([derivative.x, derivative.y], [derivative.x, derivative.y])
      : null,
    suggestedTwoAxisOffsetDegrees: suggestedTwoAxisOffset
  };
}
console.log(JSON.stringify(report, null, 2));
