// Experimental physical translation support for the panorama mesh.
// All positions passed here must already be expressed in the same metre-based
// scene frame. The module intentionally has no knowledge of raw NASA fields.

export const LOCATION_AWARE_PROJECTION_ENABLED = false;
export const LOCATION_AWARE_PROJECTION_BY_ROVER = Object.freeze({
  curiosity: false,
  perseverance: false,
  spirit: false,
  opportunity: false,
});

export const LOCATION_RESOLUTION_MAX_METERS = 25;
export const LOCATION_AWARE_SHELL_RADIUS_METERS = 40;
const BASELINE_EPSILON_METERS = .005;

export function locationResolutionMeters(value) {
  const percent = Math.max(0, Math.min(100, Number(value) || 0));
  return Math.pow(percent / 100, 2) * LOCATION_RESOLUTION_MAX_METERS;
}

export function locationAwareProjectionEnabled(roverKey, {
  enabled = LOCATION_AWARE_PROJECTION_ENABLED,
  enabledByRover = LOCATION_AWARE_PROJECTION_BY_ROVER,
} = {}) {
  return enabled === true && enabledByRover?.[roverKey] === true;
}

export function finiteVector(value) {
  return Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
}

export function subtractVectors(left, right) {
  return left.map((value, index) => value - right[index]);
}

export function addVectors(left, right) {
  return left.map((value, index) => value + right[index]);
}

export function vectorLength(vector) {
  return Math.hypot(...vector);
}

// The reference origin is deliberately the station's rover origin, not an
// averaged camera centre. Camera-specific C offsets remain part of each ray's
// physical pose, while a location-resolution threshold governs rover motion.
export function cameraTranslationInScene({
  roverPosition,
  referenceRoverPosition,
  cameraOffsetInScene,
  maximumRoverBaselineMeters,
}) {
  if (!finiteVector(roverPosition) || !finiteVector(referenceRoverPosition) || !finiteVector(cameraOffsetInScene)) return null;
  const roverTranslation = subtractVectors(roverPosition, referenceRoverPosition);
  const maximum = Number(maximumRoverBaselineMeters);
  if (!Number.isFinite(maximum) || maximum < 0 || vectorLength(roverTranslation) > maximum + BASELINE_EPSILON_METERS) return null;
  return addVectors(roverTranslation, cameraOffsetInScene);
}

// Maps an image ray to a virtual spherical shell centred on the active rover
// station. The shell approximates unknown scene depth; it does not fabricate a
// depth map. viewerOffset remains in the existing unit-shell camera space.
export function locationAwareRayVector({
  ray,
  cameraTranslation,
  viewerOffset,
  parallaxDepth = 1,
  shellRadiusMeters = LOCATION_AWARE_SHELL_RADIUS_METERS,
}) {
  if (!finiteVector(ray) || !finiteVector(cameraTranslation) || !finiteVector(viewerOffset)) return null;
  const shellRadius = Number(shellRadiusMeters);
  const depth = Number(parallaxDepth);
  if (!Number.isFinite(shellRadius) || shellRadius <= 0 || !Number.isFinite(depth) || depth <= 0) return null;
  return ray.map((value, index) => value * shellRadius * depth + cameraTranslation[index] - viewerOffset[index] * shellRadius);
}
