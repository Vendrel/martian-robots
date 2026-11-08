// Camera-model primitives shared by the stereo worker and the 3D reference
// patch. Pixel coordinates always use the delivered image domain: x grows to
// the right and y grows down from the source image's upper-left corner.

function dot(left, right) { return left[0] * right[0] + left[1] * right[1] + left[2] * right[2]; }
function subtract(left, right) { return [left[0] - right[0], left[1] - right[1], left[2] - right[2]]; }
function scale(vector, factor) { return vector.map(value => value * factor); }
function add(left, right) { return left.map((value, index) => value + right[index]); }
function cross(left, right) { return [left[1] * right[2] - left[2] * right[1], left[2] * right[0] - left[0] * right[2], left[0] * right[1] - left[1] * right[0]]; }

export function normalize(vector) {
  const length = Math.hypot(...vector);
  return Number.isFinite(length) && length > 0 ? scale(vector, 1 / length) : null;
}

function normalizedAxis(camera) { return normalize(camera?.A || camera?.axis); }
function cameraType(camera) { return String(camera?.type || 'CAHV').toUpperCase(); }
function opticalAxis(camera, axis) { return normalize(camera?.O || axis) || axis; }

/** Convert a delivered-image pixel to an undistorted ROVER_NAV viewing ray. */
export function cameraRayForPixel(camera, pixelX, pixelY) {
  const axis = normalizedAxis(camera);
  const horizontalModel = camera?.H || camera?.hRaw;
  const verticalModel = camera?.V || camera?.vRaw;
  if (!axis || !Array.isArray(horizontalModel) || !Array.isArray(verticalModel)) return null;
  const vertical = subtract(verticalModel, scale(axis, pixelY));
  const horizontal = subtract(horizontalModel, scale(axis, pixelX));
  let ray = normalize(cross(vertical, horizontal));
  if (!ray) return null;
  if (dot(ray, axis) < 0) ray = scale(ray, -1);
  return undistortCameraRay(camera, ray, axis);
}

/** Inverse CAHVOR/CAHVORE lens mapping used by the panorama renderer. */
export function undistortCameraRay(camera, ray, fallbackAxis = normalizedAxis(camera)) {
  const type = cameraType(camera);
  if (type === 'CAHV') return ray;
  const axis = fallbackAxis || normalizedAxis(camera);
  if (!axis) return null;
  const optical = opticalAxis(camera, axis);
  const omega = dot(ray, optical);
  if (Math.abs(omega) < 1e-12) return null;
  const lateral = subtract(ray, scale(optical, omega));
  const [r0 = 0, r1 = 0, r2 = 0] = camera.R || [];
  if (type === 'CAHVOR') {
    const tau = dot(lateral, lateral) / (omega * omega);
    const k1 = 1 + r0, k3 = r1 * tau, k5 = r2 * tau * tau;
    let scaleFactor = 1 - (r0 + k3 + k5);
    for (let iteration = 0; iteration < 20; iteration += 1) {
      const square = scaleFactor * scaleFactor;
      const derivative = (5 * k5 * square + 3 * k3) * square + k1;
      if (Math.abs(derivative) < 1e-12) return null;
      const delta = (((k5 * square + k3) * square + k1) * scaleFactor - 1) / derivative;
      scaleFactor -= delta;
      if (Math.abs(delta) < 1e-10) break;
    }
    return normalize(subtract(ray, scale(lateral, 1 - scaleFactor)));
  }
  if (type !== 'CAHVORE') return ray;
  const lateralLength = Math.hypot(...lateral);
  const distortedAngle = lateralLength / omega;
  if (Math.abs(distortedAngle) < 1e-9) return optical;
  let angle = distortedAngle;
  for (let iteration = 0; iteration < 20; iteration += 1) {
    const square = angle * angle;
    const fourth = square * square;
    const derivative = 1 + r0 + 3 * r1 * square + 5 * r2 * fourth;
    if (Math.abs(derivative) < 1e-12) return null;
    const delta = ((1 + r0) * angle + r1 * angle * square + r2 * angle * fourth - distortedAngle) / derivative;
    angle -= delta;
    if (Math.abs(delta) < 1e-10) break;
  }
  const linearity = camera.lensType === 2 ? 0 : camera.lensType === 3 ? camera.lensParameter : 1;
  const linearAngle = linearity * angle;
  const theta = linearity < -1e-12 ? Math.asin(linearAngle) / linearity : linearity > 1e-12 ? Math.atan(linearAngle) / linearity : angle;
  return Number.isFinite(theta) ? normalize(add(scale(optical, Math.cos(theta)), scale(lateral, Math.sin(theta) / lateralLength))) : null;
}

// The forward mapping is the mathematical inverse of the two routines above.
// It is needed when a reconstructed ROVER_NAV point receives its texture UV.
function distortCameraRay(camera, ray) {
  const type = cameraType(camera);
  if (type === 'CAHV') return ray;
  const axis = normalizedAxis(camera);
  if (!axis) return null;
  const optical = opticalAxis(camera, axis);
  const omega = dot(ray, optical);
  if (!Number.isFinite(omega) || omega <= 1e-12) return null;
  const lateral = subtract(ray, scale(optical, omega));
  const lateralLength = Math.hypot(...lateral);
  const [r0 = 0, r1 = 0, r2 = 0] = camera.R || [];
  if (type === 'CAHVOR') {
    const tau = lateralLength * lateralLength / (omega * omega);
    const mu = r0 + r1 * tau + r2 * tau * tau;
    return add(ray, scale(lateral, mu));
  }
  if (type !== 'CAHVORE') return ray;
  if (lateralLength < 1e-12) return optical;
  const theta = Math.atan2(lateralLength, omega);
  const linearity = camera.lensType === 2 ? 0 : camera.lensType === 3 ? camera.lensParameter : 1;
  const chi = linearity < -1e-12 ? Math.sin(linearity * theta) / linearity : linearity > 1e-12 ? Math.tan(linearity * theta) / linearity : theta;
  const distortedAngle = (1 + r0) * chi + r1 * chi ** 3 + r2 * chi ** 5;
  return add(optical, scale(lateral, distortedAngle / lateralLength));
}

/** Project a ROVER_NAV point into the delivered-image pixel domain. */
export function projectCameraPoint(camera, point) {
  const center = camera?.C || camera?.center;
  const axis = normalizedAxis(camera);
  const horizontalModel = camera?.H || camera?.hRaw;
  const verticalModel = camera?.V || camera?.vRaw;
  if (!Array.isArray(center) || !axis || !Array.isArray(horizontalModel) || !Array.isArray(verticalModel)) return null;
  const direction = normalize(subtract(point, center));
  if (!direction) return null;
  const distorted = distortCameraRay(camera, direction);
  if (!distorted) return null;
  const denominator = dot(axis, distorted);
  if (!Number.isFinite(denominator) || denominator <= 1e-12) return null;
  return [dot(horizontalModel, distorted) / denominator, dot(verticalModel, distorted) / denominator];
}

/** Canonical Three.js UV for an API image pixel (Three's V grows upward). */
export function textureUvForPixel(pixel, width, height) {
  if (!pixel || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return [.5, .5];
  const clamp = value => Math.max(0, Math.min(1, value));
  return [clamp(pixel[0] / width), 1 - clamp(pixel[1] / height)];
}
