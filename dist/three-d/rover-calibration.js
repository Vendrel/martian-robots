export const ROVER_CALIBRATION_FORMAT = 'martian-robots-rover-calibration/v5';
// Keep this as an explicit product switch. It is deliberately not persisted:
// hiding the reference must never change a saved rover pose.
export const ROVER_CALIBRATION_CUBE = false;

export const DEFAULT_ROVER_CALIBRATION = Object.freeze({
  format: ROVER_CALIBRATION_FORMAT,
  // Audited Curiosity GLTF → ROVER_NAV correction. The source asset's pivot,
  // axes and scale are not aligned to the rover navigation frame.
  assetPath: './models/curiosity-rover/curiosity-rover.gltf',
  positionMeters: Object.freeze([-1.3, -1.25, -.93]),
  rotationDegrees: Object.freeze([-90, 53, 0]),
  scale: 5.8,
  modelUnit: 'metre',
  cubePositionMeters: Object.freeze([1, .25, 0]),
  // GLTF-model-frame offset to the PDS ROVER_NAV_FRAME origin. The audited
  // source model already places its ground-level origin at this pivot; keep
  // this explicit so a future audited asset can supply a non-zero correction.
  modelPivotOffsetMeters: Object.freeze([0, 0, 0]),
  calibrated: true,
  assetHash: null,
});

export const ROVER_ASSET_PATHS = Object.freeze({
  curiosity: './models/curiosity-rover/curiosity-rover.gltf',
  perseverance: './models/perseverance-rover.glb',
});
const PERSEVERANCE_GLB_RNAV_FRAME_VERSION = 'perseverance-glb-rnav-v1';
const CURIOSITY_GLTF_RNAV_FRAME_VERSION = 'curiosity-gltf-rnav-v2';

export function roverAssetPath(rover) {
  return ROVER_ASSET_PATHS[rover] || ROVER_ASSET_PATHS.curiosity;
}

export function defaultRoverCalibrationFor(rover) {
  const perseverance = rover === 'perseverance';
  return normalizeRoverCalibration({
    ...DEFAULT_ROVER_CALIBRATION,
    assetPath: roverAssetPath(rover),
    ...(perseverance ? {
      // Static GLB → ROVER_NAV correction. The time-varying SITE heading is
      // deliberately not stored here; it comes from PDS Rover PLACES.
      positionMeters: [.09, 0, .25],
      rotationDegrees: [-90, 90, 0],
      scale: 1,
      modelUnit: 'metre',
      modelFrameVersion: PERSEVERANCE_GLB_RNAV_FRAME_VERSION,
      calibrated: false,
    } : { modelFrameVersion: CURIOSITY_GLTF_RNAV_FRAME_VERSION }),
  });
}

export function needsRoverAssetFrameMigration(rover, calibration) {
  if (rover === 'curiosity') return calibration?.modelFrameVersion !== CURIOSITY_GLTF_RNAV_FRAME_VERSION;
  return rover === 'perseverance' && calibration?.modelFrameVersion !== PERSEVERANCE_GLB_RNAV_FRAME_VERSION;
}

function finiteVector(value, fallback) {
  return Array.isArray(value) && value.length === 3 && value.every(Number.isFinite) ? [...value] : [...fallback];
}

export function normalizeRoverCalibration(value = {}) {
  // Earlier fields were authored in a different render/frame chain. They
  // cannot be migrated safely to the documented ROVER_NAV frame, so reset.
  if (value.format && value.format !== ROVER_CALIBRATION_FORMAT) value = {};
  const legacyPreviewScale = Number(value.scale);
  const assetPath = value.assetPath === './models/curiosity-rover.glb' ? DEFAULT_ROVER_CALIBRATION.assetPath : value.assetPath;
  const isPerseveranceAsset = assetPath === ROVER_ASSET_PATHS.perseverance;
  return {
    format: ROVER_CALIBRATION_FORMAT,
    assetPath: typeof assetPath === 'string' && assetPath ? assetPath : DEFAULT_ROVER_CALIBRATION.assetPath,
    positionMeters: finiteVector(value.positionMeters, DEFAULT_ROVER_CALIBRATION.positionMeters),
    rotationDegrees: finiteVector(value.rotationDegrees, DEFAULT_ROVER_CALIBRATION.rotationDegrees),
    scale: Number.isFinite(legacyPreviewScale) && legacyPreviewScale > 0 ? legacyPreviewScale : DEFAULT_ROVER_CALIBRATION.scale,
    modelUnit: isPerseveranceAsset ? 'metre' : DEFAULT_ROVER_CALIBRATION.modelUnit,
    modelFrameVersion: typeof value.modelFrameVersion === 'string' ? value.modelFrameVersion : null,
    cubePositionMeters: finiteVector(value.cubePositionMeters, DEFAULT_ROVER_CALIBRATION.cubePositionMeters),
    modelPivotOffsetMeters: finiteVector(value.modelPivotOffsetMeters, DEFAULT_ROVER_CALIBRATION.modelPivotOffsetMeters),
    calibrated: value.calibrated === true,
    assetHash: typeof value.assetHash === 'string' && value.assetHash ? value.assetHash : null,
  };
}

function equalVector(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/** A generated default record must not prevent an asset-frame migration. */
export function isPristineRoverCalibration(value) {
  const calibration = normalizeRoverCalibration(value);
  return calibration.calibrated === DEFAULT_ROVER_CALIBRATION.calibrated
    && calibration.scale === DEFAULT_ROVER_CALIBRATION.scale
    && equalVector(calibration.positionMeters, DEFAULT_ROVER_CALIBRATION.positionMeters)
    && equalVector(calibration.rotationDegrees, DEFAULT_ROVER_CALIBRATION.rotationDegrees)
    && equalVector(calibration.cubePositionMeters, DEFAULT_ROVER_CALIBRATION.cubePositionMeters)
    && equalVector(calibration.modelPivotOffsetMeters, DEFAULT_ROVER_CALIBRATION.modelPivotOffsetMeters);
}

