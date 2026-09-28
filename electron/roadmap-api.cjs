const fs = require('node:fs/promises');
const { MAX_BYTES } = require('./roadmap-manager.cjs');
function registerRoadmapAPI({ ipcMain, dialog, getWindow, manager }) {
  const handle = (name, handler) => ipcMain.handle(`roadmap:${name}`, (event, ...args) => {
    if (event.sender !== getWindow()?.webContents || event.senderFrame !== event.sender.mainFrame) throw new Error('Zugriff verweigert.');
    return handler(...args);
  });
  handle('list', () => manager.list());
  handle('get', id => manager.get(id));
  handle('create', options => manager.create(options));
  handle('save', roadmap => manager.save(roadmap));
  handle('delete', id => manager.delete(id));
  handle('resolve', (id, nodeId) => manager.resolve(id, nodeId));
  handle('export', async id => {
    const data = manager.export(id);
    const approval = await dialog.showMessageBox(getWindow(), { type: 'info', title: 'Roadmap exportieren', message: 'Titel, Kursnamen und eigene Notizen exportieren?', detail: 'Die JSON-Datei enthält deine eingegebenen Texte. Prüfe sie vor dem Teilen auf private Angaben. Automatische Datei- und Ordnerpfade sowie Kursdateien werden nicht exportiert.', buttons: ['Exportieren', 'Abbrechen'], defaultId: 0, cancelId: 1 });
    if (approval.response !== 0) return false;
    const result = await dialog.showSaveDialog(getWindow(), { title: 'Roadmap exportieren', defaultPath: 'roadmap.json', filters: [{ name: 'Roadmap JSON', extensions: ['json'] }] });
    if (result.canceled || !result.filePath) return false;
    await fs.writeFile(result.filePath, JSON.stringify(data, null, 2), { mode: 0o600 }); return true;
  });
  handle('import', async () => {
    const result = await dialog.showOpenDialog(getWindow(), { title: 'Roadmap importieren', properties: ['openFile'], filters: [{ name: 'Roadmap JSON', extensions: ['json'] }] });
    if (result.canceled || !result.filePaths[0]) return null;
    const file = await fs.open(result.filePaths[0], 'r');
    try {
      if ((await file.stat()).size > MAX_BYTES) throw new Error('Roadmap-Datei ist größer als 2 MB.');
      const buffer = Buffer.alloc(MAX_BYTES + 1);
      let count = 0;
      while (count < buffer.length) { const { bytesRead } = await file.read(buffer, count, buffer.length - count, count); if (!bytesRead) break; count += bytesRead; }
      if (count > MAX_BYTES) throw new Error('Roadmap-Datei ist größer als 2 MB.');
      return manager.import(JSON.parse(buffer.subarray(0, count).toString('utf8')));
    } finally { await file.close(); }
  });
}
module.exports = { registerRoadmapAPI };
