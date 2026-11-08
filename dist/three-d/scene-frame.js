import * as THREE from '../vendor/three/three.module.min.js';

// The documented ROVER_NAV origin is centered between the two middle wheel
// centres. The scene's ground origin is directly below it, hence +Y = 0.25 m.
export const ROVER_NAV_ORIGIN_HEIGHT_METERS = .25;

// NASA rover/SITE coordinates are right-handed, with +X forward and +Z down.
// The render scene is right-handed, +Z forward and +Y up.
export const ROVER_NAV_TO_RENDER_MATRIX = new THREE.Matrix4().set(
  0, -1, 0, 0,
  0, 0, -1, 0,
  1, 0, 0, 0,
  0, 0, 0, 1,
);

export function roverNavToRenderQuaternion() {
  return new THREE.Quaternion().setFromRotationMatrix(ROVER_NAV_TO_RENDER_MATRIX);
}

/** API attitude maps the current ROVER_NAV frame directly into SITE_FRAME. */
export function roverNavToSiteQuaternion(quaternionWxyz) {
  if (!Array.isArray(quaternionWxyz) || quaternionWxyz.length !== 4 || !quaternionWxyz.every(Number.isFinite)) return new THREE.Quaternion();
  return new THREE.Quaternion(quaternionWxyz[1], quaternionWxyz[2], quaternionWxyz[3], quaternionWxyz[0]).normalize();
}

export function configureRoverNavWorldFrame(frame) {
  frame.position.set(0, ROVER_NAV_ORIGIN_HEIGHT_METERS, 0);
  frame.quaternion.copy(roverNavToRenderQuaternion());
}
