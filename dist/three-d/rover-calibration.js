export const ROVER_CALIBRATION_FORMAT = 'martian-robots-rover-calibration/v1';
// Keep this as an explicit product switch. It is deliberately not persisted:
// hiding the reference must never change a saved rover pose.
export const ROVER_CALIBRATION_CUBE = true;

export const DEFAULT_ROVER_CALIBRATION = Object.freeze({
  format: ROVER_CALIBRATION_FORMAT,
  // This is a bundled preview asset. Its transform remains unverified until
  // the model-frame audit records a calibration against the scene frame.
  assetPath: './models/curiosity-rover/curiosity-rover.gltf',
  // The imported GLB orientation is not yet audited against the scene frame.
  // These explicit zero defaults are calibration inputs, not a claim of pose.
  positionMeters: Object.freeze([0, 0, 0]),
  rotationDegrees: Object.freeze([0, 0, 0]),
  // The source model's coordinates are centimetre-scale (about 3 m wide),
  // while the preview scene uses metres. The value is still a provisional
  // calibration until the model-frame audit is complete.
  scale: 0.01,
  modelUnit: 'centimetre',
  cubePositionMeters: Object.freeze([1, .25, 0]),
  // GLTF-model-frame offset to the PDS ROVER_NAV_FRAME origin. The audited
  // source model already places its ground-level origin at this pivot; keep
  // this explicit so a future audited asset can supply a non-zero correction.
  modelPivotOffsetMeters: Object.freeze([0, 0, 0]),
  // The API attitude at the location where this manual model alignment was
  // established. Future locations apply only their relative attitude delta.
  orientationReferenceWxyz: null,
  calibrated: false,
  assetHash: null,
});

function finiteVector(value, fallback) {
  return Array.isArray(value) && value.length === 3 && value.every(Number.isFinite) ? [...value] : [...fallback];
}

function finiteQuaternion(value) {
  return Array.isArray(value) && value.length === 4 && value.every(Number.isFinite) && Math.hypot(...value) > 0 ? [...value] : null;
}

export function normalizeRoverCalibration(value = {}) {
  const legacyPreviewScale = value.modelUnit === undefined && Number(value.scale) === 1 ? DEFAULT_ROVER_CALIBRATION.scale : Number(value.scale);
  const assetPath = value.assetPath === './models/curiosity-rover.glb' ? DEFAULT_ROVER_CALIBRATION.assetPath : value.assetPath;
  return {
    format: ROVER_CALIBRATION_FORMAT,
    assetPath: typeof assetPath === 'string' && assetPath ? assetPath : DEFAULT_ROVER_CALIBRATION.assetPath,
    positionMeters: finiteVector(value.positionMeters, DEFAULT_ROVER_CALIBRATION.positionMeters),
    rotationDegrees: finiteVector(value.rotationDegrees, DEFAULT_ROVER_CALIBRATION.rotationDegrees),
    scale: Number.isFinite(legacyPreviewScale) && legacyPreviewScale > 0 ? legacyPreviewScale : DEFAULT_ROVER_CALIBRATION.scale,
    modelUnit: DEFAULT_ROVER_CALIBRATION.modelUnit,
    cubePositionMeters: finiteVector(value.cubePositionMeters, DEFAULT_ROVER_CALIBRATION.cubePositionMeters),
    modelPivotOffsetMeters: finiteVector(value.modelPivotOffsetMeters, DEFAULT_ROVER_CALIBRATION.modelPivotOffsetMeters),
    orientationReferenceWxyz: finiteQuaternion(value.orientationReferenceWxyz),
    calibrated: value.calibrated === true,
    assetHash: typeof value.assetHash === 'string' && value.assetHash ? value.assetHash : null,
  };
}

