import { cameraRayForPixel, projectCameraPoint, textureUvForPixel } from './camera-projection.js?2026110808';

function dot(left, right) { return left[0] * right[0] + left[1] * right[1] + left[2] * right[2]; }
function subtract(left, right) { return [left[0] - right[0], left[1] - right[1], left[2] - right[2]]; }
function add(left, right) { return [left[0] + right[0], left[1] + right[1], left[2] + right[2]]; }
function scale(vector, factor) { return [vector[0] * factor, vector[1] * factor, vector[2] * factor]; }
function normalize(vector) { const length = Math.hypot(...vector); return length > 0 ? scale(vector, 1 / length) : null; }

function cameraBasis(camera) {
  const axis = normalize(camera.A);
  const hCenter = dot(camera.H, axis);
  const vCenter = dot(camera.V, axis);
  const horizontal = normalize(subtract(camera.H, scale(axis, hCenter)));
  const vertical = normalize(subtract(camera.V, scale(axis, vCenter)));
  const focal = (Math.hypot(...subtract(camera.H, scale(axis, hCenter))) + Math.hypot(...subtract(camera.V, scale(axis, vCenter)))) / 2;
  if (!axis || !horizontal || !vertical || !Number.isFinite(focal) || focal <= 0) throw Error('invalid-cahv-camera');
  return { ...camera, center: camera.C, axis, horizontal, vertical, hCenter, vCenter, focal };
}

function cameraRay(camera, pixelX, pixelY) {
  return cameraRayForPixel(camera, pixelX, pixelY);
}

function triangulate(left, leftRay, right, rightRay) {
  const between = subtract(left.center, right.center);
  const dotRays = dot(leftRay, rightRay);
  const denominator = 1 - dotRays * dotRays;
  if (denominator < 1e-5) return null;
  const leftDistance = (dotRays * dot(rightRay, between) - dot(leftRay, between)) / denominator;
  const rightDistance = (dot(rightRay, between) - dotRays * dot(leftRay, between)) / denominator;
  if (leftDistance <= 0 || rightDistance <= 0) return null;
  const leftPoint = add(left.center, scale(leftRay, leftDistance));
  const rightPoint = add(right.center, scale(rightRay, rightDistance));
  const separation = Math.hypot(...subtract(leftPoint, rightPoint));
  // Rejecting weak triangulations is more important than filling every cell.
  if (separation > Math.max(.3, Math.min(leftDistance, rightDistance) * .05)) return null;
  return { point: scale(add(leftPoint, rightPoint), .5), range: (leftDistance + rightDistance) / 2 };
}

function grayscale(bitmap, width, height) {
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0, width, height);
  const rgba = context.getImageData(0, 0, width, height).data;
  const output = new Uint8Array(width * height);
  for (let index = 0; index < output.length; index += 1) {
    const offset = index * 4;
    output[index] = Math.round(rgba[offset] * .2126 + rgba[offset + 1] * .7152 + rgba[offset + 2] * .0722);
  }
  return output;
}

function patchDifference(left, right, width, height, leftX, leftY, rightX, rightY) {
  const radius = 2;
  if (leftX < radius || leftX >= width - radius || leftY < radius || leftY >= height - radius || rightX < radius || rightX >= width - radius || rightY < radius || rightY >= height - radius) return null;
  let error = 0;
  for (let dy = -radius; dy <= radius; dy += 1) for (let dx = -radius; dx <= radius; dx += 1) {
    error += Math.abs(left[(leftY + dy) * width + leftX + dx] - right[(rightY + dy) * width + rightX + dx]);
  }
  return error;
}

// A CAHVORE fisheye pair is not rectified: a corresponding right-image pixel
// is on a curved epipolar locus, not simply at (x-disparity, y). Sampling
// calibrated 3D rays makes the same matcher valid for Navcam and Hazcam.
function bestEpipolarMatch(leftPixels, rightPixels, width, height, leftX, leftY, leftCamera, rightCamera, leftRay, rightScaleX, rightScaleY) {
  const minimumRange = .5, maximumRange = 30, samples = 64;
  let best = null, second = Infinity;
  const visited = new Set();
  for (let index = 0; index < samples; index += 1) {
    const range = minimumRange * (maximumRange / minimumRange) ** (index / (samples - 1));
    const point = add(leftCamera.center, scale(leftRay, range));
    const pixel = projectCameraPoint(rightCamera, point);
    if (!pixel) continue;
    const rightX = Math.round(pixel[0] / rightScaleX), rightY = Math.round(pixel[1] / rightScaleY);
    const key = `${rightX}:${rightY}`;
    if (visited.has(key)) continue;
    visited.add(key);
    const error = patchDifference(leftPixels, rightPixels, width, height, leftX, leftY, rightX, rightY);
    if (!Number.isFinite(error)) continue;
    if (error < (best?.error ?? Infinity)) { second = best?.error ?? Infinity; best = { error, pixelX: rightX, pixelY: rightY }; }
    else if (error < second) second = error;
  }
  // Textureless regions and repeated patterns have no reliable winner.
  return best && second > best.error * 1.02 && best.error < 2100 ? best : null;
}

