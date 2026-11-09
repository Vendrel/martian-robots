import { detectAcceleration } from './acceleration.js';
import { DEFAULT_LOCAL_MESH_VERTICES_PER_SIDE, loadExperimentalPlanetariumCalibration, loadLocalMeshCalibration, loadMeshCalibration, loadPanoramaCalibration, loadRoverCalibration, loadRoverCalibrationRecord, saveExperimentalPlanetariumCalibration, saveLocalMeshCalibration, saveMeshCalibration, savePanoramaCalibration, saveRoverCalibration } from './store.js?2026110816';
import { defaultRoverCalibrationFor, needsRoverAssetFrameMigration, roverAssetPath } from './rover-calibration.js?2026110810';
import { createThreeDViewer } from './viewer.js?2026110816';
import { findNearestPublishedPerseverancePdsMesh, findPerseverancePdsMesh, probePerseverancePdsSources } from './pds-sources.js?2026110809';

function text(key, fallback) {
  return window.localeDictionary?.[key] || fallback;
}

function setMode(buttons, mode) {
  for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.sceneMode === mode));
}
function sceneCalibrationKey(context) { return `${context.rover}:${context.sol}:${context.locationIndex}`; }

export const SHOW2D3DBUTTON = false;
// The existing 3D path remains the baseline. Enable this temporary test
// configuration to evaluate the planetarium carrier against it.
export const EXPERIMENTAL3D = true;
const THREE_D_SHORTCUT_KEY = 'í';
const THREE_D_SHORTCUT_HOLD_MS = 1000;

function averageRoverOrientation(samples) {
  const valid = samples.filter(sample => Array.isArray(sample) && sample.length === 4 && sample.every(Number.isFinite));
  if (!valid.length) return null;
  const reference = valid[0];
  const sum = [0, 0, 0, 0];
  for (const sample of valid) {
    const sameHemisphere = reference.reduce((value, component, index) => value + component * sample[index], 0) >= 0 ? 1 : -1;
    sample.forEach((component, index) => sum[index] += component * sameHemisphere);
  }
  const length = Math.hypot(...sum);
  return length > 0 ? sum.map(component => component / length) : null;
}

function dot3(left, right) { return left[0] * right[0] + left[1] * right[1] + left[2] * right[2]; }
function length3(vector) { return Math.hypot(...vector); }
function validCamera(camera) { return ['C', 'A', 'H', 'V'].every(key => Array.isArray(camera?.[key]) && camera[key].length === 3 && camera[key].every(Number.isFinite)); }
function stereoSide(candidate) {
  const text = `${typeof candidate === 'string' ? candidate : candidate?.imageId || ''} ${typeof candidate === 'object' ? candidate?.instrument || '' : ''}`.toUpperCase();
  return /(?:^|[_\s-])(?:L|LEFT)(?:[_\s-]|$)|^[A-Z]LB_/.test(text) ? 'left' : /(?:^|[_\s-])(?:R|RIGHT)(?:[_\s-]|$)|^[A-Z]RB_/.test(text) ? 'right' : null;
}
function stereoFamily(candidate) {
  const instrument = String(candidate?.instrument || '').toUpperCase();
  return instrument.replace(/(?:[_-](?:LEFT|RIGHT))?(?:[_-][A-Z])?$/, '') || null;
}

function selectStereoPair(candidates) {
  let selected = null;
  for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) for (let rightIndex = leftIndex + 1; rightIndex < candidates.length; rightIndex += 1) {
    const first = candidates[leftIndex], second = candidates[rightIndex];
    const firstFamily = stereoFamily(first), secondFamily = stereoFamily(second);
    if (!firstFamily || firstFamily !== secondFamily) continue;
    const firstSide = stereoSide(first), secondSide = stereoSide(second);
    const left = firstSide === 'left' ? first : secondSide === 'left' ? second : first;
    const right = left === first ? second : first;
    if (!validCamera(left.camera) || !validCamera(right.camera)) continue;
    const axisSimilarity = dot3(left.camera.A, right.camera.A) / (length3(left.camera.A) * length3(right.camera.A));
    const baseline = length3(left.camera.C.map((value, index) => value - right.camera.C[index]));
    if (!Number.isFinite(axisSimilarity) || axisSimilarity < .985 || baseline < .02 || baseline > 2) continue;
    const oppositeSides = stereoSide(left) && stereoSide(right) && stereoSide(left) !== stereoSide(right);
    const timeDelta = Math.abs(Date.parse(left.capturedAt) - Date.parse(right.capturedAt)) / 1000;
    const temporalWeight = Number.isFinite(timeDelta) ? 1 / (1 + Math.min(timeDelta, 120) / 15) : .5;
    const score = baseline * axisSimilarity * (oppositeSides ? 3 : 1) * temporalWeight;
    if (!selected || score > selected.score) selected = { left, right, baseline, score };
  }
  return selected;
}

async function fetchImageBitmap(sourceUrl) {
  const response = await fetch(sourceUrl, { cache: 'force-cache' });
  if (!response.ok) throw Error(`stereo-image-http-${response.status}`);
  return createImageBitmap(await response.blob());
}

// WebGL cannot apply Texture.flipY after an ImageBitmap has been created.
// The worker needs source-top-left pixels, while Three.js texture UVs use an
// upward V axis, so construct a separately flipped bitmap for scene textures.
async function fetchTextureImageBitmap(sourceUrl) {
  const response = await fetch(sourceUrl, { cache: 'force-cache' });
  if (!response.ok) throw Error(`stereo-texture-http-${response.status}`);
  return createImageBitmap(await response.blob(), { imageOrientation: 'flipY' });
}

