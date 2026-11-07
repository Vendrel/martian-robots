const PDS_ORIGINS = ['https://planetarydata.jpl.nasa.gov/*', 'https://pds-geosciences.wustl.edu/*'];
const NAVCAM_MESH_BUNDLE_URL = 'https://planetarydata.jpl.nasa.gov/img/data/mars2020/mars2020_navcam_ops_mesh/bundle.xml';
const NAVCAM_MESH_SOL_ROOT = 'https://planetarydata.jpl.nasa.gov/img/data/mars2020/mars2020_navcam_ops_mesh/data/sol/';
const NAVCAM_MESH_INVENTORY_URL = 'https://planetarydata.jpl.nasa.gov/img/data/mars2020/mars2020_navcam_ops_mesh/data/collection_data_inventory.csv';
const NAVCAM_STEREO_BUNDLE_LID = 'urn:nasa:pds:mars2020_navcam_ops_stereo';
const ROVER_PLACES_LOCALIZATIONS_URL = 'https://pds-geosciences.wustl.edu/m2020/urn-nasa-pds-mars2020_rover_places/data_localizations/best_interp.csv';
let roverPlacesPromise = null;

function parseCsv(text) {
  const [header, ...rows] = text.trim().split(/\r?\n/);
  const columns = header.split(',');
  return rows.map(row => {
    const values = row.split(',');
    return Object.fromEntries(columns.map((column, index) => [column, values[index] ?? '']));
  });
}

async function roverPlaces() {
  roverPlacesPromise ||= fetch(ROVER_PLACES_LOCALIZATIONS_URL, { cache: 'force-cache' }).then(async response => {
    if (!response.ok) throw Error(`pds-rover-places-http-${response.status}`);
    return parseCsv(await response.text());
  });
  return roverPlacesPromise;
}

function rmcValue(label, indexName) {
  const expression = new RegExp(`<geom:index_id>\\s*${indexName}\\s*<\\/geom:index_id>\\s*<geom:index_value_number>\\s*(-?\\d+)\\s*<\\/geom:index_value_number>`, 'i');
  return Number(label.match(expression)?.[1]);
}

async function roverSitePosition(label) {
  const site = rmcValue(label, 'site');
  const drive = rmcValue(label, 'drive');
  if (!Number.isInteger(site) || !Number.isInteger(drive)) throw Error('pds-mesh-rmc-missing');
  const rows = await roverPlaces();
  const siteRow = rows.find(row => row.frame === 'SITE' && Number(row.site) === site && Number(row.drive) === -1);
  const roverRow = rows.find(row => row.frame === 'ROVER' && Number(row.site) === site && Number(row.drive) === drive);
  if (!siteRow || !roverRow) throw Error('pds-rover-localization-missing');
  const fields = ['landing_x', 'landing_y', 'landing_z'];
  const position = fields.map(field => Number(roverRow[field]) - Number(siteRow[field]));
  if (!position.every(Number.isFinite)) throw Error('pds-rover-localization-invalid');
  return { rmc: { site, drive }, position };
}

async function requestPdsOrigins() {
  if (!globalThis.chrome?.permissions) throw Error('extension-permissions-unavailable');
  if (await chrome.permissions.contains({ origins: PDS_ORIGINS })) return true;
  return chrome.permissions.request({ origins: PDS_ORIGINS });
}

/**
 * Phase-2 provenance gate. Do not guess product filenames from rover-image
 * IDs: the PDS bundle inventory/labels remain the authority for a later mesh
 * importer. This verifies that the extension can read that authoritative root.
 */
export async function probePerseverancePdsSources() {
  if (!await requestPdsOrigins()) throw Error('pds-permission-denied');
  const response = await fetch(NAVCAM_MESH_BUNDLE_URL, { cache: 'no-cache' });
  if (!response.ok) throw Error(`pds-mesh-bundle-http-${response.status}`);
  const xml = await response.text();
  if (!xml.includes('mars2020_navcam_ops_mesh')) throw Error('pds-mesh-bundle-invalid');
  return Object.freeze({
    meshBundleUrl: NAVCAM_MESH_BUNDLE_URL,
    stereoBundleLid: NAVCAM_STEREO_BUNDLE_LID,
    meshFormat: 'OBJ + MTL + PNG',
  });
}

/** Return the first PDS mesh product plus the complete Sol product list. */
export async function findPerseverancePdsMesh(sol) {
  if (!await requestPdsOrigins()) throw Error('pds-permission-denied');
  const solPath = String(Math.max(0, Number(sol) || 0)).padStart(5, '0');
  // PDS4 archive layout: sol/{SSSSS}/ids/rdr/mesh/ contains the OBJ, MTL,
  // label and texture products. The Sol directory itself only contains ids/.
  const directoryUrl = new URL(`${solPath}/ids/rdr/mesh/`, NAVCAM_MESH_SOL_ROOT).href;
  const response = await fetch(directoryUrl, { cache: 'no-cache' });
  if (!response.ok) throw Error(`pds-sol-index-http-${response.status}`);
  const html = await response.text();
  const objHrefs = [...new Set([...html.matchAll(/href=["']([^"']+\.obj)["']/gi)].map(match => match[1]))];
  const objHref = objHrefs[0];
  if (!objHref) return null;
  const objUrl = new URL(objHref, directoryUrl).href;
  const labelUrl = `${objUrl}.xml`;
  const labelResponse = await fetch(labelUrl, { cache: 'force-cache' });
  if (!labelResponse.ok) throw Error(`pds-mesh-label-http-${labelResponse.status}`);
  const label = await labelResponse.text();
  const coordinateFrame = label.match(/<geom:coordinate_space_frame_type>\s*([^<\s]+)\s*<\/geom:coordinate_space_frame_type>/i)?.[1] || null;
  if (!coordinateFrame) throw Error('pds-mesh-coordinate-frame-missing');
  const localization = await roverSitePosition(label);
  return Object.freeze({
    sol: Number(sol),
    objUrl,
    labelUrl,
    coordinateFrame,
    roverSitePositionMeters: localization.position,
    rmc: localization.rmc,
    productUrls: objHrefs.map(href => new URL(href, directoryUrl).href),
    provenance: 'PDS Mars 2020 Navcam Operations Terrain Mesh',
  });
}

/**
 * A current web panorama can be newer than the public mesh archive. Use an
 * inventory-derived nearest Sol only as an explicitly labelled visual sample,
 * never as geometry for the active reconstruction scene.
 */
export async function findNearestPublishedPerseverancePdsMesh(sol) {
  if (!await requestPdsOrigins()) throw Error('pds-permission-denied');
  const inventoryResponse = await fetch(NAVCAM_MESH_INVENTORY_URL, { cache: 'no-cache' });
  if (!inventoryResponse.ok) throw Error(`pds-mesh-inventory-http-${inventoryResponse.status}`);
  const text = await inventoryResponse.text();
  const sols = [...new Set([...text.matchAll(/\/sol\/(\d{5})\//g)].map(match => Number(match[1])))].sort((left, right) => Math.abs(left - sol) - Math.abs(right - sol));
  for (const candidate of sols.slice(0, 24)) {
    const mesh = await findPerseverancePdsMesh(candidate);
    if (mesh) return { ...mesh, requestedSol: Number(sol), fallback: candidate !== Number(sol) };
  }
  return null;
}
