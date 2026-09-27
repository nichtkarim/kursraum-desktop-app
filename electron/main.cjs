const { app, BrowserWindow, dialog, ipcMain, protocol, shell, session } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const { Readable } = require('node:stream');
const path = require('node:path');
const { fileURLToPath } = require('node:url');
const { Store } = require('./store.cjs');
const { CourseLibrary } = require('./library.cjs');
const { parseRange } = require('./range.cjs');
const { isInside } = require('./scanner.cjs');

protocol.registerSchemesAsPrivileged([{ scheme: 'course-file', privileges: {
  standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true
} }]);

let window;
let store;
let library;
let quitting = false;
const devUrl = process.env.VITE_DEV_SERVER_URL;
const mime = {
  '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
  '.markdown': 'text/markdown; charset=utf-8', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm', '.ogv': 'video/ogg'
};


function registerMediaProtocol() {
  protocol.handle('course-file', async request => {
    try {
      const url = new URL(request.url);
      if (url.hostname !== 'resource' || !/^\/[a-f0-9]{64}$/.test(url.pathname) || !['GET', 'HEAD'].includes(request.method))
        return new Response('Not found', { status: 404 });
      const id = url.pathname.slice(1);
      const { absolute, file, stat } = await library.resolveFile(id);
      const headers = new Headers({
        'Content-Type': mime[path.extname(file.name).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes',
        'X-Content-Type-Options': 'nosniff', 'Access-Control-Allow-Origin': '*'
      });
      let range;
      try { range = parseRange(request.headers.get('range'), stat.size); } catch {
        headers.set('Content-Range', `bytes */${stat.size}`);
        return new Response(null, { status: 416, headers });
      }
      const start = range?.start ?? 0;
      const end = range?.end ?? Math.max(0, stat.size - 1);
      headers.set('Content-Length', String(range ? end - start + 1 : stat.size));
      if (range) headers.set('Content-Range', `bytes ${start}-${end}/${stat.size}`);
      if (request.method === 'HEAD' || stat.size === 0) return new Response(null, { status: range ? 206 : 200, headers });
      return new Response(Readable.toWeb(fs.createReadStream(absolute, { start, end })), { status: range ? 206 : 200, headers });
    } catch (error) {
      console.warn('Medienzugriff verweigert:', error.message);
      return new Response('Not found', { status: 404 });
    }
  });
}

function registerIpc() {
  ipcMain.handle('library:chooseRoot', async () => {
    const choice = await dialog.showOpenDialog(window, { title: 'Kursordner „Kurse“ wählen', properties: ['openDirectory'] });
    if (choice.canceled || !choice.filePaths[0]) return null;
    return library.chooseRoot(choice.filePaths[0]);
  });
  ipcMain.handle('library:overview', () => library.overview());
  ipcMain.handle('library:course', (_event, id) => library.course(id));
  ipcMain.handle('library:listFiles', (_event, args) => library.listFiles(args));
  ipcMain.handle('library:search', (_event, args) => library.search(args));
  ipcMain.handle('library:favorites', (_event, args) => library.favorites(args));
  ipcMain.handle('library:rescan', async () => { await library.rescan(); return library.overview(); });
  ipcMain.handle('library:setFileState', (_event, id, patch) => library.setFileState(id, patch));
  ipcMain.handle('library:setChapterState', (_event, courseId, chapterPath, patch) => library.setChapterState(courseId, chapterPath, patch));
  ipcMain.handle('settings:get', () => store.settings());
  ipcMain.handle('settings:set', (_event, key, value) => store.setSetting(key, value));
  ipcMain.handle('library:download', async (_event, id) => {
    const { absolute, file } = await library.resolveFile(id);
    const choice = await dialog.showSaveDialog(window, {
      title: 'Material speichern', defaultPath: file.name,
      buttonLabel: 'Speichern'
    });
    if (choice.canceled || !choice.filePath) return false;
    await fsp.copyFile(absolute, choice.filePath);
    return true;
  });
  ipcMain.handle('library:open', async (_event, id) => {
    const { absolute } = await library.resolveFile(id);
    const error = await shell.openPath(absolute);
    if (error) throw new Error(error);
    return true;
  });
  ipcMain.handle('library:reveal', async (_event, id) => {
    const { absolute } = await library.resolveFile(id);
    shell.showItemInFolder(absolute);
    return true;
  });
}

function createWindow() {
  window = new BrowserWindow({
    width: 1440, height: 900, minWidth: 760, minHeight: 600,
    backgroundColor: '#10131d', title: 'Kursraum',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true
    }
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  const allowedDev = devUrl ? new URL(devUrl).origin : null;
  const appAssets = path.resolve(__dirname, '..', 'dist');
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const url = details.url;
    let localAsset = false;
    if (url.startsWith('file:')) {
      try { localAsset = isInside(appAssets, fileURLToPath(url)); } catch { localAsset = false; }
    }
    const allowed = localAsset || url.startsWith('course-file:') || url.startsWith('data:') || url.startsWith('blob:') ||
      url.startsWith('devtools:') || (allowedDev && (url.startsWith(`${allowedDev}/`) || url.startsWith(allowedDev.replace('http:', 'ws:'))));
    callback({ cancel: !allowed });
  });
  if (devUrl) void window.loadURL(devUrl);
  else void window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  window.on('closed', () => { window = null; });
}

app.whenReady().then(async () => {
  store = new Store(path.join(app.getPath('userData'), 'kursraum-settings.json'));
  await store.load();
  library = new CourseLibrary(store, message => {
    if (window && !window.isDestroyed()) window.webContents.send('library:event', message);
  });
  registerMediaProtocol();
  registerIpc();
  createWindow();
  await library.initialize();
}).catch(error => {
  dialog.showErrorBox('Kursraum konnte nicht starten', error.message);
  app.quit();
});

app.on('before-quit', event => {
  if (quitting || !library) return;
  event.preventDefault();
  quitting = true;
  void Promise.allSettled([library.close(), store.flush()]).finally(() => app.quit());
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