function normalizedVerticesPerSide(value) {
  const vertices = Math.round(Number(value));
  return Number.isFinite(vertices) ? Math.max(17, Math.min(161, vertices)) : DEFAULT_LOCAL_MESH_VERTICES_PER_SIDE;
}

function stereoContextKey(context) {
  return context?.sourceContextKey || `${sceneCalibrationKey(context)}:${context?.loadEpoch ?? 'unknown'}`;
}

function assertCurrentStereoContext(getSceneContext, requestContext) {
  const currentContext = getSceneContext();
  if (stereoContextKey(currentContext) !== stereoContextKey(requestContext)) throw Error('stale-local-stereo-context');
  return currentContext;
}

async function runStereoWorker(pair, verticesPerSide) {
  let stage = 'image-download';
  const [leftBitmap, rightBitmap] = await Promise.all([fetchImageBitmap(pair.left.sourceUrl), fetchImageBitmap(pair.right.sourceUrl)]);
  stage = 'worker-start';
  const worker = new Worker(new URL('./reconstruction.worker.js?2026110813', import.meta.url), { type: 'module' });
  try {
    return await new Promise((resolve, reject) => {
      worker.onmessage = event => event.data?.ok ? resolve(event.data) : reject(Error(`${event.data?.stage || 'worker'}: ${event.data?.error || 'local-stereo-worker-failed'}`));
      worker.onerror = event => reject(event.error || Error(`worker: ${event.message || 'local-stereo-worker-error'}`));
      stage = 'worker-message';
      worker.postMessage({ leftBitmap, rightBitmap, leftCamera: pair.left.camera, rightCamera: pair.right.camera, verticesPerSide }, [leftBitmap, rightBitmap]);
    });
  } catch (error) {
    throw Error(`${stage}: ${error.message || error}`);
  } finally {
    worker.terminate();
  }
}

async function probeReadablePixels(sourceUrl) {
  if (!sourceUrl) throw Error('three-d-no-source-image');
  const response = await fetch(sourceUrl, { cache: 'force-cache' });
  if (!response.ok) throw Error(`three-d-source-http-${response.status}`);
  const bitmap = await createImageBitmap(await response.blob());
  try {
    const canvas = new OffscreenCanvas(1, 1);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(bitmap, 0, 0, 1, 1);
    context.getImageData(0, 0, 1, 1);
  } finally {
    bitmap.close?.();
  }
}

