window.localeDictionaries ||= {};
window.localeDictionaries.en = {
  code: 'en',
  name: 'English',
  controlEyebrow: 'MISSION EXPLORER',
  title: 'Look around where the rovers looked.',
  roverLabel: 'Rover', solLabel: 'Sol', solDirectLabel: 'Go to Sol', solQuotaTooltip: 'Changing Sol may request a new image set and use the daily NASA download allowance.', earthDateLabel: 'Earth date',
  loadButton: 'Load panorama', readyStatus: 'Ready to map image geometry',
  loading: 'Retrieving image geometry…', selectionLoading: 'Applying the shared image selection…', horizon: 'ROVER FORWARD', dragHint: 'Drag to explore', fullscreen: 'Toggle fullscreen',
  coverageLabel: 'Coverage', altHint: 'Hold <kbd>Alt</kbd> over an overlap to reveal the image beneath.',
  imagePanelEyebrow: 'IMAGE INFO PANEL', selectionPanelTitle: 'IMAGE SELECTION', openSource: 'Open original image ↗', downloadAll: 'Download all', downloadSelected: 'Download selected', showThem: 'Show Them', selectedImageGallery: 'Selected images', imagesSelected: '{count} IMAGES SELECTED', selectionHint: 'Shift-Click: Circular Selection of Images · Esc: Cancel Selection', downloading: 'Downloading {current}/{total}…', imageUrlListCopied: 'Image URL List Copied to Clipboard', clipboardUnavailable: 'Image URL List Unavailable',
  legendGeometry: 'Each frame is positioned from its available camera axis and elevation data.',
  legendLayer: 'Later images render above earlier captures.',
  noImages: 'No geometry-ready images were returned for this Sol.',
  pdsArchiveRequired: 'Spirit and Opportunity use NASA PDS archive products; their browser image decoder is not available yet.',
  fallbackStatus: 'Showing a local geometry sample — live feed is unavailable.',
  loadedStatus: 'Mapped {count} geometry-ready images from {total} records.',
  imageProgress: '{loaded} / {total} image textures ready',
  loadingStatus: 'Retrieving NASA public image records…',
  comingSoon: 'Mission adapter ready — image feed coming next.',
  metadata: { rover: 'Rover', camera: 'Camera', sol: 'Sol', earthDate: 'Earth date', captured: 'Captured', siteDrive: 'Site / drive', cameraModel: 'Camera model', cameraAxis: 'Camera axis', cameraPosition: 'Camera position', mastAngles: 'Mast az / el', source: 'Source' }
};
