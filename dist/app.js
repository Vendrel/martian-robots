const $ = (selector) => document.querySelector(selector);
const dictionary = window.localeDictionary;

const roverCatalog = {
  curiosity: { name: 'Curiosity', short: 'MSL · Curiosity', source: 'nasa-msl', sols: [4544, 4543, 4542] },
  perseverance: { name: 'Perseverance', short: 'Mars 2020 · Perseverance', source: 'nasa-m2020', sols: [] },
  spirit: { name: 'Spirit', short: 'MER-A · Spirit', source: 'pds-mer', sols: [] },
  opportunity: { name: 'Opportunity', short: 'MER-B · Opportunity', source: 'pds-mer', sols: [] },
};

const geometrySample = [
  { imageid: 'NLB_800890839EDR_F1160576NCAM00354M_', instrument: 'NAV_LEFT_B', sol: 4544, site: 116, drive: 576, date_taken: '2025-05-19T02:46:14.000Z', camera_model_type: 'CAHVOR', camera_position: '(0.823373,0.796051,-1.84555)', camera_vector: '(-0.590989,0.339228,0.731885)', camera_model_component_list: '(0.823373,0.796051,-1.84555);(-0.59358,0.345816,0.726675);(-917.709,-882.761,367.649);(470.356,-274.807,1206.71)', attitude: '(0.486334,0.00493039,0.0196115,-0.873539)', extended: { mast_az: '150.11', mast_el: '-47.02' }, https_url: 'https://mars.nasa.gov/msl-raw-images/proj/msl/redops/ods/surface/sol/04544/opgs/edr/ncam/NLB_800890839EDR_F1160576NCAM00354M_.JPG' },
  { imageid: 'NLB_800890885EDR_F1160576CCAM04543M_', instrument: 'NAV_LEFT_B', sol: 4544, site: 116, drive: 576, date_taken: '2025-05-19T02:46:59.000Z', camera_model_type: 'CAHVOR', camera_position: '(1.01824,0.66274,-1.84565)', camera_vector: '(-0.005995,0.68287,0.730515)', camera_model_component_list: '(1.01824,0.66274,-1.84565);(-0.001607,0.68842,0.725299);(-1225.54,347.088,366.335);(-0.293737,-542.331,1207.8)', attitude: '(0.486334,0.00493039,0.0196115,-0.873539)', extended: { mast_az: '90.47', mast_el: '-46.91' }, https_url: 'https://mars.nasa.gov/msl-raw-images/proj/msl/redops/ods/surface/sol/04544/opgs/edr/ncam/NLB_800890885EDR_F1160576CCAM04543M_.JPG' },
  { imageid: 'NRB_800889651EDR_F1160576NCAM00354M_', instrument: 'NAV_RIGHT_B', sol: 4544, site: 116, drive: 576, date_taken: '2025-05-19T02:26:29.000Z', camera_model_type: 'CAHVOR', camera_position: '(0.832, -0.795, -1.84)', camera_vector: '(0.63,0.34,0.69)', camera_model_component_list: '(0.832,-0.795,-1.84);(0.63,0.34,0.69);(1010,570,370);(-280,520,1210)', attitude: '(0.486334,0.00493039,0.0196115,-0.873539)', extended: { mast_az: '28.2', mast_el: '-42.5' }, https_url: 'https://mars.nasa.gov/msl-raw-images/proj/msl/redops/ods/surface/sol/04544/opgs/edr/ncam/NLB_800890839EDR_F1160576NCAM00354M_.JPG' },
];

const state = { rover: 'curiosity', images: [], offset: 0, pointer: null, active: null, altTarget: null, dragging: false, dragStart: 0, startOffset: 0, usedFallback: false };
const canvas = $('#panoramaCanvas');
const ctx = canvas.getContext('2d');
const wrap = $('#panoramaWrap');

