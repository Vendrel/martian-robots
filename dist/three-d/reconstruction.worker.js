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
  return { center: camera.C, axis, horizontal, vertical, hCenter, vCenter, focal };
}

function cameraRay(camera, pixelX, pixelY) {
  return normalize(add(camera.axis, add(scale(camera.horizontal, (pixelX - camera.hCenter) / camera.focal), scale(camera.vertical, (pixelY - camera.vCenter) / camera.focal))));
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

function bestDisparity(left, right, width, height, x, y, maxDisparity) {
  const radius = 2;
  if (x < maxDisparity + radius || x >= width - radius || y < radius || y >= height - radius) return null;
  let best = null;
  let second = Infinity;
  for (let disparity = 1; disparity <= maxDisparity; disparity += 1) {
    let error = 0;
    for (let dy = -radius; dy <= radius; dy += 1) for (let dx = -radius; dx <= radius; dx += 1) {
      error += Math.abs(left[(y + dy) * width + x + dx] - right[(y + dy) * width + x - disparity + dx]);
    }
    if (error < (best?.error ?? Infinity)) { second = best?.error ?? Infinity; best = { disparity, error }; }
    else if (error < second) second = error;
  }
  // Textureless regions and repeated patterns have no reliable winner.
  return best && second > best.error * 1.02 && best.error < 2100 ? best.disparity : null;
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

function projectCahv(camera, point) {
  const direction = subtract(point, camera.center);
  const denominator = dot(camera.axis, direction);
  if (!Number.isFinite(denominator) || denominator <= 0) return null;
  return [dot(camera.hRaw, direction) / denominator, dot(camera.vRaw, direction) / denominator];
}

self.onmessage = event => {
  let stage = 'input';
  try {
    const { leftBitmap, rightBitmap, leftCamera, rightCamera } = event.data;
    // Five times as many grid samples as the former 60×40 seed grid.
    const width = 360, height = 240, gridWidth = 120, gridHeight = 100, maxDisparity = 54, maxRangeMeters = 30;
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
    left.hRaw = leftCamera.H;
    left.vRaw = leftCamera.V;
    const rawPoints = [];
    let valid = 0;
    stage = 'disparity-triangulation';
    for (let gridY = 0; gridY < gridHeight; gridY += 1) for (let gridX = 0; gridX < gridWidth; gridX += 1) {
      const x = Math.floor((gridX + .5) / gridWidth * width), y = Math.floor((gridY + .5) / gridHeight * height);
      const disparity = bestDisparity(leftPixels, rightPixels, width, height, x, y, maxDisparity);
      if (!disparity) continue;
      const triangulation = triangulate(left, cameraRay(left, x * sourceScaleX, y * sourceScaleY), right, cameraRay(right, (x - disparity) * rightScaleX, y * rightScaleY));
      if (!triangulation || triangulation.range > maxRangeMeters) continue;
      rawPoints.push(triangulation.point);
      valid += 1;
    }
    if (rawPoints.length < 16) throw Error('local-stereo-insufficient-samples');
    stage = 'mesh-output';
    // Build one continuous terrain heightfield. Stereo only modifies the
    // elevation of cells it supports; unknown terrain stays on the base plane.
    const columns = 48, rows = 38;
    const baseElevation = median(rawPoints.map(point => point[2]));
    let minForward = Math.max(-5, percentile(rawPoints.map(point => point[0]), .05));
    let maxForward = Math.min(30, percentile(rawPoints.map(point => point[0]), .95));
    let minLateral = Math.max(-15, percentile(rawPoints.map(point => point[1]), .05));
    let maxLateral = Math.min(15, percentile(rawPoints.map(point => point[1]), .95));
    if (maxForward - minForward < 3) { minForward -= 3; maxForward += 3; }
    if (maxLateral - minLateral < 3) { minLateral -= 3; maxLateral += 3; }
    const buckets = Array.from({ length: (columns + 1) * (rows + 1) }, () => []);
    for (const point of rawPoints) {
      if (Math.abs(point[2] - baseElevation) > 3) continue;
      const column = Math.max(0, Math.min(columns, Math.round((point[0] - minForward) / (maxForward - minForward) * columns)));
      const row = Math.max(0, Math.min(rows, Math.round((point[1] - minLateral) / (maxLateral - minLateral) * rows)));
      buckets[row * (columns + 1) + column].push(point[2]);
    }
    const positions = new Float32Array((columns + 1) * (rows + 1) * 3);
    const uvs = new Float32Array((columns + 1) * (rows + 1) * 2);
    for (let row = 0; row <= rows; row += 1) for (let column = 0; column <= columns; column += 1) {
      const index = row * (columns + 1) + column;
      const forward = minForward + column / columns * (maxForward - minForward);
      const lateral = minLateral + row / rows * (maxLateral - minLateral);
      const elevation = buckets[index].length ? median(buckets[index]) : baseElevation;
      positions.set([forward, lateral, elevation], index * 3);
      const pixel = projectCahv(left, [forward, lateral, elevation]);
      uvs.set(pixel ? [Math.max(0, Math.min(1, pixel[0] / sourceWidth)), 1 - Math.max(0, Math.min(1, pixel[1] / sourceHeight))] : [.5, .5], index * 2);
    }
    const indices = [];
    for (let row = 0; row < rows; row += 1) for (let column = 0; column < columns; column += 1) {
      const a = row * (columns + 1) + column, b = a + 1, c = a + columns + 1, d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
    const indexBuffer = new Uint32Array(indices);
    self.postMessage({ ok: true, gridWidth: columns + 1, gridHeight: rows + 1, valid, positions, uvs, indices: indexBuffer }, [positions.buffer, uvs.buffer, indexBuffer.buffer]);
  } catch (error) {
    self.postMessage({ ok: false, stage, error: error?.message || 'local-stereo-worker-failed' });
  }
};