function median(values) {
  if (!values.length) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

function percentile(values, ratio) {
  if (!values.length) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.max(0, Math.min(ordered.length - 1, Math.floor((ordered.length - 1) * ratio)))];
}

function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }

function solveLinear3(matrix, values) {
  const augmented = matrix.map((row, index) => [...row, values[index]]);
  for (let column = 0; column < 3; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < 3; row += 1) if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    if (Math.abs(augmented[pivot][column]) < 1e-9) return null;
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    for (let index = column; index < 4; index += 1) augmented[column][index] /= divisor;
    for (let row = 0; row < 3; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let index = column; index < 4; index += 1) augmented[row][index] -= factor * augmented[column][index];
    }
  }
  return augmented.map(row => row[3]);
}

function fitGroundPlane(samples) {
  const sums = { xx: 0, xy: 0, x: 0, yy: 0, y: 0, z: 0, xz: 0, yz: 0 };
  for (const { point: [x, y, z] } of samples) {
    sums.xx += x * x; sums.xy += x * y; sums.x += x; sums.yy += y * y; sums.y += y;
    sums.z += z; sums.xz += x * z; sums.yz += y * z;
  }
  const coefficients = solveLinear3([[sums.xx, sums.xy, sums.x], [sums.xy, sums.yy, sums.y], [sums.x, sums.y, samples.length]], [sums.xz, sums.yz, sums.z]);
  return coefficients || [0, 0, median(samples.map(sample => sample.point[2]))];
}

function planeElevation(plane, forward, lateral) { return plane[0] * forward + plane[1] * lateral + plane[2]; }

function rotateWxyz(vector, quaternionWxyz) {
  if (!Array.isArray(quaternionWxyz) || quaternionWxyz.length !== 4 || !quaternionWxyz.every(Number.isFinite)) return null;
  const [w, x, y, z] = quaternionWxyz;
  return [
    (1 - 2 * (y * y + z * z)) * vector[0] + 2 * (x * y - w * z) * vector[1] + 2 * (x * z + w * y) * vector[2],
    2 * (x * y + w * z) * vector[0] + (1 - 2 * (x * x + z * z)) * vector[1] + 2 * (y * z - w * x) * vector[2],
    2 * (x * z - w * y) * vector[0] + 2 * (y * z + w * x) * vector[1] + (1 - 2 * (x * x + y * y)) * vector[2],
  ];
}

// API attitude maps ROVER_NAV into SITE/local-level. SITE +Z is down, and
// ROVER_NAV's origin is 0.25 m above the rendered ground. Deriving this
// plane from attitude keeps the terrain level in SITE even while the rover
// itself is parked on a roll/pitch slope; stereo may only add local relief.
function attitudeGroundPlane(camera) {
  const q = camera?.orientation;
  if (!Array.isArray(q) || q.length !== 4 || !q.every(Number.isFinite)) return null;
  const length = Math.hypot(...q);
  if (length < 1e-12) return null;
  const [w, x, y, z] = q.map(component => component / length);
  const siteDownInRover = rotateWxyz([0, 0, 1], [w, -x, -y, -z]);
  if (!siteDownInRover || Math.abs(siteDownInRover[2]) < 1e-8) return null;
  // n·p = 0.25 → pz = ax·px + ay·py + c
  return [-siteDownInRover[0] / siteDownInRover[2], -siteDownInRover[1] / siteDownInRover[2], .25 / siteDownInRover[2]];
}