function translate() {
  document.querySelectorAll('[data-i18n]').forEach((node) => { const value = dictionary[node.dataset.i18n]; if (value) node.innerHTML = value; });
}
function setStatus(key, vars = {}) { $('#statusText').textContent = (dictionary[key] || key).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? ''); }
function formatDate(value) { return value ? new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(value)) : '—'; }
function parseVector(text) { const values = String(text || '').match(/-?\d*\.?\d+(?:e[+-]?\d+)?/ig); return values ? values.map(Number) : [0, 1, 0]; }
function geometryOf(image) {
  const vector = parseVector(image.camera_vector || image.camera_model_component_list?.split(';')[1]);
  const [x, y, z] = vector;
  const azimuth = Math.atan2(y, x) * 180 / Math.PI;
  const elevation = Math.asin(z / Math.max(Math.hypot(x, y, z), .001)) * 180 / Math.PI;
  return { azimuth, elevation };
}
function encodeMSLQuery(sol) {
  return `https://mars.nasa.gov/api/v1/raw_image_items?order=sol%20desc%2Cinstrument_sort%20asc%2Csample_type_sort%20asc%2Cdate_taken%20desc&per_page=100&page=0&condition_1=msl%3Amission&condition_2=${sol}%3Asol%3Agte&condition_3=${sol}%3Asol%3Alte&search=&extended=`;
}
async function fetchCuriosity(sol) {
  const response = await fetch(encodeMSLQuery(sol));
  if (!response.ok) throw new Error('NASA feed unavailable');
  const data = await response.json();
  return data.items || [];
}
function populateRovers() {
  $('#roverSelect').innerHTML = Object.entries(roverCatalog).map(([id, r]) => `<option value="${id}">${r.name}</option>`).join('');
  $('#roverSelect').value = state.rover;
}
function populateSols(sols, selected) {
  const unique = [...new Set(sols)].sort((a, b) => b - a);
  $('#solSelect').innerHTML = unique.map((sol) => `<option value="${sol}">Sol ${sol}</option>`).join('');
  $('#solSelect').value = String(selected || unique[0] || '');
}
async function resolveLatestCuriosity() {
  try {
    const response = await fetch('https://mars.nasa.gov/api/v1/raw_image_items?order=sol%20desc&per_page=10&page=0&condition_1=msl%3Amission&search=&extended=');
    const data = await response.json();
    const latest = data.items?.[0]?.sol;
    if (latest) { roverCatalog.curiosity.sols = [latest, latest - 1, latest - 2, ...roverCatalog.curiosity.sols]; populateSols(roverCatalog.curiosity.sols, latest); }
  } catch { /* The local sample remains usable offline. */ }
}
function loadImage(image) {
  return new Promise((resolve) => { const element = new Image(); element.onload = () => resolve({ ...image, element }); element.onerror = () => resolve({ ...image, element: null }); element.src = image.https_url || image.image_files?.medium || image.image_files?.full_res; });
}
async function loadPanorama() {
  const rover = roverCatalog[state.rover];
  const sol = Number($('#solSelect').value);
  $('#loadingLayer').hidden = false; setStatus('loadingStatus'); state.usedFallback = false; closePanel();
  try {
    if (rover.source !== 'nasa-msl') throw new Error('adapter-pending');
    const images = await fetchCuriosity(sol);
    if (!images.length) throw new Error('empty');
    state.images = await Promise.all(images.map(loadImage));
    $('#earthDate').textContent = formatDate(state.images[0]?.date_taken);
    setStatus('loadedStatus', { count: state.images.length });
  } catch (error) {
    state.images = await Promise.all(geometrySample.map(loadImage)); state.usedFallback = true;
    $('#earthDate').textContent = formatDate(geometrySample[0].date_taken);
    setStatus(rover.source === 'nasa-msl' ? 'fallbackStatus' : 'comingSoon');
  } finally {
    $('#loadingLayer').hidden = true; $('#imageCount').textContent = `${state.images.length} images`; updateCoverage(); render();
  }
}
function updateCoverage() {
  const angles = state.images.map((image) => geometryOf(image).azimuth).sort((a, b) => a - b);
  const coverage = angles.length < 2 ? 0 : Math.min(360, Math.round(Math.abs(angles.at(-1) - angles[0]) + 55));
  $('#coverageValue').textContent = `${coverage}° / 360°`;
}
function wrappedX(x) { const w = canvas.width; return ((x % w) + w) % w; }
function drawSky() {
  const sky = ctx.createLinearGradient(0, 0, 0, canvas.height); sky.addColorStop(0, '#162a47'); sky.addColorStop(.50, '#9e6245'); sky.addColorStop(.505, '#5c3a31'); sky.addColorStop(1, '#141823'); ctx.fillStyle = sky; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = 'rgba(235,245,255,.3)'; ctx.lineWidth = 2; ctx.setLineDash([10, 10]); ctx.beginPath(); ctx.moveTo(0, canvas.height / 2); ctx.lineTo(canvas.width, canvas.height / 2); ctx.stroke(); ctx.setLineDash([]);
  for (let x = 0; x <= canvas.width; x += canvas.width / 12) { ctx.strokeStyle = 'rgba(220,244,255,.12)'; ctx.beginPath(); ctx.moveTo(x, canvas.height / 2 - 6); ctx.lineTo(x, canvas.height / 2 + 6); ctx.stroke(); }
}
function imagePlacement(image, index) {
  const { azimuth, elevation } = geometryOf(image); const scale = image.scale_factor || 1;
  const imageHeight = Math.min(canvas.height * .72, 420 * scale); const imageWidth = imageHeight * 1.25;
  const base = ((azimuth + 180) / 360) * canvas.width + state.offset;
  return { x: wrappedX(base) - imageWidth / 2, y: canvas.height * .5 - (elevation / 90) * canvas.height * .4 - imageHeight / 2, w: imageWidth, h: imageHeight, index };
}
function isHit(point, placement) { return point && point.x >= placement.x && point.x <= placement.x + placement.w && point.y >= placement.y && point.y <= placement.y + placement.h; }
function drawFrame(item, placement, highlight = false) {
  const { element } = item; if (!element) return;
  ctx.save(); ctx.globalAlpha = highlight ? 1 : .92; ctx.shadowColor = highlight ? '#64edff' : 'rgba(0,0,0,.55)'; ctx.shadowBlur = highlight ? 28 : 12; ctx.drawImage(element, placement.x, placement.y, placement.w, placement.h);
  ctx.strokeStyle = highlight ? '#8cf3ff' : 'rgba(220,245,255,.37)'; ctx.lineWidth = highlight ? 4 : 2; ctx.strokeRect(placement.x, placement.y, placement.w, placement.h); ctx.restore();
}
function render() {
  drawSky(); const placements = state.images.map(imagePlacement); const hovered = placements.filter((p) => isHit(state.pointer, p));
  state.altTarget = state.pointer?.altKey && hovered.length > 1 ? hovered[0] : null;
  const drawOrder = state.images.map((item, index) => ({ item, placement: placements[index] }));
  if (state.altTarget) { const i = drawOrder.findIndex((d) => d.placement.index === state.altTarget.index); drawOrder.push(drawOrder.splice(i, 1)[0]); }
  drawOrder.forEach(({ item, placement }) => drawFrame(item, placement, state.altTarget?.index === placement.index));
  if (state.pointer && !state.dragging) wrap.title = state.altTarget ? 'Alt: image beneath brought forward' : hovered.length ? 'Click for image information' : '';
}
function canvasPoint(event) { const rect = canvas.getBoundingClientRect(); return { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height, altKey: event.altKey }; }
function imageAt(point) { const matches = state.images.map(imagePlacement).filter((p) => isHit(point, p)); if (!matches.length) return null; return state.images[(point.altKey && matches.length > 1 ? matches[0] : matches.at(-1)).index]; }
function openPanel(image) {
  if (!image) return closePanel(); state.active = image; const m = dictionary.metadata; const geometry = geometryOf(image); const values = [[m.rover, roverCatalog[state.rover].name], [m.camera, image.instrument || image.camera?.instrument], [m.sol, image.sol], [m.earthDate, formatDate(image.date_taken || image.date_taken_utc)], [m.captured, image.date_taken || image.date_taken_utc || image.date_taken_mars], [m.siteDrive, `${image.site ?? '—'} / ${image.drive ?? '—'}`], [m.cameraModel, image.camera_model_type || image.camera?.camera_model_type || '—'], [m.cameraAxis, image.camera_vector || image.camera?.camera_vector || `${geometry.azimuth.toFixed(2)}° / ${geometry.elevation.toFixed(2)}°`], [m.cameraPosition, image.camera_position || image.camera?.camera_position || '—'], [m.mastAngles, `${image.extended?.mast_az ?? image.extended?.mastAz ?? '—'}° / ${image.extended?.mast_el ?? image.extended?.mastEl ?? '—'}°`]];
  $('#imageTitle').textContent = image.imageid || 'Mars image'; $('#panelImage').src = image.https_url || image.image_files?.medium || image.image_files?.full_res; $('#metadataList').innerHTML = values.map(([key, value]) => `<div><dt>${key}</dt><dd>${value}</dd></div>`).join(''); $('#sourceLink').href = image.https_url || image.image_files?.full_res || '#'; $('#imagePanel').hidden = false;
}
function closePanel() { state.active = null; $('#imagePanel').hidden = true; }