export function initializeThreeDMode({ isExtensionContext, getSceneContext }) {
  const toggle = document.querySelector('#sceneModeToggle');
  const workspace = document.querySelector('#threeDWorkspace');
  const viewport = document.querySelector('#threeDViewport');
  if (!toggle || !workspace || !isExtensionContext) return;

  document.body.dataset.sceneModeReady = 'true';
  document.body.dataset.sceneMode = '2d';
  toggle.hidden = !SHOW2D3DBUTTON;
  // The panorama owns pointer gestures on #panoramaWrap and calls
  // preventDefault() on pointerdown. Keep every 3D control out of that
  // gesture stream so native controls such as <details> still work.
  for (const eventName of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'wheel']) {
    workspace.addEventListener(eventName, event => event.stopPropagation());
  }
  const buttons = [...toggle.querySelectorAll('button[data-scene-mode]')];
  const status = workspace.querySelector('[data-three-d-status]');
  const viewportStatus = viewport.querySelector('[data-three-d-viewport-status]');
  const preflight = workspace.querySelector('[data-three-d-preflight]');
  const panoramaBuild = workspace.querySelector('[data-three-d-panorama-build]');
  const panoramaStatus = workspace.querySelector('[data-three-d-panorama-status]');
  const localReconstruct = workspace.querySelector('[data-three-d-local-reconstruct]');
  const localReconstructionStatus = workspace.querySelector('[data-three-d-local-reconstruction-status]');
  const pdsProbe = workspace.querySelector('[data-three-d-pds-probe]');
  const pdsStatus = workspace.querySelector('[data-three-d-pds-status]');
  const nasaMeshToggle = workspace.querySelector('[data-three-d-nasa-mesh]');
  const localMeshToggle = workspace.querySelector('[data-three-d-local-mesh]');
  const localMeshResolution = workspace.querySelector('[data-three-d-local-mesh-resolution]');
  const calibrationSave = workspace.querySelector('[data-rover-calibration-save]');
  const meshCalibrationDetails = workspace.querySelector('[data-mesh-calibration]');
  const meshCalibrationSave = workspace.querySelector('[data-mesh-calibration-save]');
  const localMeshCalibrationDetails = workspace.querySelector('[data-local-mesh-calibration]');
  const localMeshCalibrationSave = workspace.querySelector('[data-local-mesh-calibration-save]');
  const panoramaCalibrationSave = workspace.querySelector('[data-panorama-calibration-save]');
  const experimentalPlanetariumDetails = workspace.querySelector('[data-three-d-experimental-planetarium]');
  const experimentalPlanetariumSave = workspace.querySelector('[data-experimental-planetarium-save]');
  const calibrationInputs = {
    position: [...workspace.querySelectorAll('[data-rover-calibration-position]')],
    rotation: [...workspace.querySelectorAll('[data-rover-calibration-rotation]')],
    scale: workspace.querySelector('[data-rover-calibration-scale]'),
    cube: [...workspace.querySelectorAll('[data-rover-calibration-cube]')],
  };
  const meshCalibrationInputs = {
    position: [...workspace.querySelectorAll('[data-mesh-calibration-position]')],
    rotation: [...workspace.querySelectorAll('[data-mesh-calibration-rotation]')],
    scale: workspace.querySelector('[data-mesh-calibration-scale]'),
  };
  const localMeshCalibrationInputs = { position: [...workspace.querySelectorAll('[data-local-mesh-calibration-position]')], rotation: [...workspace.querySelectorAll('[data-local-mesh-calibration-rotation]')], scale: workspace.querySelector('[data-local-mesh-calibration-scale]') };
  const panoramaCalibrationInputs = { rotation: [...workspace.querySelectorAll('[data-panorama-calibration-rotation]')] };
  const experimentalPlanetariumInputs = { tessellationMaxEdgeMeters: workspace.querySelector('[data-experimental-planetarium-tessellation-max-edge]') };
  let acceleration = null;
  let calibration = null;
  let calibrationRover = null;
  let meshCalibration = null;
  let meshCalibrationKey = null;
  let localMeshCalibration = null;
  let panoramaCalibration = null;
  let experimentalPlanetariumCalibration = null;
  let activeSceneCalibrationKey = null;
  let panoramaBuiltForScene = null;
  let viewer = null;
  let hasLocalReconstruction = false;
  let localMeshResolutionTimer = 0;
  let experimentalPlanetariumTessellationTimer = 0;
  let activeSourceContextKey = null;
  let controlDeckRebuildTimer = 0;

  const setViewerStatus = message => {
    status.textContent = message;
    viewportStatus.textContent = message;
    viewportStatus.hidden = message.includes('rover model loaded');
  };

  const getViewer = async () => {
    if (!viewer) {
      viewer = createThreeDViewer(viewport, setViewerStatus);
    }
    return viewer;
  };

  const selectRoverCalibration = async rover => {
    const calibrationRecord = await loadRoverCalibrationRecord(rover);
    let nextCalibration = calibrationRecord.calibration;
    // A different model asset has a different pivot, unit and axis frame.
    // Never inherit Curiosity calibration into a real Perseverance model.
    if (!calibrationRecord.exists || nextCalibration.assetPath !== roverAssetPath(rover) || needsRoverAssetFrameMigration(rover, nextCalibration)) nextCalibration = await saveRoverCalibration(rover, defaultRoverCalibrationFor(rover));
    calibration = nextCalibration;
    calibrationRover = rover;
    return calibration;
  };

  const syncCalibrationFields = () => {
    if (!calibration) return;
    calibrationInputs.position.forEach((input, index) => input.value = String(calibration.positionMeters[index]));
    calibrationInputs.rotation.forEach((input, index) => input.value = String(calibration.rotationDegrees[index]));
    calibrationInputs.scale.value = String(calibration.scale);
    calibrationInputs.cube.forEach((input, index) => input.value = String(calibration.cubePositionMeters[index]));
    viewer?.applyRoverCalibration(calibration);
  };

  const syncMeshCalibrationFields = () => {
    if (!meshCalibration) return;
    meshCalibrationInputs.position.forEach((input, index) => input.value = String(meshCalibration.positionMeters[index]));
    meshCalibrationInputs.rotation.forEach((input, index) => input.value = String(meshCalibration.rotationDegrees[index]));
    meshCalibrationInputs.scale.value = String(meshCalibration.scale);
    viewer?.applyMeshCalibration(meshCalibration);
  };

  const syncLocalMeshCalibrationFields = () => {
    if (!localMeshCalibration) return;
    localMeshCalibrationInputs.position.forEach((input, index) => input.value = String(localMeshCalibration.positionMeters[index]));
    localMeshCalibrationInputs.rotation.forEach((input, index) => input.value = String(localMeshCalibration.rotationDegrees[index]));
    localMeshCalibrationInputs.scale.value = String(localMeshCalibration.scale);
    localMeshResolution.value = String(localMeshCalibration.verticesPerSide);
    viewer?.applyLocalMeshCalibration(localMeshCalibration);
  };
  const syncPanoramaCalibrationFields = () => {
    if (!panoramaCalibration) return;
    panoramaCalibrationInputs.rotation.forEach((input, index) => input.value = String(panoramaCalibration.rotationDegrees[index]));
    viewer?.applyPanoramaCalibration(panoramaCalibration);
  };
  const syncExperimentalPlanetariumFields = () => {
    if (!EXPERIMENTAL3D || !experimentalPlanetariumCalibration) return;
    experimentalPlanetariumDetails.hidden = false;
    experimentalPlanetariumInputs.tessellationMaxEdgeMeters.value = String(experimentalPlanetariumCalibration.tessellationMaxEdgeMeters);
    viewer?.applyExperimentalPlanetariumCalibration(experimentalPlanetariumCalibration);
  };
  const loadSceneCalibrations = async context => {
    activeSceneCalibrationKey = sceneCalibrationKey(context);
    activeSourceContextKey = stereoContextKey(context);
    const calibrations = await Promise.all([
      loadLocalMeshCalibration(activeSceneCalibrationKey),
      loadPanoramaCalibration(activeSceneCalibrationKey),
      EXPERIMENTAL3D ? loadExperimentalPlanetariumCalibration(activeSceneCalibrationKey) : Promise.resolve(null),
    ]);
    [localMeshCalibration, panoramaCalibration, experimentalPlanetariumCalibration] = calibrations;
    syncLocalMeshCalibrationFields();
    syncPanoramaCalibrationFields();
    syncExperimentalPlanetariumFields();
  };

  const updateCopy = () => {
    toggle.setAttribute('aria-label', text('threeDModeLabel', 'View mode'));
    workspace.querySelector('[data-three-d-title]').textContent = text('threeDWorkspaceTitle', '3D workspace');
    preflight.textContent = text('threeDPreflight', 'Run 3D readiness check');
    panoramaBuild.textContent = text('threeDPanoramaBuild', 'Build Sol 3D panorama');
    localReconstruct.textContent = text('threeDLocalReconstruct', 'Build local stereo mesh');
    pdsProbe.textContent = text('threeDPdsProbe', 'Check Perseverance PDS 3D sources');
    workspace.querySelector('[data-three-d-nasa-mesh-label]').textContent = text('threeDNasaMeshLayer', 'NASA PDS mesh');
    workspace.querySelector('[data-three-d-local-mesh-label]').textContent = text('threeDLocalMeshLayer', 'Local stereo reconstruction mesh');
    workspace.querySelector('[data-three-d-local-mesh-resolution-label]').textContent = text('threeDLocalMeshResolutionLabel', 'Own mesh resolution (vertices / side)');
    workspace.querySelector('[data-three-d-local-mesh-resolution-note]').textContent = text('threeDLocalMeshResolutionNote', 'Changing it rebuilds the displayed local mesh.');
    workspace.querySelector('[data-three-d-calibration-title]').textContent = text('threeDCalibrationTitle', 'Rover model calibration');
    workspace.querySelector('[data-three-d-calibration-note]').textContent = text('threeDCalibrationNote', 'Values are in scene metres and degrees. They remain unverified until the model-frame audit is complete.');
    workspace.querySelector('[data-three-d-scale-label]').textContent = text('threeDScaleLabel', 'Scale');
    workspace.querySelector('[data-three-d-cube-title]').textContent = text('threeDCubeTitle', '50 cm calibration cube');
    workspace.querySelector('[data-three-d-cube-note]').textContent = text('threeDCubeNote', 'Red cube centre in scene metres. The cube stays axis-aligned on the surface; cyan +Z arrow is 0° forward.');
    workspace.querySelector('[data-three-d-controls-note]').textContent = text('threeDControlsNote', 'Mouse wheel: dolly · Gamepad: sticks control the 3D camera; D-pad controls the shared location/resolution deck, Triangle + D-pad adjusts layer spacing; L3 resets, R3 focuses rover, Square toggles fullscreen.');
    calibrationSave.textContent = text('threeDCalibrationSave', 'Save rover calibration');
    workspace.querySelector('[data-three-d-mesh-calibration-title]').textContent = text('threeDMeshCalibrationTitle', 'Mesh calibration');
    workspace.querySelector('[data-three-d-mesh-calibration-note]').textContent = text('threeDMeshCalibrationNote', 'Values apply only to the currently loaded PDS mesh product and are stored locally with that product.');
    workspace.querySelector('[data-three-d-mesh-scale-label]').textContent = text('threeDScaleLabel', 'Scale');
    meshCalibrationSave.textContent = text('threeDMeshCalibrationSave', 'Save mesh calibration');
    workspace.querySelector('[data-three-d-local-mesh-calibration-title]').textContent = text('threeDLocalMeshCalibrationTitle', 'Local mesh calibration');
    workspace.querySelector('[data-three-d-local-mesh-calibration-note]').textContent = text('threeDLocalMeshCalibrationNote', 'Only the locally reconstructed heightfield is affected.');
    localMeshCalibrationSave.textContent = text('threeDLocalMeshCalibrationSave', 'Save local mesh calibration');
    workspace.querySelector('[data-three-d-panorama-calibration-title]').textContent = text('threeDPanoramaCalibrationTitle', 'Panorama calibration');
    workspace.querySelector('[data-three-d-panorama-calibration-note]').textContent = text('threeDPanoramaCalibrationNote', 'Only the stereo source-image reference is affected.');
    panoramaCalibrationSave.textContent = text('threeDPanoramaCalibrationSave', 'Save panorama calibration');
    if (!status.textContent) status.textContent = text('threeDIdle', 'Select a source image, then run the readiness check.');
  };

  const showWorkspace = async () => {
    workspace.hidden = false;
    setMode(buttons, '3d');
    viewport.hidden = false;
    document.body.dataset.sceneMode = '3d';
    toggle.hidden = false;
    viewport.closest('#panoramaWrap').classList.add('is-three-d');
    acceleration ||= await detectAcceleration();
    const context = getSceneContext();
    await loadSceneCalibrations(context);
    pdsProbe.hidden = context.rover !== 'perseverance';
    pdsStatus.hidden = true;
    calibration = await selectRoverCalibration(context.rover);
    const currentOrientation = averageRoverOrientation(context.orientationSamples || []);
    syncCalibrationFields();
    status.textContent = `${text('threeDReady', 'Ready for 3D')} · ${acceleration.backend} / ${acceleration.profile} · ${calibration.calibrated ? text('threeDModelCalibrated', 'rover model calibrated') : text('threeDModelPending', 'rover model calibration pending')}`;
    const activeViewer = await getViewer();
    await activeViewer.loadRoverModel(calibration.assetPath, context.rover);
    if (EXPERIMENTAL3D) {
      await activeViewer.setExperimentalPlanetariumEnabled(true);
      activeViewer.setLocalReconstructionMeshVisible(false);
      localMeshToggle.closest('label')?.setAttribute('hidden', '');
      localMeshCalibrationDetails.hidden = true;
    } else activeViewer.setLocalReconstructionMeshVisible(localMeshToggle.checked);
    activeViewer.applyRoverCalibration(calibration);
    activeViewer.applyRoverNavigationOrientation(currentOrientation);
    syncLocalMeshCalibrationFields();
    syncPanoramaCalibrationFields();
    syncExperimentalPlanetariumFields();
    activeViewer.activate();
  };

  const hideWorkspace = () => {
    workspace.hidden = true;
    viewport.hidden = true;
    document.body.dataset.sceneMode = '2d';
    toggle.hidden = !SHOW2D3DBUTTON;
    viewport.closest('#panoramaWrap').classList.remove('is-three-d');
    viewer?.deactivate();
    setMode(buttons, '2d');
  };

  const refreshLocationPose = async () => {
    if (document.body.dataset.sceneMode !== '3d' || !viewer || !calibration) return;
    const context = getSceneContext();
    const sourceChanged = stereoContextKey(context) !== activeSourceContextKey;
    const rebuildPanorama = sourceChanged && Boolean(panoramaBuiltForScene);
    const rebuildLocalMesh = sourceChanged && hasLocalReconstruction;
    if (sceneCalibrationKey(context) !== activeSceneCalibrationKey) await loadSceneCalibrations(context);
    if (stereoContextKey(getSceneContext()) !== stereoContextKey(context)) return;
    activeSourceContextKey = stereoContextKey(context);
    pdsProbe.hidden = context.rover !== 'perseverance';
    if (context.rover !== 'perseverance') pdsStatus.hidden = true;
    if (context.rover !== calibrationRover) {
      calibration = await selectRoverCalibration(context.rover);
      syncCalibrationFields();
      await viewer.loadRoverModel(calibration.assetPath, context.rover);
    }
    const orientation = averageRoverOrientation(context.orientationSamples || []);
    viewer.applyRoverNavigationOrientation(orientation);
    if (sourceChanged) {
      // Do not leave a previous rover/Sol/location mesh visible while the
      // control deck has already moved the 2D context to a new source.
      viewer.clearLocalStereoReconstruction();
      viewer.clearPanoramaSurface();
      panoramaBuiltForScene = null;
      window.clearTimeout(controlDeckRebuildTimer);
      controlDeckRebuildTimer = window.setTimeout(() => {
        if (document.body.dataset.sceneMode !== '3d' || stereoContextKey(getSceneContext()) !== stereoContextKey(context)) return;
        if (rebuildPanorama && !panoramaBuild.disabled) panoramaBuild.click();
        if (rebuildLocalMesh && !localReconstruct.disabled) localReconstruct.click();
      }, 80);
    }
    console.info('3D rover location pose updated', { rover: context.rover, sol: context.sol, locationIndex: context.locationIndex, orientationSamples: context.orientationSamples?.length || 0 });
  };
  document.addEventListener('martianrobots3dlocationchange', refreshLocationPose);

  let shortcutTimer = 0;
  const startShortcut = event => {
    if (event.key !== THREE_D_SHORTCUT_KEY || event.repeat || document.body.dataset.sceneMode === '3d' || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(event.target?.tagName || '')) return;
    shortcutTimer = window.setTimeout(() => { shortcutTimer = 0; buttons.find(button => button.dataset.sceneMode === '3d')?.click(); }, THREE_D_SHORTCUT_HOLD_MS);
  };
  const stopShortcut = event => {
    if (event.key === THREE_D_SHORTCUT_KEY && shortcutTimer) { clearTimeout(shortcutTimer); shortcutTimer = 0; }
  };
  window.addEventListener('keydown', startShortcut);
  window.addEventListener('keyup', stopShortcut);
  window.addEventListener('blur', () => { if (shortcutTimer) { clearTimeout(shortcutTimer); shortcutTimer = 0; } });

  buttons.forEach(button => button.addEventListener('pointerdown', event => event.stopPropagation()));
  buttons.forEach(button => button.addEventListener('click', async event => {
    event.stopPropagation();
    if (button.dataset.sceneMode === '2d') {
      hideWorkspace();
      return;
    }
    try {
      await showWorkspace();
    } catch (error) {
      console.error('3D viewer initialization failed', error);
      workspace.hidden = false;
      viewport.hidden = true;
      document.body.dataset.sceneMode = '2d';
      setMode(buttons, '3d');
      const message = text('threeDViewerError', '3D viewer initialization failed. Open the extension console for details.');
      status.textContent = message;
      viewportStatus.hidden = false;
      viewportStatus.textContent = message;
    }
  }));

  preflight.addEventListener('pointerdown', event => event.stopPropagation());
  preflight.addEventListener('click', async event => {
    event.stopPropagation();
    preflight.disabled = true;
    status.textContent = text('threeDChecking', 'Checking source pixels and hardware capabilities…');
    try {
      const context = getSceneContext();
      await probeReadablePixels(context.sourceUrl);
      acceleration ||= await detectAcceleration();
      status.textContent = `${text('threeDPreflightPassed', 'Source pixels are readable.')} ${acceleration.backend} / ${acceleration.profile}.`;
    } catch {
      status.textContent = text('threeDPreflightFailed', '3D readiness check failed.');
    } finally {
      preflight.disabled = false;
    }
  });

  panoramaBuild.addEventListener('click', async event => {
    event.stopPropagation();
    panoramaBuild.disabled = true;
    panoramaStatus.hidden = false;
    try {
      const context = getSceneContext();
      const requestContextKey = stereoContextKey(context);
      const candidates = context.panoramaCandidates || [];
      if (!candidates.length) throw Error('no-sol-panorama-images');
      const activeViewer = await getViewer();
      const panorama = await context.buildPanoramaEquirectangular?.((loaded, total) => {
        panoramaStatus.textContent = text('threeDPanoramaBuilding', 'Projecting Sol images: {loaded}/{total}…').replace('{loaded}', String(loaded)).replace('{total}', String(total));
      });
      if (!panorama) throw Error('three-d-panorama-builder-unavailable');
      if (stereoContextKey(getSceneContext()) !== requestContextKey) throw Error('stale-panorama-context');
      if (EXPERIMENTAL3D) activeViewer.setExperimentalPlanetariumPanorama(panorama.canvas);
      else activeViewer.setPanoramaEquirectangular(panorama.canvas);
      const { loaded, total } = panorama;
      panoramaBuiltForScene = requestContextKey;
      panoramaStatus.textContent = text('threeDPanoramaBuilt', 'Sol 3D panorama: {loaded}/{total} images projected.').replace('{loaded}', String(loaded)).replace('{total}', String(total));
    } catch (error) {
      panoramaStatus.textContent = error.message === 'no-sol-panorama-images'
        ? text('threeDPanoramaUnavailable', 'No camera-calibrated image is available for this Sol.')
        : `${text('threeDPanoramaFailed', 'Sol 3D panorama build failed.')} ${error.message || ''}`;
    } finally { panoramaBuild.disabled = false; }
  });

  localReconstruct.addEventListener('pointerdown', event => event.stopPropagation());
  localReconstruct.addEventListener('click', async event => {
    event.stopPropagation();
    localReconstruct.disabled = true;
    localReconstructionStatus.hidden = false;
    localReconstructionStatus.textContent = text('threeDLocalReconstructing', 'Selecting a calibrated stereo pair and computing disparity…');
    try {
      const context = getSceneContext();
      const requestContextKey = stereoContextKey(context);
      const pair = selectStereoPair(context.stereoCandidates || []);
      if (!pair) throw Error('no-validated-stereo-pair');
      const activeViewer = await getViewer();
      if (EXPERIMENTAL3D) await activeViewer.loadExperimentalPlanetarium();
      assertCurrentStereoContext(getSceneContext, context);
      const reconstruction = await runStereoWorker(pair, normalizedVerticesPerSide(localMeshResolution.value));
      assertCurrentStereoContext(getSceneContext, context);
      // Anchor the complete self-contained reconstruction scene at the same
      // acquisition pose as its left camera.  This is intentionally
      // independent of any optional PDS terrain comparison.
      activeViewer.applyRoverNavigationOrientation(pair.left.camera.orientation);
      let statistics;
      if (EXPERIMENTAL3D) {
        const experimental = activeViewer.applyExperimentalPlanetariumReconstruction(reconstruction);
        statistics = { valid: reconstruction.valid, triangles: experimental?.outputTriangles || 0, experimental };
      } else {
        statistics = activeViewer.applyLocalStereoReconstruction(reconstruction, pair.left.camera.orientation);
        const textureBitmap = await fetchTextureImageBitmap(pair.left.sourceUrl);
        try {
          assertCurrentStereoContext(getSceneContext, context);
          activeViewer.applyLocalStereoTexture(textureBitmap);
          if (panoramaBuiltForScene !== requestContextKey) activeViewer.applyStereoReferenceImage(textureBitmap, pair.left.camera, pair.left.imageId);
        } catch (error) {
          textureBitmap.close?.();
          throw error;
        }
        localMeshToggle.checked = true;
        activeViewer.setLocalReconstructionMeshVisible(true);
      }
      hasLocalReconstruction = true;
      const experimentalSummary = EXPERIMENTAL3D && statistics.experimental
        ? ` · planetarium: ${statistics.experimental.affectedTriangles} affected / ${statistics.experimental.outputTriangles} triangles`
        : '';
      localReconstructionStatus.textContent = `${text('threeDLocalReconstructed', 'Local stereo mesh: {points} valid points, {triangles} triangles.').replace('{points}', String(statistics.valid)).replace('{triangles}', String(statistics.triangles))} ${reconstruction.gridWidth}×${reconstruction.gridHeight} · max. ${reconstruction.heightLimitMeters.toFixed(2)} m terrain deviation · ${pair.left.imageId} ↔ ${pair.right.imageId} · baseline ${pair.baseline.toFixed(3)} m · ${context.rover} / Sol ${context.sol} / location ${context.locationIndex + 1}${experimentalSummary}.`;
    } catch (error) {
      if (error.message !== 'stale-local-stereo-context') console.error('Local stereo reconstruction failed', error);
      localReconstructionStatus.textContent = error.message === 'stale-local-stereo-context'
        ? 'The rover, Sol or location changed while the stereo mesh was building; the old result was discarded.'
        : error.message === 'no-validated-stereo-pair'
        ? text('threeDNoStereoPair', 'No usable, calibrated stereo pair is available at this location.')
        : error.message.includes('local-stereo-insufficient-triangles')
          ? text('threeDInsufficientStereoMesh', 'The selected pair had too few geometrically consistent points to form a mesh.')
        : `${text('threeDLocalReconstructionFailed', 'Local stereo reconstruction failed; see the extension console.')} ${error.message || 'unknown-error'}`;
    } finally {
      localReconstruct.disabled = false;
    }
  });

  pdsProbe.addEventListener('pointerdown', event => event.stopPropagation());
  pdsProbe.addEventListener('click', async event => {
    event.stopPropagation();
    pdsProbe.disabled = true;
    pdsStatus.hidden = false;
    pdsStatus.textContent = text('threeDPdsChecking', 'Requesting PDS access and checking the Navcam mesh bundle…');
    try {
      const source = await probePerseverancePdsSources();
      const context = getSceneContext();
      const mesh = await findPerseverancePdsMesh(context.sol) || await findNearestPublishedPerseverancePdsMesh(context.sol);
      if (!mesh) {
        pdsStatus.textContent = text('threeDPdsNoMesh', 'The PDS bundle is reachable, but it has no mesh product for this Sol.');
        return;
      }
      const activeViewer = await getViewer();
      await activeViewer.loadPdsMesh(mesh);
      nasaMeshToggle.disabled = false;
      activeViewer.setNasaMeshVisible(nasaMeshToggle.checked);
      meshCalibrationKey = mesh.objUrl;
      meshCalibration = await loadMeshCalibration(meshCalibrationKey);
      meshCalibrationDetails.hidden = false;
      syncMeshCalibrationFields();
      const statusKey = mesh.fallback ? 'threeDPdsFallbackMeshLoaded' : 'threeDPdsMeshLoaded';
      pdsStatus.textContent = `${text(statusKey, 'PDS Navcam terrain mesh loaded for Sol {sol} ({format}).').replace('{sol}', String(mesh.sol)).replace('{format}', `${source.meshFormat} · ${mesh.coordinateFrame} · SITE ${mesh.rmc.site}/${mesh.rmc.drive}`)} ${text('threeDPdsProductCount', '{count} OBJ product(s) are available for this Sol; the first is currently loaded.').replace('{count}', String(mesh.productUrls?.length || 1))}`;
    } catch (error) {
      const denied = error?.message === 'pds-permission-denied';
      pdsStatus.textContent = denied ? text('threeDPdsPermissionDenied', 'PDS source access was not granted.') : text('threeDPdsFailed', 'PDS source check failed.');
    } finally {
      pdsProbe.disabled = false;
    }
  });

  calibrationSave.addEventListener('pointerdown', event => event.stopPropagation());
  calibrationSave.addEventListener('click', async event => {
    event.stopPropagation();
    calibrationSave.disabled = true;
    try {
      const context = getSceneContext();
      calibration = await saveRoverCalibration(context.rover, {
        ...calibration,
        positionMeters: calibrationInputs.position.map(input => Number(input.value)),
        rotationDegrees: calibrationInputs.rotation.map(input => Number(input.value)),
        scale: Number(calibrationInputs.scale.value),
        cubePositionMeters: calibrationInputs.cube.map(input => Number(input.value)),
      });
      syncCalibrationFields();
      status.textContent = text('threeDCalibrationSaved', 'Rover calibration saved locally. Model-frame verification is still required.');
    } catch {
      status.textContent = text('threeDStorageError', '3D local storage is unavailable in this browser context.');
    } finally {
      calibrationSave.disabled = false;
    }
  });

  [...calibrationInputs.position, ...calibrationInputs.rotation, calibrationInputs.scale, ...calibrationInputs.cube].forEach(input => input.addEventListener('input', () => {
    if (!calibration) return;
    viewer?.applyRoverCalibration({
      ...calibration,
      positionMeters: calibrationInputs.position.map(field => Number(field.value)),
      rotationDegrees: calibrationInputs.rotation.map(field => Number(field.value)),
      scale: Number(calibrationInputs.scale.value),
      cubePositionMeters: calibrationInputs.cube.map(field => Number(field.value)),
    });
  }));

  meshCalibrationSave.addEventListener('pointerdown', event => event.stopPropagation());
  meshCalibrationSave.addEventListener('click', async event => {
    event.stopPropagation();
    if (!meshCalibrationKey) return;
    meshCalibrationSave.disabled = true;
    try {
      meshCalibration = await saveMeshCalibration(meshCalibrationKey, {
        positionMeters: meshCalibrationInputs.position.map(input => Number(input.value)),
        rotationDegrees: meshCalibrationInputs.rotation.map(input => Number(input.value)),
        scale: Number(meshCalibrationInputs.scale.value),
      });
      syncMeshCalibrationFields();
      status.textContent = text('threeDMeshCalibrationSaved', 'Mesh calibration saved locally for this PDS product.');
    } catch {
      status.textContent = text('threeDStorageError', '3D local storage is unavailable in this browser context.');
    } finally {
      meshCalibrationSave.disabled = false;
    }
  });

  [...meshCalibrationInputs.position, ...meshCalibrationInputs.rotation, meshCalibrationInputs.scale].forEach(input => input.addEventListener('input', () => {
    if (!meshCalibration) return;
    const previewCalibration = {
      ...meshCalibration,
      positionMeters: meshCalibrationInputs.position.map(field => Number(field.value)),
      rotationDegrees: meshCalibrationInputs.rotation.map(field => Number(field.value)),
      scale: Number(meshCalibrationInputs.scale.value),
    };
    viewer?.applyMeshCalibration(previewCalibration);
  }));

  localMeshCalibrationSave.addEventListener('click', async event => {
    event.stopPropagation();
    if (!activeSceneCalibrationKey) return;
    localMeshCalibrationSave.disabled = true;
    try {
      localMeshCalibration = await saveLocalMeshCalibration(activeSceneCalibrationKey, { positionMeters: localMeshCalibrationInputs.position.map(input => Number(input.value)), rotationDegrees: localMeshCalibrationInputs.rotation.map(input => Number(input.value)), scale: Number(localMeshCalibrationInputs.scale.value), verticesPerSide: normalizedVerticesPerSide(localMeshResolution.value) });
      syncLocalMeshCalibrationFields();
      status.textContent = text('threeDLocalMeshCalibrationSaved', 'Local mesh calibration saved.');
    } catch { status.textContent = text('threeDStorageError', '3D local storage is unavailable in this browser context.'); } finally { localMeshCalibrationSave.disabled = false; }
  });
  [...localMeshCalibrationInputs.position, ...localMeshCalibrationInputs.rotation, localMeshCalibrationInputs.scale].forEach(input => input.addEventListener('input', () => {
    if (!localMeshCalibration) return;
    viewer?.applyLocalMeshCalibration({ ...localMeshCalibration, positionMeters: localMeshCalibrationInputs.position.map(field => Number(field.value)), rotationDegrees: localMeshCalibrationInputs.rotation.map(field => Number(field.value)), scale: Number(localMeshCalibrationInputs.scale.value) });
  }));
  const persistLocalMeshResolution = async () => {
    const verticesPerSide = normalizedVerticesPerSide(localMeshResolution.value);
    localMeshResolution.value = String(verticesPerSide);
    if (!activeSceneCalibrationKey) return;
    try {
      localMeshCalibration = await saveLocalMeshCalibration(activeSceneCalibrationKey, { ...localMeshCalibration, verticesPerSide });
    } catch {
      status.textContent = text('threeDStorageError', '3D local storage is unavailable in this browser context.');
    }
  };
  const rebuildForChangedLocalMeshResolution = () => {
    window.clearTimeout(localMeshResolutionTimer);
    localMeshResolutionTimer = window.setTimeout(() => {
      // A resolution value must describe what is currently visible, not just
      // the next manual build. Avoid creating a mesh merely by editing a
      // stored preference before the first successful reconstruction.
      if (hasLocalReconstruction && !localReconstruct.disabled) localReconstruct.click();
    }, 180);
  };
  localMeshResolution.addEventListener('input', () => {
    persistLocalMeshResolution();
    rebuildForChangedLocalMeshResolution();
  });
  localMeshResolution.addEventListener('change', () => {
    persistLocalMeshResolution();
    rebuildForChangedLocalMeshResolution();
  });

  if (EXPERIMENTAL3D) {
    experimentalPlanetariumSave.addEventListener('click', async event => {
      event.stopPropagation();
      if (!activeSceneCalibrationKey) return;
      experimentalPlanetariumSave.disabled = true;
      try {
        experimentalPlanetariumCalibration = await saveExperimentalPlanetariumCalibration(activeSceneCalibrationKey, {
          tessellationMaxEdgeMeters: Number(experimentalPlanetariumInputs.tessellationMaxEdgeMeters.value),
        });
        syncExperimentalPlanetariumFields();
        status.textContent = 'Experimental planetarium calibration saved locally.';
      } catch {
        status.textContent = text('threeDStorageError', '3D local storage is unavailable in this browser context.');
      } finally { experimentalPlanetariumSave.disabled = false; }
    });
    experimentalPlanetariumInputs.tessellationMaxEdgeMeters.addEventListener('input', () => {
      if (!experimentalPlanetariumCalibration) return;
      window.clearTimeout(experimentalPlanetariumTessellationTimer);
      experimentalPlanetariumTessellationTimer = window.setTimeout(() => {
        viewer?.applyExperimentalPlanetariumCalibration({
          ...experimentalPlanetariumCalibration,
          tessellationMaxEdgeMeters: Number(experimentalPlanetariumInputs.tessellationMaxEdgeMeters.value),
        });
      }, 180);
    });
  }

  panoramaCalibrationSave.addEventListener('click', async event => {
    event.stopPropagation();
    if (!activeSceneCalibrationKey) return;
    panoramaCalibrationSave.disabled = true;
    try {
      panoramaCalibration = await savePanoramaCalibration(activeSceneCalibrationKey, { rotationDegrees: panoramaCalibrationInputs.rotation.map(input => Number(input.value)) });
      syncPanoramaCalibrationFields();
      status.textContent = text('threeDPanoramaCalibrationSaved', 'Panorama calibration saved.');
    } catch { status.textContent = text('threeDStorageError', '3D local storage is unavailable in this browser context.'); } finally { panoramaCalibrationSave.disabled = false; }
  });
  panoramaCalibrationInputs.rotation.forEach(input => input.addEventListener('input', () => {
    if (!panoramaCalibration) return;
    viewer?.applyPanoramaCalibration({ ...panoramaCalibration, rotationDegrees: panoramaCalibrationInputs.rotation.map(field => Number(field.value)) });
  }));

  nasaMeshToggle.addEventListener('change', () => viewer?.setNasaMeshVisible(nasaMeshToggle.checked));
  localMeshToggle.addEventListener('change', () => {
    if (EXPERIMENTAL3D) {
      localMeshToggle.checked = false;
      viewer?.setLocalReconstructionMeshVisible(false);
    } else viewer?.setLocalReconstructionMeshVisible(localMeshToggle.checked);
  });

  document.addEventListener('localechange', updateCopy);
  updateCopy();
}

