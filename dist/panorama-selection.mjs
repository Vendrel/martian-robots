/**
 * Pure panorama-candidate selection.
 *
 * The renderer owns image loading and camera geometry; this module only
 * decides which already-valid records form the visual panorama. Keeping this
 * decision independent makes stereo and duplicate regressions testable
 * without a browser canvas.
 */
export function selectPanoramaCandidates(images, {
  captureTime,
  imageAxis,
  imageIdentity,
  isRenderable = () => true,
  priority = () => 0,
  stereoDescriptor = () => null,
  viewSignature,
  duplicateToleranceDegrees,
}) {
  const decisions = new Map();
  const sorted = [...images]
    .filter(isRenderable)
    .sort((left, right) => captureTime(left) - captureTime(right) || imageIdentity(left).localeCompare(imageIdentity(right)));
  const leftStereoKeys = new Set(sorted
    .map(image => ({ image, stereo: stereoDescriptor(image) }))
    .filter(({ stereo }) => stereo?.side === 'left' && stereo.key)
    .map(({ stereo }) => stereo.key));
  const source = sorted.filter(image => {
    const stereo = stereoDescriptor(image);
    if (stereo?.side === 'right' && stereo.key && leftStereoKeys.has(stereo.key)) {
      decisions.set(imageIdentity(image), 'stereo-right-suppressed');
      return false;
    }
    return true;
  });
  const minimumDot = Math.cos(duplicateToleranceDegrees * Math.PI / 180);
  const groups = [];
  for (const image of source) {
    const axis = imageAxis(image);
    const signature = viewSignature(image);
    const match = axis && groups.find(group => group.signature === signature && group.axis && dot(group.axis, axis) >= minimumDot);
    if (!match) {
      groups.push({ axis, image, signature });
      decisions.set(imageIdentity(image), 'rendered');
      continue;
    }
    // The input is ordered oldest-to-newest, so equal-quality duplicate
    // products retain the newer record just as the former reducer did.
    if (priority(image) >= priority(match.image)) {
      decisions.set(imageIdentity(match.image), 'duplicate-view');
      match.image = image;
      decisions.set(imageIdentity(image), 'rendered');
    } else decisions.set(imageIdentity(image), 'duplicate-view');
  }
  return { images: groups.map(group => group.image), decisions };
}

function dot(left, right) {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}
