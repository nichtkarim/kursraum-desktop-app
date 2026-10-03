const { contextBridge, ipcRenderer } = require('electron');

const progressFlushers = new Set();
ipcRenderer.on('video:flushProgress', async (_event, token) => {
  const results = await Promise.allSettled([...progressFlushers].map(flush => flush()));
  ipcRenderer.send('video:progressFlushed', token, results.every(result => result.status === 'fulfilled' && result.value !== false));
});

const api = Object.freeze({
  onVideoProgressFlush: callback => {
    progressFlushers.add(callback);
    return () => progressFlushers.delete(callback);
  },
  roadmaps: Object.freeze({
    list: () => ipcRenderer.invoke('roadmap:list'),
    get: id => ipcRenderer.invoke('roadmap:get', id),
    create: options => ipcRenderer.invoke('roadmap:create', options),
    save: value => ipcRenderer.invoke('roadmap:save', value),
    delete: id => ipcRenderer.invoke('roadmap:delete', id),
    resolve: (id, nodeId) => ipcRenderer.invoke('roadmap:resolve', id, nodeId),
    export: id => ipcRenderer.invoke('roadmap:export', id),
    import: () => ipcRenderer.invoke('roadmap:import')
  }),
  nextcloudStatus: () => ipcRenderer.invoke('nextcloud:status'),
  nextcloudLogin: credentials => ipcRenderer.invoke('nextcloud:login', credentials),
  nextcloudBrowse: remotePath => ipcRenderer.invoke('nextcloud:browse', remotePath),
  nextcloudChooseLocal: () => ipcRenderer.invoke('nextcloud:chooseLocal'),
  nextcloudConfigure: options => ipcRenderer.invoke('nextcloud:configure', options),
  nextcloudVideoMode: mode => ipcRenderer.invoke('nextcloud:videoMode', mode),
  nextcloudSync: () => ipcRenderer.invoke('nextcloud:sync'),
  nextcloudCancel: () => ipcRenderer.invoke('nextcloud:cancel'),
  nextcloudDisconnect: () => ipcRenderer.invoke('nextcloud:disconnect'),
  overview: () => ipcRenderer.invoke('library:overview'),
  chooseRoot: () => ipcRenderer.invoke('library:chooseRoot'),
  rescan: () => ipcRenderer.invoke('library:rescan'),
  course: id => ipcRenderer.invoke('library:course', id),
  listFiles: options => ipcRenderer.invoke('library:listFiles', options),
  videoProgress: id => ipcRenderer.invoke('library:videoProgress', id),
  setVideoProgress: (id, position) => ipcRenderer.invoke('library:setVideoProgress', id, position),
  nextVideo: id => ipcRenderer.invoke('library:nextVideo', id),
  search: options => ipcRenderer.invoke('library:search', options),
  favorites: options => ipcRenderer.invoke('library:favorites', options),
  reflections: () => ipcRenderer.invoke('library:reflections'),
  setFileState: (id, patch) => ipcRenderer.invoke('library:setFileState', id, patch),
  setChapterState: (courseId, chapterPath, patch) => ipcRenderer.invoke('library:setChapterState', courseId, chapterPath, patch),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value),
  download: id => ipcRenderer.invoke('library:download', id),
  open: id => ipcRenderer.invoke('library:open', id),
  reveal: id => ipcRenderer.invoke('library:reveal', id),
  thumbnailUrl: id => `course-file://resource/${encodeURIComponent(id)}?thumbnail=1`,
  mediaUrl: id => `course-file://resource/${encodeURIComponent(id)}`,
  onEvent: callback => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on('library:event', listener);
    return () => ipcRenderer.removeListener('library:event', listener);
  }
});
contextBridge.exposeInMainWorld('kursraum', api);
