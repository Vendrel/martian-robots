import * as THREE from '../vendor/three/three.module.min.js';
import { GLTFLoader } from '../vendor/three/addons/loaders/GLTFLoader.js';
import { MTLLoader } from '../vendor/three/addons/loaders/MTLLoader.js';
import { OBJLoader } from '../vendor/three/addons/loaders/OBJLoader.js';
import { OrbitControls } from '../vendor/three/addons/controls/OrbitControls.js';
import { ROVER_CALIBRATION_CUBE } from './rover-calibration.js?2026110810';
import { cameraRayForPixel, textureUvForPixel } from './camera-projection.js?2026110808';
import { ROVER_NAV_ORIGIN_HEIGHT_METERS, configureRoverNavWorldFrame, roverNavToRenderQuaternion, roverNavToSiteQuaternion } from './scene-frame.js?2026110808';

// FileLoader resolves string URLs against the document, not this module. Use
// import.meta.url so both the extension root and a hosted subdirectory load
// the bundled GLB from the correct location.
const ROVER_ASSET_URLS = Object.freeze({
  './models/curiosity-rover/curiosity-rover.gltf': new URL('../models/curiosity-rover/curiosity-rover.gltf', import.meta.url).href,
  './models/perseverance-rover.glb': new URL('../models/perseverance-rover.glb', import.meta.url).href,
});
const MAX_PIXEL_RATIO = 2;
const CALIBRATION_CUBE_SIZE_METERS = .526;
export const CAMERA_DOLLY_MIN_DISTANCE_METERS = 1.2;
export const CAMERA_DOLLY_MAX_DISTANCE_METERS = 50;
export const CAMERA_ROVER_MAX_DISTANCE_METERS = 50;
export const CAMERA_MIN_HEIGHT_ABOVE_SURFACE_METERS = .2;
const CAMERA_WHEEL_DOLLY_SENSITIVITY = .002;
const GAMEPAD_LOOK_RADIANS_PER_SECOND = 1.35;
const GAMEPAD_MOVE_UNITS_PER_SECOND = .48;
const GAMEPAD_DOLLY_UNITS_PER_SECOND = 1.9;
const GAMEPAD_VERTICAL_UNITS_PER_SECOND = 1.5;
const GAMEPAD_LEFT_STICK_EXPONENT = 2.4;
const GAMEPAD_STICK_DEAD_ZONE = .14;
const GAMEPAD_TRIGGER_DEAD_ZONE = .08;
const GAMEPAD_LEFT_STICK_SENSITIVITY = 10;
const LOCAL_RECONSTRUCTION_GRID_SEGMENTS = 96;
const LOCAL_RECONSTRUCTION_EXTENT_METERS = 20;

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function rotateWxyz(vector, quaternionWxyz) {
  if (!Array.isArray(quaternionWxyz) || quaternionWxyz.length !== 4 || !quaternionWxyz.every(Number.isFinite)) return vector.clone();
  return vector.clone().applyQuaternion(new THREE.Quaternion(quaternionWxyz[1], quaternionWxyz[2], quaternionWxyz[3], quaternionWxyz[0]).normalize());
}

function siteToRenderFrame(vector) {
  // SITE is NED; Three.js is Y-up. This is the same NED→render adapter used
  // by navigationRelativeQuaternion(), applied directly to points and rays.
  return new THREE.Vector3(-vector.y, -vector.z, vector.x);
}

function cameraPointInRenderFrame(camera, roverFramePoint) {
  return siteToRenderFrame(rotateWxyz(roverFramePoint, camera.orientation));
}

