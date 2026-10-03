const fs = require('node:fs/promises');
const { createReadStream, createWriteStream } = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { normalizePath } = require('./nextcloud-client.cjs');
const { isInside, fileKind } = require('./scanner.cjs');
const signature = stat => `${stat.size}:${stat.mtimeMs}`;
const join = (...parts) => parts.filter(Boolean).join('/');
const visible = name => !name.startsWith('.');

async function safeLocal(root, relative, createParents = false) {
  const normalized = normalizePath(relative);
  const parts = normalized.split('/').filter(Boolean);
  let current = root;
  const rootStat = await fs.lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || await fs.realpath(root) !== root) throw new Error('Der lokale Kursordner wurde verändert. Bitte erneut auswählen.');
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]);
    if (!isInside(root, current)) throw new Error('Ungültiger lokaler Dateipfad.');
    let stat;
    try { stat = await fs.lstat(current); } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      if (i < parts.length - 1 && createParents) { await fs.mkdir(current); stat = await fs.lstat(current); }
      else if (i < parts.length - 1) throw error;
    }
    if (stat?.isSymbolicLink() || (i < parts.length - 1 && stat && !stat.isDirectory())) throw new Error('Symbolische Links oder ungeeignete Pfade werden nicht synchronisiert.');
  }
  return current;
}
async function scanLocal(root, signal) {
  const files = new Map();
  const directories = new Set(['']);
  const queue = [''];
  while (queue.length) {
    signal?.throwIfAborted();
    const relative = queue.pop();
    const directory = await safeLocal(root, relative);
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      if (!visible(entry.name)) continue;
      const next = join(relative, entry.name);
      normalizePath(next);
      if (entry.isSymbolicLink()) throw new Error(`Symbolischer Link im Kursordner: ${next}. Bitte außerhalb des Sync-Ordners ablegen.`);
      if (entry.isDirectory()) { directories.add(next); queue.push(next); }
      else if (entry.isFile()) {
        const stat = await fs.stat(await safeLocal(root, next));
        files.set(next, { signature: signature(stat), size: stat.size, modified: stat.mtimeMs });
      }
    }
  }
  return { files, directories };
}
async function scanRemote(client, remoteRoot, signal) {
  const files = new Map();
  const directories = new Set(['']);
  const queue = [''];
  while (queue.length) {
    signal?.throwIfAborted();
    const relative = queue.pop();
    if (relative.split('/').length > 64) throw new Error('Der Kursordner ist zu tief verschachtelt.');
    const requested = join(remoteRoot, relative);
    for (const entry of await client.list(requested, { signal })) {
      if (entry.path === requested || !visible(entry.name)) continue;
      const next = join(relative, entry.name);
      if (entry.directory) { if (!directories.has(next)) { directories.add(next); queue.push(next); } }
      else {
        if (!entry.etag) throw new Error('Nextcloud liefert keine Dateiversionen (ETags). Ein sicherer Abgleich ist nicht möglich.');
        files.set(next, entry);
      }
      if (files.size + directories.size > 100000) throw new Error('Bitte einen kleineren Kursordner auswählen (maximal 100.000 Einträge).');
    }
  }
  return { files, directories };
}
async function digest(filename, signal) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of createReadStream(filename, { signal })) hash.update(chunk);
  return hash.digest('hex');
}
async function saveManifest(filename, files) {
  const temporary = `${filename}.tmp`;
  await fs.mkdir(path.dirname(filename), { recursive: true });
  await fs.writeFile(temporary, JSON.stringify({ version: 1, files }), { mode: 0o600 });
  await fs.rename(temporary, filename);
}
async function synchronize({ client, localRoot, remotePath, mode = 'both', videoMode = 'download', manifestPath, signal, onProgress = () => {}, onVideos = async () => {} }) {
  const root = await fs.realpath(localRoot);
  const remoteRoot = normalizePath(remotePath);
  let records = Object.create(null);
  try {
    const saved = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    if (saved.version === 1 && saved.files && typeof saved.files === 'object') records = Object.assign(Object.create(null), saved.files);
  } catch (error) { if (error.code !== 'ENOENT') throw new Error('Der gespeicherte Sync-Stand konnte nicht gelesen werden.'); }
  onProgress({ phase: 'scanning', current: '', completed: 0, total: 0 });
  const local = await scanLocal(root, signal);
  const remote = await scanRemote(client, remoteRoot, signal);
  if (videoMode === 'stream') {
    const videos = [...remote.files].filter(([relative]) => fileKind(relative) === 'video').map(([relative, entry]) => ({ relative, name: entry.name, size: entry.size, modified: entry.modified }));
    await onVideos(videos);
    // Streamed videos participate only in the catalog, never in file transfers.
    for (const relative of [...local.files.keys()]) if (fileKind(relative) === 'video') local.files.delete(relative);
    for (const relative of [...remote.files.keys()]) if (fileKind(relative) === 'video') remote.files.delete(relative);
  }
  for (const directory of remote.directories) {
    signal?.throwIfAborted();
    const target = await safeLocal(root, join(directory, '.kursraum-check'), true);
    // safeLocal creates and verifies the parent directory, never this marker file.
    if (!target) throw new Error('Lokaler Ordner konnte nicht erstellt werden.');
  }
  if (mode === 'both') for (const directory of [...local.directories].sort((a, b) => a.split('/').length - b.split('/').length)) {
    if (!directory || remote.directories.has(directory)) continue;
    signal?.throwIfAborted();
    const response = await client.request('MKCOL', join(remoteRoot, directory), { signal });
    await response.body?.cancel();
  }
  const names = [...new Set([...local.files.keys(), ...remote.files.keys()])].sort();
  const result = { uploaded: 0, downloaded: 0, unchanged: 0, conflicts: [] };
  let completed = 0;
  for (const relative of names) {
    signal?.throwIfAborted();
    const localEntry = local.files.get(relative);
    const remoteEntry = remote.files.get(relative);
    const previous = records[relative];
    const target = await safeLocal(root, relative, true);
    const remoteName = join(remoteRoot, relative);
    onProgress({ phase: 'syncing', current: relative, completed, total: names.length, bytes: 0, size: 0 });
    const conflict = () => { result.conflicts.push(relative); };
    const remember = async etag => {
      const stat = await fs.stat(target);
      records[relative] = { local: signature(stat), etag };
      await saveManifest(manifestPath, records);
    };
    const download = async compareOnly => {
      const temporary = path.join(path.dirname(target), `.kursraum-sync-${crypto.randomUUID()}.part`);
      try {
        const response = await client.request('GET', remoteName, { signal, headers: { 'If-Match': remoteEntry.etag } });
        let bytes = 0;
        let lastUpdate = 0;
        const meter = new Transform({ transform(chunk, encoding, done) {
          bytes += chunk.length;
          if (Date.now() - lastUpdate > 200) { onProgress({ phase: 'downloading', current: relative, completed, total: names.length, bytes, size: remoteEntry.size }); lastUpdate = Date.now(); }
          done(null, chunk);
        } });
        await pipeline(Readable.fromWeb(response.body), meter, createWriteStream(temporary, { flags: 'wx', mode: 0o600 }), { signal });
        if (bytes !== remoteEntry.size) throw new Error(`Unvollständiger Download: ${relative}`);
        await safeLocal(root, relative);
        let now;
        try { now = await fs.stat(target); } catch (error) { if (error.code !== 'ENOENT') throw error; }
        if ((localEntry && (!now || signature(now) !== localEntry.signature)) || (!localEntry && now)) { conflict(); return; }
        if (compareOnly) {
          if (await digest(target, signal) === await digest(temporary, signal)) {
            if (signature(await fs.stat(target)) !== localEntry.signature) { conflict(); return; }
            await remember(remoteEntry.etag); result.unchanged++;
          } else conflict();
          return;
        }
        if (remoteEntry.modified) await fs.utimes(temporary, new Date(), new Date(remoteEntry.modified));
        await fs.rename(temporary, target);
        await remember(remoteEntry.etag);
        result.downloaded++;
      } finally { await fs.rm(temporary, { force: true }); }
    };
    const upload = async () => {
      if (signature(await fs.stat(await safeLocal(root, relative))) !== localEntry.signature) { conflict(); return; }
      let bytes = 0;
      let lastUpdate = 0;
      const stream = createReadStream(target, { signal });
      async function* body() {
        for await (const chunk of stream) {
          bytes += chunk.length;
          if (Date.now() - lastUpdate > 200) { onProgress({ phase: 'uploading', current: relative, completed, total: names.length, bytes, size: localEntry.size }); lastUpdate = Date.now(); }
          yield chunk;
        }
      }
      let response;
      try {
        response = await client.request('PUT', remoteName, { signal, headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(localEntry.size), 'X-OC-MTime': String(Math.floor(localEntry.modified / 1000)), ...(remoteEntry ? { 'If-Match': remoteEntry.etag } : { 'If-None-Match': '*' }) }, body: body() });
      } finally { stream.destroy(); }
      await response.body?.cancel();
      if (signature(await fs.stat(target)) !== localEntry.signature) { conflict(); return; }
      const etag = response.headers.get('oc-etag') || response.headers.get('etag') || (await client.stat(remoteName, signal)).etag;
      if (!etag) throw new Error('Nextcloud hat den Upload nicht mit einer Dateiversion bestätigt.');
      await remember(etag);
      result.uploaded++;
    };
    if (!localEntry && remoteEntry) await download(false);
    else if (localEntry && !remoteEntry) { if (mode === 'both') await upload(); else result.unchanged++; }
    else if (!previous) { if (localEntry.size === remoteEntry.size) await download(true); else conflict(); }
    else {
      const localChanged = previous.local !== localEntry.signature;
      const remoteChanged = previous.etag !== remoteEntry.etag;
      if (localChanged && remoteChanged) conflict();
      else if (remoteChanged) await download(false);
      else if (localChanged && mode === 'both') await upload();
      else result.unchanged++;
    }
    completed++;
  }
  await saveManifest(manifestPath, records);
  return result;
}
module.exports = { synchronize, safeLocal, scanLocal, scanRemote };
