// The full explorer needs a normal browser tab; an action popup would constrain
// the panorama canvas and fullscreen controls to Chrome's popup dimensions.
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
});