function createEquirectangularReferenceGeometry(radius, columns = 96, rows = 48) {
  const positions = [], uvs = [], indices = [];
  for (let row = 0; row <= rows; row += 1) for (let column = 0; column <= columns; column += 1) {
    const u = column / columns, v = row / rows;
    // Inverse of app.js equirectangularPoint(), expressed in Three Y-up.
    const longitude = u * Math.PI * 2 - Math.PI;
    const latitude = Math.PI / 2 - v * Math.PI;
    const cosLatitude = Math.cos(latitude);
    positions.push(radius * cosLatitude * Math.sin(longitude), radius * Math.sin(latitude), radius * cosLatitude * Math.cos(longitude));
    uvs.push(u, 1 - v);
  }
  for (let row = 0; row < rows; row += 1) for (let column = 0; column < columns; column += 1) {
    const a = row * (columns + 1) + column, b = a + 1, c = a + columns + 1, d = c + 1;
    indices.push(a, c, b, b, c, d);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
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
  // Gamepad look is first-person. Orbit damping and the old near-horizontal
  // polar clamp both reinterpret a horizontal look target as an invalid orbit
  // and move the camera upward on subsequent frames.
  controls.enableDamping = false;
  controls.target.set(0, .8, 0);
  controls.minDistance = CAMERA_DOLLY_MIN_DISTANCE_METERS;
  controls.maxDistance = CAMERA_DOLLY_MAX_DISTANCE_METERS;
  controls.maxPolarAngle = Math.PI - .001;
  controls.enableZoom = false;

  scene.add(new THREE.HemisphereLight('#dcecff', '#49291c', 2.6));
  const sun = new THREE.DirectionalLight('#ffe0bd', 3.2);
  sun.position.set(6, 10, 4);
  sun.castShadow = true;
  scene.add(sun);

  // This is a real indexed triangle grid, deliberately initialized at zero
  // depth. The reconstruction worker will replace only its vertex heights and
  // confidence attributes; it is not a fabricated terrain fallback.
  const roverNavWorldFrame = new THREE.Group();
  roverNavWorldFrame.name = 'rover-nav-world-frame';
  configureRoverNavWorldFrame(roverNavWorldFrame);
  scene.add(roverNavWorldFrame);

  const localReconstructionNavigationFrame = new THREE.Group();
  localReconstructionNavigationFrame.name = 'local-stereo-reconstruction-nav-frame';
  roverNavWorldFrame.add(localReconstructionNavigationFrame);
  const localReconstructionCalibrationFrame = new THREE.Group();
  localReconstructionCalibrationFrame.name = 'local-stereo-reconstruction-calibration-frame';
  localReconstructionNavigationFrame.add(localReconstructionCalibrationFrame);
  const panoramaNavigationFrame = new THREE.Group();
  panoramaNavigationFrame.name = 'stereo-reference-panorama-nav-frame';
  scene.add(panoramaNavigationFrame);
  const panoramaCalibrationFrame = new THREE.Group();
  panoramaCalibrationFrame.name = 'stereo-reference-panorama-calibration-frame';
  panoramaCalibrationFrame.position.y = ROVER_NAV_ORIGIN_HEIGHT_METERS;
  panoramaNavigationFrame.add(panoramaCalibrationFrame);
  const panoramaReferencePatches = new THREE.Group();
  panoramaReferencePatches.name = 'sol-panorama-reference-patches';
  panoramaCalibrationFrame.add(panoramaReferencePatches);
  const localReconstructionMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(LOCAL_RECONSTRUCTION_EXTENT_METERS, LOCAL_RECONSTRUCTION_EXTENT_METERS, LOCAL_RECONSTRUCTION_GRID_SEGMENTS, LOCAL_RECONSTRUCTION_GRID_SEGMENTS),
    // This is an image-registration aid. White, unlit material preserves a
    // monochrome source image instead of tinting it with terrain lighting.
    new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide }),
  );
  localReconstructionMesh.name = 'local-stereo-reconstruction-grid';
  // The seed is expressed in raw ROVER_NAV coordinates: its XY plane has a
  // constant +Z (down) elevation. roverNavWorldFrame maps that to the
  // horizontal Three.js XZ ground plane, so no local -90° rotation belongs
  // here. The generated stereo geometry uses this exact same convention.
  localReconstructionMesh.rotation.set(0, 0, 0);
  // ROVER_NAV is located 25 cm above the world ground origin; +Z points down.
  // Put the fallback at raw Z=+0.25 so it coincides with world Y=0.
  localReconstructionMesh.position.z = ROVER_NAV_ORIGIN_HEIGHT_METERS;
  localReconstructionMesh.receiveShadow = true;
  localReconstructionCalibrationFrame.add(localReconstructionMesh);
  scene.add(new THREE.AxesHelper(1.4));
  // Cyan marker: documented ROVER_NAV origin and its +X (render +Z) forward
  // direction. It is 25 cm above the ground-level scene origin.
  const roverNavMarker = new THREE.Mesh(new THREE.SphereGeometry(.035, 12, 8), new THREE.MeshBasicMaterial({ color: '#6deeff' }));
  roverNavMarker.name = 'rover-nav-origin-marker';
  roverNavMarker.position.y = ROVER_NAV_ORIGIN_HEIGHT_METERS;
  scene.add(roverNavMarker);
  const roverNavForward = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, ROVER_NAV_ORIGIN_HEIGHT_METERS, 0), 2, '#6deeff', .16, .08);
  roverNavForward.name = 'rover-nav-forward-marker';
  scene.add(roverNavForward);

  const calibrationCube = new THREE.Mesh(
    new THREE.BoxGeometry(CALIBRATION_CUBE_SIZE_METERS, CALIBRATION_CUBE_SIZE_METERS, CALIBRATION_CUBE_SIZE_METERS),
    new THREE.MeshStandardMaterial({ color: '#e72f2f', roughness: .55, metalness: .05 }),
  );
  calibrationCube.name = 'rover-calibration-cube-50cm';
  calibrationCube.castShadow = true;
  calibrationCube.receiveShadow = true;
  calibrationCube.visible = ROVER_CALIBRATION_CUBE;
  scene.add(calibrationCube);

  const roverNavigationFrame = new THREE.Group();
  roverNavigationFrame.name = 'rover-nav-frame';
  roverNavWorldFrame.add(roverNavigationFrame);
  // The local terrain is a navigation-frame child, not a child of the GLTF
  // calibration chain. It therefore inherits exactly the rover's dynamic
  // API attitude while remaining independent of model-specific offsets,
  // rotations and scale corrections.
  roverNavigationFrame.add(localReconstructionNavigationFrame);
  const roverAnchor = new THREE.Group();
  // Calibration translation compensates for the imported model's own origin.
  // It therefore must be a child of the navigation frame: otherwise an API
  // attitude update rotates the mesh around its GLTF origin and makes a
  // visually centered rover orbit away from the world origin.
  roverAnchor.name = 'rover-calibrated-nav-pivot';
  roverNavigationFrame.add(roverAnchor);
  const roverCalibrationFrame = new THREE.Group();
  roverCalibrationFrame.name = 'rover-model-calibration-frame';
  roverAnchor.add(roverCalibrationFrame);
  const roverModelPivot = new THREE.Group();
  roverModelPivot.name = 'rover-model-pivot-to-rnav';
  roverCalibrationFrame.add(roverModelPivot);
  let active = false;
  let loaded = false;
  let roverAssetPath = null;
  let roverLoadEpoch = 0;
  let roverModel = null;
  let pdsMesh = null;
  const siteWorldFrame = new THREE.Group();
  siteWorldFrame.name = 'site-world-frame';
  siteWorldFrame.quaternion.copy(roverNavToRenderQuaternion());
  siteWorldFrame.position.y = ROVER_NAV_ORIGIN_HEIGHT_METERS;
  scene.add(siteWorldFrame);
  const pdsRoverRelativeFrame = new THREE.Group();
  pdsRoverRelativeFrame.name = 'pds-site-to-rover-relative-frame';
  siteWorldFrame.add(pdsRoverRelativeFrame);
  const pdsMeshFrame = new THREE.Group();
  pdsMeshFrame.name = 'pds-site-mesh-calibration-frame';
  pdsRoverRelativeFrame.add(pdsMeshFrame);
  const terrainRaycaster = new THREE.Raycaster();
  const verticalDirection = new THREE.Vector3(0, -1, 0);

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
    const roverPosition = roverAnchor.getWorldPosition(new THREE.Vector3());
    const nextPosition = camera.position.clone().add(delta);
    const roverOffset = nextPosition.clone().sub(roverPosition);
    if (roverOffset.length() > CAMERA_ROVER_MAX_DISTANCE_METERS) nextPosition.copy(roverPosition).add(roverOffset.setLength(CAMERA_ROVER_MAX_DISTANCE_METERS));
    delta.copy(nextPosition).sub(camera.position);
    controls.target.add(delta);
    camera.position.add(delta);
  };

  const lookFromCamera = (yaw, pitch, elapsed) => {
    // First-person look: the camera itself is the pivot. OrbitControls still
    // owns damping and mouse interaction, so move its target along the new
    // viewing ray rather than moving the camera around a distant target.
    const direction = controls.target.clone().sub(camera.position);
    const distance = Math.max(CAMERA_DOLLY_MIN_DISTANCE_METERS, direction.length());
    const spherical = new THREE.Spherical().setFromVector3(direction);
    spherical.theta -= yaw * GAMEPAD_LOOK_RADIANS_PER_SECOND * elapsed;
    spherical.phi = THREE.MathUtils.clamp(spherical.phi + pitch * GAMEPAD_LOOK_RADIANS_PER_SECOND * elapsed, .05, Math.PI - .05);
    controls.target.copy(camera.position).add(direction.setFromSpherical(spherical).setLength(distance));
    camera.lookAt(controls.target);
  };

  const dollyCamera = (amount, elapsed) => {
    if (!amount) return;
    const offset = camera.position.clone().sub(controls.target);
    const nextDistance = THREE.MathUtils.clamp(offset.length() * Math.exp(-amount * GAMEPAD_DOLLY_UNITS_PER_SECOND * elapsed), CAMERA_DOLLY_MIN_DISTANCE_METERS, CAMERA_DOLLY_MAX_DISTANCE_METERS);
    camera.position.copy(controls.target).add(offset.setLength(nextDistance));
  };

  const terrainHeightAt = (x, z) => {
    const terrain = [pdsMeshFrame, localReconstructionMesh].filter(object => object.visible && (object === localReconstructionMesh || pdsMesh));
    if (!terrain.length) return 0;
    const bounds = terrain.reduce((combined, object) => combined.union(new THREE.Box3().setFromObject(object)), new THREE.Box3());
    if (bounds.isEmpty()) return 0;
    terrainRaycaster.set(new THREE.Vector3(x, bounds.max.y + 10, z), verticalDirection);
    const hit = terrainRaycaster.intersectObjects(terrain, true)[0];
    return hit ? hit.point.y : 0;
  };

  const moveCameraVertically = (amount, elapsed) => {
    if (!amount) return;
    const delta = amount * GAMEPAD_VERTICAL_UNITS_PER_SECOND * elapsed;
    const minimumY = terrainHeightAt(camera.position.x, camera.position.z) + CAMERA_MIN_HEIGHT_ABOVE_SURFACE_METERS;
    const nextY = Math.max(minimumY, camera.position.y + delta);
    const applied = nextY - camera.position.y;
    camera.position.y = nextY;
    controls.target.y += applied;
  };

  const exponentialStick = value => {
    const magnitude = Math.abs(value);
    if (magnitude <= GAMEPAD_STICK_DEAD_ZONE) return 0;
    return Math.sign(value) * Math.pow((magnitude - GAMEPAD_STICK_DEAD_ZONE) / (1 - GAMEPAD_STICK_DEAD_ZONE), GAMEPAD_LEFT_STICK_EXPONENT);
  };

  const triggerAmount = value => {
    const normalized = Math.max(0, Number(value) || 0);
    if (normalized <= GAMEPAD_TRIGGER_DEAD_ZONE) return 0;
    const range = (normalized - GAMEPAD_TRIGGER_DEAD_ZONE) / (1 - GAMEPAD_TRIGGER_DEAD_ZONE);
    return range * range;
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
    lookFromCamera(rightX, rightY, elapsed);
    const leftX = exponentialStick(rawLeftX) * GAMEPAD_LEFT_STICK_SENSITIVITY;
    const leftY = exponentialStick(rawLeftY) * GAMEPAD_LEFT_STICK_SENSITIVITY;
    if (l1) dollyCamera(-leftY, elapsed);
    else moveCameraTarget(leftX, leftY, 0, elapsed);
    // Both trigger values are squared before combining, so their response is
    // exponential and holding both produces their signed resultant.
    moveCameraVertically(triggerAmount(r2) - triggerAmount(l2), elapsed);
  };
  window.addEventListener('martianrobots3dgamepad', onGamepad);

  const loadRoverModel = async (assetPath, roverName = 'rover') => {
    if (roverAssetPath === assetPath && roverModel) return roverModel;
    const assetUrl = ROVER_ASSET_URLS[assetPath];
    if (!assetUrl) throw Error(`unsupported-rover-asset:${assetPath || 'unknown'}`);
    const epoch = ++roverLoadEpoch;
    loaded = false;
    setStatus(`3D preview · loading ${roverName} model…`);
    return new Promise((resolve, reject) => new GLTFLoader().load(assetUrl, gltf => {
      if (epoch !== roverLoadEpoch) return resolve(null);
      if (roverModel) roverModelPivot.remove(roverModel);
      const rover = gltf.scene;
      rover.name = `${roverName}-rover`;
      rover.traverse(object => {
        if (object.isMesh) {
          object.castShadow = true;
          object.receiveShadow = true;
        }
      });
      roverModelPivot.add(rover);
      roverModel = rover;
      roverAssetPath = assetPath;
      loaded = true;
      setStatus(`3D preview · ${roverName} model loaded · reconstructed mesh pending`);
      resolve(rover);
    }, progress => {
      if (progress.total > 0) setStatus(`3D preview · loading ${roverName} model… ${Math.round(progress.loaded / progress.total * 100)}%`);
    }, error => {
      console.error('Rover model load failed', { url: assetUrl, error });
      setStatus(`3D preview · ${roverName} model could not be loaded: ${error?.message || 'unknown error'}`);
      reject(error || Error('rover-model-load-failed'));
    }));
  };

  const loadPdsMesh = async source => {
    if (source.coordinateFrame !== 'SITE_FRAME') throw Error(`unsupported-pds-mesh-frame:${source.coordinateFrame || 'unknown'}`);
    if (!Array.isArray(source.roverSitePositionMeters) || source.roverSitePositionMeters.length !== 3 || !source.roverSitePositionMeters.every(Number.isFinite)) throw Error('pds-rover-localization-missing');
    pdsRoverRelativeFrame.position.fromArray(source.roverSitePositionMeters).multiplyScalar(-1);
    const objResponse = await fetch(source.objUrl, { cache: 'force-cache' });
    if (!objResponse.ok) throw Error(`pds-obj-http-${objResponse.status}`);
    const objText = await objResponse.text();
    const resourceBase = new URL('./', source.objUrl).href;
    const mtlName = objText.match(/^\s*mtllib\s+(.+)$/mi)?.[1]?.trim();
    const objLoader = new OBJLoader();
    if (mtlName) {
      const mtlResponse = await fetch(new URL(mtlName, resourceBase), { cache: 'force-cache' });
      if (mtlResponse.ok) {
        const materials = new MTLLoader().setResourcePath(resourceBase).parse(await mtlResponse.text(), resourceBase);
        materials.preload();
        objLoader.setMaterials(materials);
      }
    }
    const nextMesh = objLoader.parse(objText);
    nextMesh.name = 'pds-navcam-terrain-mesh';
    nextMesh.traverse(object => { if (object.isMesh) { object.castShadow = false; object.receiveShadow = true; } });
    if (pdsMesh) pdsMeshFrame.remove(pdsMesh);
    pdsMesh = nextMesh;
    pdsMeshFrame.add(pdsMesh);
    return pdsMesh;
  };

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
    applyRoverNavigationOrientation(quaternionWxyz) {
      // The rover model, local reconstruction and camera reference all live
      // in the image metadata's absolute SITE pose.  A PDS comparison mesh is
      // optional and must never decide this pose.
      roverNavigationFrame.quaternion.copy(roverNavToSiteQuaternion(quaternionWxyz));
      // Mesh vertices are raw ROVER_NAV points under roverNavigationFrame.
      // Keeping this intermediate frame neutral prevents a second attitude
      // multiplication and makes the terrain inherit the rover pose.
      localReconstructionNavigationFrame.quaternion.identity();
      // Patches are converted individually into SITE/world coordinates.
      // Applying rover navigation again here would rotate them a second time.
      panoramaNavigationFrame.quaternion.identity();
    },
    loadPdsMesh,
    loadRoverModel,
    applyMeshCalibration(calibration) {
      const position = calibration?.positionMeters || [];
      const rotation = calibration?.rotationDegrees || [];
      pdsMeshFrame.position.set(finite(position[0], 0), finite(position[1], 0), finite(position[2], 0));
      pdsMeshFrame.rotation.set(THREE.MathUtils.degToRad(finite(rotation[0], 0)), THREE.MathUtils.degToRad(finite(rotation[1], 0)), THREE.MathUtils.degToRad(finite(rotation[2], 0)));
      pdsMeshFrame.scale.setScalar(Math.max(.000001, finite(calibration?.scale, 1)));
    },
    applyLocalMeshCalibration(calibration) {
      const position = calibration?.positionMeters || [];
      const rotation = calibration?.rotationDegrees || [];
      localReconstructionCalibrationFrame.position.set(finite(position[0], 0), finite(position[1], 0), finite(position[2], 0));
      localReconstructionCalibrationFrame.rotation.set(THREE.MathUtils.degToRad(finite(rotation[0], 0)), THREE.MathUtils.degToRad(finite(rotation[1], 0)), THREE.MathUtils.degToRad(finite(rotation[2], 0)));
      localReconstructionCalibrationFrame.scale.setScalar(Math.max(.000001, finite(calibration?.scale, 1)));
    },
    applyTerrainCalibration(calibration) {
      // Keep NASA-derived geometry, the local heightfield and its source-image
      // reference under one explicit calibration contract.
      this.applyMeshCalibration(calibration);
      this.applyLocalMeshCalibration(calibration);
    },
    applyPanoramaCalibration(calibration) {
      const rotation = calibration?.rotationDegrees || [];
      panoramaCalibrationFrame.rotation.set(THREE.MathUtils.degToRad(finite(rotation[0], 0)), THREE.MathUtils.degToRad(finite(rotation[1], 0)), THREE.MathUtils.degToRad(finite(rotation[2], 0)));
    },
    setNasaMeshVisible(visible) {
      pdsMeshFrame.visible = Boolean(visible);
    },
    setLocalReconstructionMeshVisible(visible) {
      localReconstructionMesh.visible = Boolean(visible);
    },
    applyLocalStereoReconstruction(reconstruction, cameraOrientationWxyz = null) {
      const positions = reconstruction?.positions;
      const indices = reconstruction?.indices;
      const uvs = reconstruction?.uvs;
      if (!(positions instanceof Float32Array) || !(indices instanceof Uint32Array) || !positions.length || !indices.length) throw Error('local-stereo-insufficient-triangles');
      // The vertices originate in this exact stereo camera's ROVER_NAV frame.
      // Its parent already owns that camera's attitude; do not multiply it
      // again here. The argument records the selected source camera at the
      // caller; geometry itself is intentionally neutral.
      localReconstructionNavigationFrame.quaternion.identity();
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setIndex(new THREE.BufferAttribute(indices, 1));
      if (uvs instanceof Float32Array && uvs.length === positions.length / 3 * 2) geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      geometry.computeVertexNormals();
      geometry.computeBoundingBox();
      localReconstructionMesh.geometry.dispose();
      localReconstructionMesh.geometry = geometry;
      // The seed and reconstructed vertices are in raw ROVER_NAV coordinates;
      // neither needs an additional local rotation.
      localReconstructionMesh.rotation.set(0, 0, 0);
      // The fallback plane is offset to raw Z=+0.25. Real triangulated
      // vertices already carry their physical ROVER_NAV Z coordinates.
      localReconstructionMesh.position.set(0, 0, 0);
      localReconstructionMesh.visible = true;
      return { vertices: positions.length / 3, triangles: indices.length / 3, valid: reconstruction.valid || 0 };
    },
    applyLocalStereoTexture(imageBitmap) {
      if (!imageBitmap) return;
      localReconstructionMesh.material.map?.dispose();
      const texture = new THREE.Texture(imageBitmap);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
      localReconstructionMesh.material.map = texture;
      localReconstructionMesh.material.needsUpdate = true;
    },
    clearPanoramaReferenceImages() {
      for (const patch of [...panoramaReferencePatches.children]) {
        patch.geometry.dispose();
        patch.material.map?.dispose();
        patch.material.dispose();
        panoramaReferencePatches.remove(patch);
      }
    },
    setPanoramaEquirectangular(canvas) {
      if (!canvas?.width || !canvas?.height) throw Error('invalid-equirectangular-panorama');
      this.clearPanoramaReferenceImages();
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
      const panorama = new THREE.Mesh(
        createEquirectangularReferenceGeometry(25),
        new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide, depthWrite: false }),
      );
      panorama.name = 'sol-panorama-equirectangular-reference';
      panoramaReferencePatches.add(panorama);
    },
    addPanoramaReferenceImage(imageBitmap, cameraModel, imageId = '') {
      if (!imageBitmap || !cameraModel?.C || !cameraModel?.A || !cameraModel?.H || !cameraModel?.V) return;
      // Match the 2D panorama's adaptive tessellation: a fisheye cannot be
      // represented faithfully by the small CAHV reference patch grid.
      const cameraType = String(cameraModel.type || 'CAHV').toUpperCase();
      const columns = cameraType === 'CAHVORE' ? 48 : cameraType === 'CAHVOR' ? 20 : 12;
      const rows = columns;
      const radius = 25;
      const positions = [], uvs = [], indices = [];
      const center = cameraPointInRenderFrame(cameraModel, new THREE.Vector3().fromArray(cameraModel.C));
      for (let row = 0; row <= rows; row += 1) for (let column = 0; column <= columns; column += 1) {
        const u = column / columns * imageBitmap.width, v = row / rows * imageBitmap.height;
        const ray = cameraRayForPixel(cameraModel, u, v);
        const point = ray ? center.clone().addScaledVector(cameraPointInRenderFrame(cameraModel, new THREE.Vector3().fromArray(ray)), radius) : center;
        positions.push(point.x, point.y, point.z);
        uvs.push(...textureUvForPixel([u, v], imageBitmap.width, imageBitmap.height));
      }
      for (let row = 0; row < rows; row += 1) for (let column = 0; column < columns; column += 1) {
        const a = row * (columns + 1) + column, b = a + 1, c = a + columns + 1, d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setIndex(indices);
      const texture = new THREE.Texture(imageBitmap);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
      const patch = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, depthWrite: false }));
      patch.name = `sol-panorama-reference:${imageId}`;
      panoramaReferencePatches.add(patch);
    },
    applyStereoReferenceImage(imageBitmap, cameraModel, imageId = '') {
      this.clearPanoramaReferenceImages();
      this.addPanoramaReferenceImage(imageBitmap, cameraModel, imageId);
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
