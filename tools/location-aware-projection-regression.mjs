import assert from 'node:assert/strict';
import {
  cameraTranslationInScene,
  locationAwareProjectionEnabled,
  locationAwareRayVector,
  locationResolutionMeters,
} from '../dist/location-aware-projection.mjs';

assert.equal(locationResolutionMeters(0), 0);
assert.equal(locationResolutionMeters(100), 25);
assert.equal(locationResolutionMeters(50), 6.25);
assert.equal(locationAwareProjectionEnabled('curiosity'), false);
assert.equal(locationAwareProjectionEnabled('curiosity', { enabled: true, enabledByRover: { curiosity: true } }), true);
assert.equal(locationAwareProjectionEnabled('opportunity', { enabled: true, enabledByRover: { curiosity: true } }), false);

const translation = cameraTranslationInScene({
  roverPosition: [3, 4, 0],
  referenceRoverPosition: [1, 1, 0],
  cameraOffsetInScene: [.5, 0, 1],
  maximumRoverBaselineMeters: 5,
});
assert.deepEqual(translation, [2.5, 3, 1]);
assert.equal(cameraTranslationInScene({
  roverPosition: [3, 4, 0],
  referenceRoverPosition: [1, 1, 0],
  cameraOffsetInScene: [0, 0, 0],
  maximumRoverBaselineMeters: 3.5,
}), null);

assert.deepEqual(locationAwareRayVector({
  ray: [1, 0, 0],
  cameraTranslation: [2, 3, 1],
  viewerOffset: [.1, 0, 0],
  parallaxDepth: 1,
  shellRadiusMeters: 40,
}), [38, 3, 1]);

console.log('location-aware projection regressions: passed');