self.onmessage = event => {
  let stage = 'input';
  try {
    const { leftBitmap, rightBitmap, leftCamera, rightCamera, verticesPerSide: requestedVerticesPerSide } = event.data;
    // Five times as many grid samples as the former 60×40 seed grid.
    const width = 360, height = 240, gridWidth = 120, gridHeight = 100, maxRangeMeters = 30;
    const sourceWidth = leftBitmap.width, sourceHeight = leftBitmap.height, rightSourceWidth = rightBitmap.width, rightSourceHeight = rightBitmap.height;
    stage = 'image-decode';
    const leftPixels = grayscale(leftBitmap, width, height);
    const rightPixels = grayscale(rightBitmap, width, height);
    leftBitmap.close();
    rightBitmap.close();
    stage = 'camera-basis';
    const left = cameraBasis(leftCamera), right = cameraBasis(rightCamera);
    const sourceScaleX = sourceWidth / width || 1;
    const sourceScaleY = sourceHeight / height || 1;
    const rightScaleX = rightSourceWidth / width || 1;
    const rightScaleY = rightSourceHeight / height || 1;
    const rawPoints = [];
    let valid = 0;
    stage = 'disparity-triangulation';
    for (let gridY = 0; gridY < gridHeight; gridY += 1) for (let gridX = 0; gridX < gridWidth; gridX += 1) {
      const x = Math.floor((gridX + .5) / gridWidth * width), y = Math.floor((gridY + .5) / gridHeight * height);
      const leftRay = cameraRay(left, x * sourceScaleX, y * sourceScaleY);
      if (!leftRay) continue;
      const match = bestEpipolarMatch(leftPixels, rightPixels, width, height, x, y, left, right, leftRay, rightScaleX, rightScaleY);
      if (!match) continue;
      const rightRay = cameraRay(right, match.pixelX * rightScaleX, match.pixelY * rightScaleY);
      if (!leftRay || !rightRay) continue;
      const triangulation = triangulate(left, leftRay, right, rightRay);
      if (!triangulation || triangulation.range > maxRangeMeters) continue;
      rawPoints.push(triangulation);
      valid += 1;
    }
    if (rawPoints.length < 16) throw Error('local-stereo-insufficient-samples');
    stage = 'mesh-output';
    // Depth uncertainty follows Z = fB/d: sigma(Z) ~= Z²/(fB) sigma(d).
    // Points that cannot support a terrain height to roughly 35 cm are less
    // useful than a flat fallback, and were the source of the former spikes.
    const baseline = Math.hypot(...subtract(left.center, right.center));
    const disparitySigmaPixels = 1.25;
    const depthSigma = sample => sample.range * sample.range / Math.max(1, left.focal * baseline) * disparitySigmaPixels;
    let supported = rawPoints.filter(sample => depthSigma(sample) <= .35);
    if (supported.length < 16) supported = rawPoints.filter(sample => depthSigma(sample) <= .65);
    if (supported.length < 16) throw Error('local-stereo-insufficient-precise-samples');

    // The camera need not point along ROVER_NAV +X. Express the terrain grid
    // in its actual horizontal viewing basis, then convert vertices back to
    // ROVER_NAV for the viewer. This also makes every camera's FOV trapezoid
    // well-defined, including the Sol 91 Navcam view.
    const centreRay = cameraRay(left, left.hCenter, left.vCenter);
    const leftEdgeRay = cameraRay(left, 0, left.vCenter);
    const rightEdgeRay = cameraRay(left, sourceWidth, left.vCenter);
    const forwardAxis = centreRay && normalize([centreRay[0], centreRay[1], 0]);
    if (!forwardAxis || !leftEdgeRay || !rightEdgeRay) throw Error('local-stereo-invalid-horizontal-fov');
    const lateralAxis = [-forwardAxis[1], forwardAxis[0], 0];
    if (dot(leftEdgeRay, forwardAxis) <= 1e-6 || dot(rightEdgeRay, forwardAxis) <= 1e-6) throw Error('local-stereo-invalid-horizontal-fov');
    const toCameraGround = point => {
      const relative = subtract(point, left.center);
      return [dot(relative, forwardAxis), dot(relative, lateralAxis), point[2]];
    };
    const supportedGround = supported.map(sample => ({ ...sample, point: toCameraGround(sample.point), rawPoint: sample.point }));

    // Stereo establishes relief, not rover pose. On a tilted rover, fitting
    // an unconstrained plane to noisy disparity can invert roll and pitch.
    // Use the API attitude plane whenever it is available; retain a raw-data
    // fit only as a defensive fallback for legacy records without attitude.
    const groundPlane = attitudeGroundPlane(left) || fitGroundPlane(supported.map(sample => ({ point: sample.point })));
    const initialResiduals = supportedGround.map(sample => sample.rawPoint[2] - planeElevation(groundPlane, sample.rawPoint[0], sample.rawPoint[1]));
    const residualMedian = median(initialResiduals);
    const residualMad = median(initialResiduals.map(value => Math.abs(value - residualMedian)));
    const robustResidualLimit = Math.max(.15, Math.min(1.2, 3 * 1.4826 * residualMad));
    let supportedGroundFiltered = supportedGround.filter(sample => Math.abs(sample.rawPoint[2] - planeElevation(groundPlane, sample.rawPoint[0], sample.rawPoint[1]) - residualMedian) <= robustResidualLimit);
    if (supportedGroundFiltered.length < 16) throw Error('local-stereo-outlier-rejection-left-too-few-samples');
    const medianDepthSigma = median(supportedGroundFiltered.map(depthSigma));
    const heightLimitMeters = clamp(Math.max(.18, medianDepthSigma * 3), .18, .75);

    // The grid is the camera's ground-plane viewing frustum, not an arbitrary
    // rectangle. Equal side vertex count still yields trapezoidal terrain.
    const verticesPerSide = clamp(Math.round(Number(requestedVerticesPerSide) || 49), 17, 161);
    const segments = verticesPerSide - 1;
    // Keep the near edge close to the rover rather than deriving it from the
    // sparse disparity cloud. Otherwise a distant-only point cloud makes the
    // two frustum widths almost equal and visually collapses the trapezoid.
    const minForward = .5;
    const maxForward = clamp(percentile(supportedGroundFiltered.map(sample => sample.point[0]), .95), minForward + 3, 30);
    // Intersect the two real, distortion-corrected horizontal edge rays with
    // each forward slice. This preserves asymmetric camera placement too.
    const lateralAtForward = (ray, forward) => forward * dot(ray, lateralAxis) / dot(ray, forwardAxis);
    const lateralBounds = forward => {
      const first = lateralAtForward(leftEdgeRay, forward);
      const second = lateralAtForward(rightEdgeRay, forward);
      return first <= second ? [first, second] : [second, first];
    };
    const buckets = Array.from({ length: verticesPerSide * verticesPerSide }, () => []);
    for (const sample of supportedGroundFiltered) {
      const forwardRatio = clamp((sample.point[0] - minForward) / (maxForward - minForward), 0, 1);
      const [minimumLateral, maximumLateral] = lateralBounds(sample.point[0]);
      if (sample.point[1] < minimumLateral || sample.point[1] > maximumLateral) continue;
      const column = Math.round(forwardRatio * segments);
      const row = Math.round(clamp((sample.point[1] - minimumLateral) / (maximumLateral - minimumLateral), 0, 1) * segments);
      const residual = clamp(sample.rawPoint[2] - planeElevation(groundPlane, sample.rawPoint[0], sample.rawPoint[1]), -heightLimitMeters, heightLimitMeters);
      buckets[row * verticesPerSide + column].push(residual);
    }
    const positions = new Float32Array(verticesPerSide * verticesPerSide * 3);
    const uvs = new Float32Array(verticesPerSide * verticesPerSide * 2);
    for (let row = 0; row < verticesPerSide; row += 1) for (let column = 0; column < verticesPerSide; column += 1) {
      const index = row * verticesPerSide + column;
      const forward = minForward + column / segments * (maxForward - minForward);
      const [minimumLateral, maximumLateral] = lateralBounds(forward);
      const lateral = minimumLateral + row / segments * (maximumLateral - minimumLateral);
      const pointX = left.center[0] + forwardAxis[0] * forward + lateralAxis[0] * lateral;
      const pointY = left.center[1] + forwardAxis[1] * forward + lateralAxis[1] * lateral;
      const elevation = planeElevation(groundPlane, pointX, pointY) + (buckets[index].length ? median(buckets[index]) : 0);
      const point = [pointX, pointY, elevation];
      positions.set(point, index * 3);
      const pixel = projectCameraPoint(left, point);
      uvs.set(textureUvForPixel(pixel, sourceWidth, sourceHeight), index * 2);
    }
    const indices = [];
    for (let row = 0; row < segments; row += 1) for (let column = 0; column < segments; column += 1) {
      const a = row * verticesPerSide + column, b = a + 1, c = a + verticesPerSide, d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
    const indexBuffer = new Uint32Array(indices);
    self.postMessage({ ok: true, gridWidth: verticesPerSide, gridHeight: verticesPerSide, valid: supportedGroundFiltered.length, heightLimitMeters, medianDepthSigma, positions, uvs, indices: indexBuffer }, [positions.buffer, uvs.buffer, indexBuffer.buffer]);
  } catch (error) {
    self.postMessage({ ok: false, stage, error: error?.message || 'local-stereo-worker-failed' });
  }
};
