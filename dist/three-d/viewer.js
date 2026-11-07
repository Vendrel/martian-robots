import * as THREE from '../vendor/three/three.module.min.js';
import { GLTFLoader } from '../vendor/three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from '../vendor/three/addons/controls/OrbitControls.js';
import { ROVER_CALIBRATION_CUBE } from './rover-calibration.js';

// FileLoader resolves string URLs against the document, not this module. Use
// import.meta.url so both the extension root and a hosted subdirectory load
// the bundled GLB from the correct location.
const ROVER_ASSET_URL = new URL('../models/curiosity-rover/curiosity-rover.gltf', import.meta.url).href;
const MAX_PIXEL_RATIO = 2;
const CALIBRATION_CUBE_SIZE_METERS = .5;
export const CAMERA_DOLLY_MIN_DISTANCE_METERS = 1.2;
export const CAMERA_DOLLY_MAX_DISTANCE_METERS = 50;
const CAMERA_WHEEL_DOLLY_SENSITIVITY = .002;
const GAMEPAD_LOOK_RADIANS_PER_SECOND = 1.35;
const GAMEPAD_MOVE_UNITS_PER_SECOND = .48;
const GAMEPAD_DOLLY_UNITS_PER_SECOND = 1.9;
const GAMEPAD_LEFT_STICK_EXPONENT = 2.4;
const GAMEPAD_STICK_DEAD_ZONE = .14;

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Render-only scene shell. Scene reconstruction deliberately remains outside
 * this module: it will supply a mesh already expressed in the documented S
 * frame. This viewer uses Three's Y-up render frame until that adapter exists.
 */
