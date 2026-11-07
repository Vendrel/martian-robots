import { detectAcceleration } from './acceleration.js';
import { loadRoverCalibration, saveRoverCalibration } from './store.js';
import { createThreeDViewer } from './viewer.js';

function text(key, fallback) {
  return window.localeDictionary?.[key] || fallback;
}

function setMode(buttons, mode) {
  for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.sceneMode === mode));
}

export const SHOW2D3DBUTTON = false;
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
  const calibrationSave = workspace.querySelector('[data-rover-calibration-save]');
  const calibrationInputs = {
    position: [...workspace.querySelectorAll('[data-rover-calibration-position]')],
    rotation: [...workspace.querySelectorAll('[data-rover-calibration-rotation]')],
    scale: workspace.querySelector('[data-rover-calibration-scale]'),
    cube: [...workspace.querySelectorAll('[data-rover-calibration-cube]')],
  };
  let acceleration = null;
  let calibration = null;
  let viewer = null;

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

  const syncCalibrationFields = () => {
    if (!calibration) return;
    calibrationInputs.position.forEach((input, index) => input.value = String(calibration.positionMeters[index]));
    calibrationInputs.rotation.forEach((input, index) => input.value = String(calibration.rotationDegrees[index]));
    calibrationInputs.scale.value = String(calibration.scale);
    calibrationInputs.cube.forEach((input, index) => input.value = String(calibration.cubePositionMeters[index]));
    viewer?.applyRoverCalibration(calibration);
  };

  const updateCopy = () => {
    toggle.setAttribute('aria-label', text('threeDModeLabel', 'View mode'));
    workspace.querySelector('[data-three-d-title]').textContent = text('threeDWorkspaceTitle', '3D workspace');
    preflight.textContent = text('threeDPreflight', 'Run 3D readiness check');
    workspace.querySelector('[data-three-d-calibration-title]').textContent = text('threeDCalibrationTitle', 'Rover model calibration');
    workspace.querySelector('[data-three-d-calibration-note]').textContent = text('threeDCalibrationNote', 'Values are in scene metres and degrees. They remain unverified until the model-frame audit is complete.');
    workspace.querySelector('[data-three-d-scale-label]').textContent = text('threeDScaleLabel', 'Scale');
    workspace.querySelector('[data-three-d-cube-title]').textContent = text('threeDCubeTitle', '50 cm calibration cube');
    workspace.querySelector('[data-three-d-cube-note]').textContent = text('threeDCubeNote', 'Red cube centre in scene metres. The cube stays axis-aligned on the surface; cyan +Z arrow is 0° forward.');
    workspace.querySelector('[data-three-d-controls-note]').textContent = text('threeDControlsNote', 'Mouse wheel: dolly · Gamepad: exponential sticks, L1 + left stick vertical inspects/dollies, R2 approaches, L2 retreats, L3 resets, R3 focuses rover, Square toggles fullscreen.');
    calibrationSave.textContent = text('threeDCalibrationSave', 'Save rover calibration');
    if (!status.textContent) status.textContent = text('threeDIdle', 'Select a source image, then run the readiness check.');
  };

  const showWorkspace = async () => {
    workspace.hidden = false;
    setMode(buttons, '3d');
    viewport.hidden = false;
    document.body.dataset.sceneMode = '3d';
    viewport.closest('#panoramaWrap').classList.add('is-three-d');
    acceleration ||= await detectAcceleration();
    const context = getSceneContext();
    calibration = await loadRoverCalibration(context.rover);
    const currentOrientation = averageRoverOrientation(context.orientationSamples || []);
    if (!calibration.orientationReferenceWxyz && currentOrientation) {
      calibration = await saveRoverCalibration(context.rover, { ...calibration, orientationReferenceWxyz: currentOrientation });
    }
    syncCalibrationFields();
    status.textContent = `${text('threeDReady', 'Ready for 3D')} · ${acceleration.backend} / ${acceleration.profile} · ${calibration.calibrated ? text('threeDModelCalibrated', 'rover model calibrated') : text('threeDModelPending', 'rover model calibration pending')}`;
    const activeViewer = await getViewer();
    activeViewer.applyRoverCalibration(calibration);
    activeViewer.applyRoverNavigationOrientation(currentOrientation, calibration.orientationReferenceWxyz);
    activeViewer.activate();
  };

  const hideWorkspace = () => {
    workspace.hidden = true;
    viewport.hidden = true;
    document.body.dataset.sceneMode = '2d';
    viewport.closest('#panoramaWrap').classList.remove('is-three-d');
    viewer?.deactivate();
    setMode(buttons, '2d');
  };

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
        orientationReferenceWxyz: averageRoverOrientation(context.orientationSamples || []),
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

  document.addEventListener('localechange', updateCopy);
  updateCopy();
}

