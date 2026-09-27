const { contextBridge, ipcRenderer } = require('electron');

const api = Object.freeze({
  overview: () => ipcRenderer.invoke('library:overview'),
  chooseRoot: () => ipcRenderer.invoke('library:chooseRoot'),
  rescan: () => ipcRenderer.invoke('library:rescan'),
  course: id => ipcRenderer.invoke('library:course', id),
  listFiles: options => ipcRenderer.invoke('library:listFiles', options),
  search: options => ipcRenderer.invoke('library:search', options),
  favorites: options => ipcRenderer.invoke('library:favorites', options),
  setFileState: (id, patch) => ipcRenderer.invoke('library:setFileState', id, patch),
  setChapterState: (courseId, chapterPath, patch) => ipcRenderer.invoke('library:setChapterState', courseId, chapterPath, patch),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value),
  download: id => ipcRenderer.invoke('library:download', id),
  open: id => ipcRenderer.invoke('library:open', id),
  reveal: id => ipcRenderer.invoke('library:reveal', id),
  mediaUrl: id => `course-file://resource/${encodeURIComponent(id)}`,
  onEvent: callback => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on('library:event', listener);
    return () => ipcRenderer.removeListener('library:event', listener);
  }
});
contextBridge.exposeInMainWorld('kursraum', api);