export function createThreeDViewer(container, setStatus) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#34251f');
  scene.fog = new THREE.Fog('#34251f', 14, 55);

  const camera = new THREE.PerspectiveCamera(45, 1, .05, 500);
  camera.position.set(5.8, 3.5, 7.8);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.prepend(renderer.domElement);
  for (const eventName of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'wheel']) {
    renderer.domElement.addEventListener(eventName, event => event.stopPropagation());
  }

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, .8, 0);
  controls.minDistance = CAMERA_DOLLY_MIN_DISTANCE_METERS;
  controls.maxDistance = CAMERA_DOLLY_MAX_DISTANCE_METERS;
  controls.maxPolarAngle = Math.PI * .495;
  controls.enableZoom = false;

  scene.add(new THREE.HemisphereLight('#dcecff', '#49291c', 2.6));
  const sun = new THREE.DirectionalLight('#ffe0bd', 3.2);
  sun.position.set(6, 10, 4);
  sun.castShadow = true;
  scene.add(sun);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshStandardMaterial({ color: '#6c4632', roughness: 1, metalness: 0 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  scene.add(new THREE.GridHelper(40, 40, '#d89261', '#79513c'));
  scene.add(new THREE.AxesHelper(1.4));
  // Scene forward: +Z is the zero-degree direction. The rover is calibrated
  // against this fixed world reference rather than against the camera.
  scene.add(new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, .012, 0), 2, '#6deeff', .16, .08));

  const calibrationCube = new THREE.Mesh(
    new THREE.BoxGeometry(CALIBRATION_CUBE_SIZE_METERS, CALIBRATION_CUBE_SIZE_METERS, CALIBRATION_CUBE_SIZE_METERS),
    new THREE.MeshStandardMaterial({ color: '#e72f2f', roughness: .55, metalness: .05 }),
  );
  calibrationCube.name = 'rover-calibration-cube-50cm';
  calibrationCube.castShadow = true;
  calibrationCube.receiveShadow = true;
  calibrationCube.visible = ROVER_CALIBRATION_CUBE;
  scene.add(calibrationCube);

  const roverAnchor = new THREE.Group();
  roverAnchor.name = 'rover-world-position';
  scene.add(roverAnchor);
  const roverNavigationFrame = new THREE.Group();
  roverNavigationFrame.name = 'rover-nav-frame';
  roverAnchor.add(roverNavigationFrame);
  const roverCalibrationFrame = new THREE.Group();
  roverCalibrationFrame.name = 'rover-model-calibration-frame';
  roverNavigationFrame.add(roverCalibrationFrame);
  const roverModelPivot = new THREE.Group();
  roverModelPivot.name = 'rover-model-pivot-to-rnav';
  roverCalibrationFrame.add(roverModelPivot);
  let active = false;
  let loaded = false;

  const resetCamera = () => {
    controls.target.set(0, .8, 0);
    camera.position.set(5.8, 3.5, 7.8);
    controls.update();
  };

  const focusRover = () => {
    const previousTarget = controls.target.clone();
    const roverPosition = roverAnchor.getWorldPosition(new THREE.Vector3());
    const cameraOffset = camera.position.clone().sub(previousTarget);
    controls.target.copy(roverPosition);
    camera.position.copy(roverPosition).add(cameraOffset);
    controls.update();
  };

  const moveCameraTarget = (right, forward, vertical, elapsed) => {
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    direction.y = 0;
    direction.normalize();
    const sideways = new THREE.Vector3().crossVectors(direction, camera.up).normalize();
    const delta = sideways.multiplyScalar(right).addScaledVector(direction, -forward).multiplyScalar(GAMEPAD_MOVE_UNITS_PER_SECOND * elapsed);
    delta.y = vertical * GAMEPAD_MOVE_UNITS_PER_SECOND * elapsed;
    controls.target.add(delta);
    camera.position.add(delta);
  };

  const orbitCamera = (yaw, pitch, elapsed) => {
    const offset = camera.position.clone().sub(controls.target);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    spherical.theta -= yaw * GAMEPAD_LOOK_RADIANS_PER_SECOND * elapsed;
    spherical.phi = THREE.MathUtils.clamp(spherical.phi + pitch * GAMEPAD_LOOK_RADIANS_PER_SECOND * elapsed, .05, Math.PI * .495);
    camera.position.copy(controls.target).add(offset.setFromSpherical(spherical));
  };

  const dollyCamera = (amount, elapsed) => {
    if (!amount) return;
    const offset = camera.position.clone().sub(controls.target);
    const nextDistance = THREE.MathUtils.clamp(offset.length() * Math.exp(-amount * GAMEPAD_DOLLY_UNITS_PER_SECOND * elapsed), CAMERA_DOLLY_MIN_DISTANCE_METERS, CAMERA_DOLLY_MAX_DISTANCE_METERS);
    camera.position.copy(controls.target).add(offset.setLength(nextDistance));
  };

  const exponentialStick = value => {
    const magnitude = Math.abs(value);
    if (magnitude <= GAMEPAD_STICK_DEAD_ZONE) return 0;
    return Math.sign(value) * Math.pow((magnitude - GAMEPAD_STICK_DEAD_ZONE) / (1 - GAMEPAD_STICK_DEAD_ZONE), GAMEPAD_LEFT_STICK_EXPONENT);
  };

  renderer.domElement.addEventListener('wheel', event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    dollyCamera(-event.deltaY * CAMERA_WHEEL_DOLLY_SENSITIVITY, 1);
  }, { passive: false });

  const onGamepad = event => {
    if (!active) return;
    const { elapsed, leftX: rawLeftX, leftY: rawLeftY, rightX: rawRightX, rightY: rawRightY, l1, l2, r2, reset, focus, fullscreen } = event.detail;
    if (fullscreen) {
      const fullscreenHost = container.closest('#panoramaWrap');
      if (document.fullscreenElement) document.exitFullscreen();
      else fullscreenHost?.requestFullscreen();
    }
    if (reset) resetCamera();
    if (focus) focusRover();
    const rightX = exponentialStick(rawRightX);
    const rightY = exponentialStick(rawRightY);
    orbitCamera(rightX, rightY, elapsed);
    const leftX = exponentialStick(rawLeftX);
    const leftY = exponentialStick(rawLeftY);
    if (l1) dollyCamera(-leftY, elapsed);
    else moveCameraTarget(leftX, leftY, 0, elapsed);
    dollyCamera((r2 || 0) ** 2 - (l2 || 0) ** 2, elapsed);
  };
  window.addEventListener('martianrobots3dgamepad', onGamepad);

  new GLTFLoader().load(ROVER_ASSET_URL, gltf => {
    const rover = gltf.scene;
    rover.name = 'curiosity-rover';
    rover.traverse(object => {
      if (object.isMesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    roverModelPivot.add(rover);
    loaded = true;
    setStatus('3D preview · rover model loaded · reconstructed mesh pending');
  }, progress => {
    if (progress.total > 0) setStatus(`3D preview · loading rover model… ${Math.round(progress.loaded / progress.total * 100)}%`);
  }, error => {
    console.error('Curiosity rover model load failed', { url: ROVER_ASSET_URL, error });
    setStatus(`3D preview · rover model could not be loaded: ${error?.message || 'unknown error'}`);
  });

  const resize = () => {
    const { width, height } = container.getBoundingClientRect();
    if (!width || !height) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();

  const render = () => {
    if (!active) return;
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(render);
  };

  return {
    activate() {
      if (active) return;
      active = true;
      resize();
      setStatus(loaded ? '3D preview · rover model loaded · reconstructed mesh pending' : '3D preview · loading rover model…');
      render();
    },
    deactivate() { active = false; },
    applyRoverCalibration(calibration) {
      const position = calibration?.positionMeters || [];
      const rotation = calibration?.rotationDegrees || [];
      roverAnchor.position.set(finite(position[0], 0), finite(position[1], 0), finite(position[2], 0));
      roverCalibrationFrame.rotation.set(THREE.MathUtils.degToRad(finite(rotation[0], 0)), THREE.MathUtils.degToRad(finite(rotation[1], 0)), THREE.MathUtils.degToRad(finite(rotation[2], 0)));
      roverCalibrationFrame.scale.setScalar(Math.max(.000001, finite(calibration?.scale, 1)));
      const modelPivot = calibration?.modelPivotOffsetMeters || [];
      roverModelPivot.position.set(finite(modelPivot[0], 0), finite(modelPivot[1], 0), finite(modelPivot[2], 0));
      const cube = calibration?.cubePositionMeters || [];
      calibrationCube.position.set(finite(cube[0], 1), finite(cube[1], CALIBRATION_CUBE_SIZE_METERS / 2), finite(cube[2], 0));
    },
    applyRoverNavigationOrientation(quaternionWxyz, referenceWxyz = null) {
      if (!Array.isArray(quaternionWxyz) || quaternionWxyz.length !== 4 || !quaternionWxyz.every(Number.isFinite)) {
        roverNavigationFrame.quaternion.identity();
        return;
      }
      // PDS uses a right-handed North-East-Down SITE/RNAV basis. Render maps
      // NED -> Three.js as (-East, -Down, North), a proper rotation that keeps
      // +Z as documented 0° forward and +Y up.
      const nedToRender = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().set(
        0, -1, 0, 0,
        0, 0, -1, 0,
        1, 0, 0, 0,
        0, 0, 0, 1,
      ));
      const source = new THREE.Quaternion(quaternionWxyz[1], quaternionWxyz[2], quaternionWxyz[3], quaternionWxyz[0]).normalize();
      const reference = Array.isArray(referenceWxyz) && referenceWxyz.length === 4 ? new THREE.Quaternion(referenceWxyz[1], referenceWxyz[2], referenceWxyz[3], referenceWxyz[0]).normalize() : new THREE.Quaternion();
      const relative = source.multiply(reference.invert());
      roverNavigationFrame.quaternion.copy(nedToRender).multiply(relative).multiply(nedToRender.clone().invert()).normalize();
    },
    dispose() {
      active = false;
      resizeObserver.disconnect();
      window.removeEventListener('martianrobots3dgamepad', onGamepad);
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
