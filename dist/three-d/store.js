import { DEFAULT_ROVER_CALIBRATION, normalizeRoverCalibration } from './rover-calibration.js';

const DATABASE_NAME = 'martian-robots-3d/v1';
const CALIBRATION_STORE = 'rover-calibrations';

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(CALIBRATION_STORE, { keyPath: 'rover' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || Error('three-d-store-open-failed'));
  });
}

async function withStore(mode, operation) {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(CALIBRATION_STORE, mode);
      const request = operation(transaction.objectStore(CALIBRATION_STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || Error('three-d-store-request-failed'));
    });
  } finally {
    database.close();
  }
}

export async function loadRoverCalibration(rover) {
  const record = await withStore('readonly', store => store.get(rover));
  return normalizeRoverCalibration(record?.calibration || DEFAULT_ROVER_CALIBRATION);
}

export async function saveRoverCalibration(rover, calibration) {
  const normalized = normalizeRoverCalibration(calibration);
  await withStore('readwrite', store => store.put({ rover, calibration: normalized, updatedAt: new Date().toISOString() }));
  return normalized;
}

