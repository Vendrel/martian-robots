import assert from 'node:assert/strict';
import { selectPanoramaCandidates } from '../dist/panorama-selection.mjs';

const image = ({ id, axis, side, capture = 0, subframe = 'full', quality = 0, pair = null }) => ({ id, axis, side, capture, subframe, quality, pair });
const select = records => selectPanoramaCandidates(records, {
  captureTime: record => record.capture,
  imageAxis: record => record.axis,
  imageIdentity: record => record.id,
  priority: record => record.quality,
  stereoDescriptor: record => record.side ? { side: record.side, key: record.pair } : null,
  viewSignature: record => record.subframe,
  duplicateToleranceDegrees: .05,
});

{
  const left = image({ id: 'left', axis: [1, 0, 0], side: 'left', pair: 'capture-1' });
  const right = image({ id: 'right', axis: [1, 0, 0], side: 'right', pair: 'capture-1' });
  const result = select([right, left]);
  assert.deepEqual(result.images.map(record => record.id), ['left']);
  assert.equal(result.decisions.get('right'), 'stereo-right-suppressed');
}
{
  const right = image({ id: 'right-only', axis: [1, 0, 0], side: 'right', pair: 'capture-2' });
  const result = select([right]);
  assert.deepEqual(result.images.map(record => record.id), ['right-only']);
}
{
  const full = image({ id: 'full', axis: [1, 0, 0], subframe: 'full', quality: 3 });
  const crop = image({ id: 'crop', axis: [1, 0, 0], subframe: 'crop', quality: 1 });
  const result = select([full, crop]);
  assert.deepEqual(result.images.map(record => record.id).sort(), ['crop', 'full']);
}
{
  const first = image({ id: 'first', axis: [1, 0, 0], quality: 1 });
  const shifted = image({ id: 'shifted', axis: [Math.cos(.513 * Math.PI / 180), Math.sin(.513 * Math.PI / 180), 0], quality: 1 });
  const result = select([first, shifted]);
  assert.equal(result.images.length, 2);
}
{
  const older = image({ id: 'older', axis: [1, 0, 0], capture: 1, quality: 1 });
  const newer = image({ id: 'newer', axis: [1, 0, 0], capture: 2, quality: 1 });
  const result = select([newer, older]);
  assert.deepEqual(result.images.map(record => record.id), ['newer']);
}

console.log('panorama-selection regressions: passed');
