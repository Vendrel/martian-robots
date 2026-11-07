import { DEFAULT_ROVER_CALIBRATION, normalizeRoverCalibration } from './rover-calibration.js';

const DATABASE_NAME = 'martian-robots-3d/v1';
const CALIBRATION_STORE = 'rover-calibrations';
const MESH_CALIBRATION_STORE = 'mesh-calibrations';
const SCENE_CALIBRATION_STORE = 'scene-calibrations';
export const MESH_CALIBRATION_FORMAT = 'martian-robots-pds-mesh-calibration/v7';
const LOCAL_MESH_CALIBRATION_FORMAT = 'martian-robots-local-mesh-calibration/v4';
const PANORAMA_CALIBRATION_FORMAT = 'martian-robots-panorama-calibration/v3';

export const DEFAULT_MESH_CALIBRATION = Object.freeze({
  // Start every PDS/local comparison in the documented neutral frame. A mesh
  // calibration is an explicit user action, not an inferred asset property.
  format: MESH_CALIBRATION_FORMAT,
  positionMeters: Object.freeze([0, 0, 0]),
  rotationDegrees: Object.freeze([0, 0, 0]),
  scale: 1,
  calibrated: false,
});
export const DEFAULT_LOCAL_MESH_CALIBRATION = Object.freeze({ format: LOCAL_MESH_CALIBRATION_FORMAT, positionMeters: Object.freeze([0, 0, 0]), rotationDegrees: Object.freeze([0, 0, 0]), scale: 1, calibrated: false });
export const DEFAULT_PANORAMA_CALIBRATION = Object.freeze({ format: PANORAMA_CALIBRATION_FORMAT, rotationDegrees: Object.freeze([0, 0, 0]), calibrated: false });

function finiteVector(value, fallback) {
  return Array.isArray(value) && value.length === 3 && value.every(Number.isFinite) ? [...value] : [...fallback];
}

export function normalizeMeshCalibration(value = {}) {
  const scale = Number(value.scale);
  return {
    format: MESH_CALIBRATION_FORMAT,
    positionMeters: finiteVector(value.positionMeters, DEFAULT_MESH_CALIBRATION.positionMeters),
    rotationDegrees: finiteVector(value.rotationDegrees, DEFAULT_MESH_CALIBRATION.rotationDegrees),
    scale: Number.isFinite(scale) && scale > 0 ? scale : DEFAULT_MESH_CALIBRATION.scale,
    calibrated: value.calibrated === true,
  };
}

function normalizeLocalMeshCalibration(value = {}) {
  if (value.format !== LOCAL_MESH_CALIBRATION_FORMAT) value = {};
  const scale = Number(value.scale);
  return { format: LOCAL_MESH_CALIBRATION_FORMAT, positionMeters: finiteVector(value.positionMeters, DEFAULT_LOCAL_MESH_CALIBRATION.positionMeters), rotationDegrees: finiteVector(value.rotationDegrees, DEFAULT_LOCAL_MESH_CALIBRATION.rotationDegrees), scale: Number.isFinite(scale) && scale > 0 ? scale : 1, calibrated: value.calibrated === true };
}

function normalizePanoramaCalibration(value = {}) {
  if (value.format !== PANORAMA_CALIBRATION_FORMAT) value = {};
  return { format: PANORAMA_CALIBRATION_FORMAT, rotationDegrees: finiteVector(value.rotationDegrees, DEFAULT_PANORAMA_CALIBRATION.rotationDegrees), calibrated: value.calibrated === true };
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 3);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(CALIBRATION_STORE)) database.createObjectStore(CALIBRATION_STORE, { keyPath: 'rover' });
      if (!database.objectStoreNames.contains(MESH_CALIBRATION_STORE)) database.createObjectStore(MESH_CALIBRATION_STORE, { keyPath: 'key' });
      if (!database.objectStoreNames.contains(SCENE_CALIBRATION_STORE)) database.createObjectStore(SCENE_CALIBRATION_STORE, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || Error('three-d-store-open-failed'));
  });
}

async function withStore(storeName, mode, operation) {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, mode);
      const request = operation(transaction.objectStore(storeName));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || Error('three-d-store-request-failed'));
    });
  } finally {
    database.close();
  }
}

export async function loadRoverCalibrationRecord(rover) {
  const record = await withStore(CALIBRATION_STORE, 'readonly', store => store.get(rover));
  return { calibration: normalizeRoverCalibration(record?.calibration || DEFAULT_ROVER_CALIBRATION), exists: Boolean(record) };
}

export async function loadRoverCalibration(rover) {
  return (await loadRoverCalibrationRecord(rover)).calibration;
}

export async function saveRoverCalibration(rover, calibration) {
  const normalized = normalizeRoverCalibration(calibration);
  await withStore(CALIBRATION_STORE, 'readwrite', store => store.put({ rover, calibration: normalized, updatedAt: new Date().toISOString() }));
  return normalized;
}

export async function loadMeshCalibration(key) {
  const record = await withStore(MESH_CALIBRATION_STORE, 'readonly', store => store.get(key));
  return record?.calibration?.format === MESH_CALIBRATION_FORMAT
    ? normalizeMeshCalibration(record.calibration)
    : normalizeMeshCalibration(DEFAULT_MESH_CALIBRATION);
}

export async function saveMeshCalibration(key, calibration) {
  const normalized = normalizeMeshCalibration({ ...calibration, calibrated: true });
  await withStore(MESH_CALIBRATION_STORE, 'readwrite', store => store.put({ key, calibration: normalized, updatedAt: new Date().toISOString() }));
  return normalized;
}

export async function loadLocalMeshCalibration(key) {
  const record = await withStore(SCENE_CALIBRATION_STORE, 'readonly', store => store.get(`local:${key}`));
  return normalizeLocalMeshCalibration(record?.calibration || DEFAULT_LOCAL_MESH_CALIBRATION);
}

export async function saveLocalMeshCalibration(key, calibration) {
  const normalized = normalizeLocalMeshCalibration({ ...calibration, calibrated: true });
  await withStore(SCENE_CALIBRATION_STORE, 'readwrite', store => store.put({ key: `local:${key}`, calibration: normalized, updatedAt: new Date().toISOString() }));
  return normalized;
}

export async function loadPanoramaCalibration(key) {
  const record = await withStore(SCENE_CALIBRATION_STORE, 'readonly', store => store.get(`panorama:${key}`));
  return normalizePanoramaCalibration(record?.calibration || DEFAULT_PANORAMA_CALIBRATION);
}

export async function savePanoramaCalibration(key, calibration) {
  const normalized = normalizePanoramaCalibration({ ...calibration, calibrated: true });
  await withStore(SCENE_CALIBRATION_STORE, 'readwrite', store => store.put({ key: `panorama:${key}`, calibration: normalized, updatedAt: new Date().toISOString() }));
  return normalized;
}

