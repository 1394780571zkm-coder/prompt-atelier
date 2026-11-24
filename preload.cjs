const {contextBridge,ipcRenderer} = require('electron');
const call = name => (...args) => ipcRenderer.invoke(name,...args);
contextBridge.exposeInMainWorld('desktop',{
  snapshot:call('snapshot'), draft:call('draft'), save:call('save'), classify:call('classify'),
  createCategory:call('create-category'), switchCategory:call('switch-category'),
  translatePrompt:call('translate-prompt'),
  translateFragments:call('translate-fragments'),
  deleteEntries:call('delete-entries'),
  saveVariant:call('save-variant'), suggestFragment:call('suggest-fragment'), groupSplitterPrompt:call('group-splitter-prompt'),
  recordParameterUse:call('record-parameter-use'),
  image:call('image'), remoteImage:call('remote-image'), gallery:call('gallery'), linkGalleryImage:call('link-gallery-image'), editEntry:call('edit-entry'),
  pasteImage:call('paste-image'),
  createGalleryGroup:call('create-gallery-group'), moveGalleryImages:call('move-gallery-images'),
  deleteGalleryImage:call('delete-gallery-image'),
  copy:call('copy'), readPromptClipboard:call('read-prompt-clipboard'), openMidjourney:call('open-midjourney'), settings:call('settings'),
  openImageUpload:call('open-image-upload'), dragImageFile:file => ipcRenderer.send('drag-image-file',file),
  openData:call('open-data'), revealImage:call('reveal-image'), testHarness:call('test-harness'), styleExplorer:call('style-explorer'),
  onLibrary:callback => ipcRenderer.on('library-changed',(_event,value) => callback(value)),
  onTranslationProgress:callback => ipcRenderer.on('translation-progress',(_event,value) => callback(value))
});