function attachEvents() {
  $('#themeToggle').addEventListener('click', () => { const dark = document.documentElement.dataset.theme !== 'dark'; document.documentElement.dataset.theme = dark ? 'dark' : 'light'; $('#themeToggle').textContent = dark ? '☾' : '☼'; localStorage.setItem('mars360-theme', document.documentElement.dataset.theme); });
  $('#roverSelect').addEventListener('change', (event) => { state.rover = event.target.value; populateSols(roverCatalog[state.rover].sols, roverCatalog[state.rover].sols[0]); $('#earthDate').textContent = '—'; });
  $('#loadButton').addEventListener('click', loadPanorama); $('#closePanel').addEventListener('click', closePanel);
  wrap.addEventListener('pointerdown', (event) => { state.dragging = false; state.dragStart = event.clientX; state.startOffset = state.offset; wrap.setPointerCapture(event.pointerId); });
  wrap.addEventListener('pointermove', (event) => { state.pointer = canvasPoint(event); if (wrap.hasPointerCapture(event.pointerId)) { const delta = event.clientX - state.dragStart; if (Math.abs(delta) > 3) state.dragging = true; state.offset = state.startOffset + delta * canvas.width / wrap.clientWidth; } render(); });
  wrap.addEventListener('pointerup', (event) => { if (!state.dragging) openPanel(imageAt(canvasPoint(event))); wrap.releasePointerCapture?.(event.pointerId); state.dragging = false; render(); });
  wrap.addEventListener('pointerleave', () => { if (!state.dragging) { state.pointer = null; render(); } });
  window.addEventListener('keydown', (event) => { if (event.key === 'Alt' && state.pointer) { state.pointer.altKey = true; render(); } }); window.addEventListener('keyup', (event) => { if (event.key === 'Alt' && state.pointer) { state.pointer.altKey = false; render(); } });
}
function init() {
  document.documentElement.dataset.theme = localStorage.getItem('mars360-theme') || 'dark'; $('#themeToggle').textContent = document.documentElement.dataset.theme === 'dark' ? '☾' : '☼';
  translate(); populateRovers(); populateSols(roverCatalog.curiosity.sols, roverCatalog.curiosity.sols[0]); $('#languageSelect').innerHTML = `<option value="en">${dictionary.name}</option>`; attachEvents(); resolveLatestCuriosity().finally(loadPanorama);
}
init();
