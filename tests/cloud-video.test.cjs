const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Store } = require('../electron/store.cjs');
const { CourseLibrary } = require('../electron/library.cjs');
const { Nextcloud } = require('../electron/nextcloud.cjs');
const { createServer } = require('./helpers/nextcloud-server.cjs');
const credentials = serverUrl => ({ serverUrl, username: 'karim', password: 'app-passwort' });
const remotePath = 'Lernen/Kurse';
const firstVideo = 'Kurs/Tag 1/01 Grüße #1.webm';
const secondVideo = 'Kurs/Tag 2/02 Film.mp4';
const reflection = { learningPoints: ['Dateien strukturieren', 'Ordner anlegen'], serviceIdea: 'Eine Dateiablage einrichten' };

async function fixture(t, { noRoot = false } = {}) {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'kursraum-stream-'));
  const remote = await createServer();
  remote.put(`${remotePath}/${firstVideo}`, '0123456789abcdef');
  remote.put(`${remotePath}/${secondVideo}`, 'second-video');
  remote.put(`${remotePath}/Kurs/Tag 1/Notizen.txt`, 'Begleitmaterial');
  const store = new Store(path.join(temporary, 'settings.json'));
  const library = new CourseLibrary(store);
  if (!noRoot) { const root = path.join(temporary, 'Kurse'); await fs.mkdir(root); await library.chooseRoot(root); }
  const service = new Nextcloud({ store, library, dataDirectory: temporary, safeStorage: { isEncryptionAvailable: () => false } });
  t.after(async () => { await service.close(); await library.close(); await store.flush(); await remote.close(); await fs.rm(temporary, { recursive: true, force: true }); });
  const connect = async () => {
    await service.login(credentials(remote.serverUrl));
    await service.configure({ remotePath, videoMode: 'stream', autoSync: false });
    await service.runningPromise;
    assert.equal(service.status().phase, 'done', service.status().error);
  };
  const videos = () => library.search({ query: 'Kurs', kind: 'video' }).items;
  const request = (file, headers = {}, method = 'GET', signal) => service.streamVideo(file.id, new Request(`https://resource/${file.id}`, { method, headers, signal }));
  return { temporary, remote, store, library, service, connect, videos, request };
}

test('Streamingmodus lädt Begleitmaterial, aber keine Videos herunter oder hoch; Reflexion funktioniert', async t => {
  const f = await fixture(t);
  const localOnly = path.join(f.library.root, 'Kurs', 'nur-lokal.mp4');
  await fs.mkdir(path.dirname(localOnly), { recursive: true });
  await fs.writeFile(localOnly, 'local video');
  await f.connect();
  const cloud = f.videos().filter(file => file.source === 'nextcloud');
  assert.equal(cloud.length, 2);
  assert.equal(f.service.status().videoMode, 'stream');
  for (const name of [firstVideo, secondVideo]) await assert.rejects(fs.stat(path.join(f.library.root, name)), { code: 'ENOENT' });
  assert.equal(await fs.readFile(path.join(f.library.root, 'Kurs/Tag 1/Notizen.txt'), 'utf8'), 'Begleitmaterial');
  assert.equal(f.remote.calls.filter(call => ['GET', 'PUT'].includes(call.method) && /\.(mp4|webm)$/.test(call.name)).length, 0);
  const first = cloud.find(file => file.relative === firstVideo);
  assert.equal(f.library.nextVideo(first.id).relative, secondVideo);
  assert.throws(() => f.library.setFileState(first.id, { read: true }), /Lernpunkte/);
  f.library.setFileState(first.id, { read: true, favorite: true, ...reflection });
  assert.equal(f.library.reflections()[0].kind, 'video');
  assert.equal(f.library.favorites().items[0].source, 'nextcloud');
  await assert.rejects(f.library.resolveFile(first.id), /direkt aus Nextcloud/);
});

test('Cloud-Videos liefern vollständige Inhalte, Byte-Ranges, Suffixe, HEAD und 416 ohne lokale Datei', async t => {
  const f = await fixture(t); await f.connect();
  const file = f.videos().find(file => file.relative === firstVideo);
  for (const [range, expected, status, contentRange] of [[null, '0123456789abcdef', 200, null], ['bytes=3-6', '3456', 206, 'bytes 3-6/16'], ['bytes=-4', 'cdef', 206, 'bytes 12-15/16'], ['bytes=10-', 'abcdef', 206, 'bytes 10-15/16']]) {
    const response = await f.request(file, range ? { Range: range } : {});
    assert.equal(response.status, status);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('content-type'), 'video/webm');
    assert.equal(response.headers.get('content-range'), contentRange);
    assert.equal(await response.text(), expected);
  }
  const getCount = f.remote.calls.filter(call => call.method === 'GET').length;
  const head = await f.request(file, { Range: 'bytes=1-2' }, 'HEAD');
  assert.equal(head.status, 206); assert.equal(head.headers.get('content-length'), '2'); assert.equal(await head.text(), '');
  const invalid = await f.request(file, { Range: 'bytes=99-' });
  assert.equal(invalid.status, 416); assert.equal(invalid.headers.get('content-range'), 'bytes */16');
  assert.equal(f.remote.calls.filter(call => call.method === 'GET').length, getCount);
  await assert.rejects(fs.stat(path.join(f.library.root, firstVideo)), { code: 'ENOENT' });
});

test('Aktuelle Cloud-Version wird vor dem Abspielen geprüft; Änderungen während des Abrufs werden abgewiesen', async t => {
  const f = await fixture(t); await f.connect();
  const file = f.videos().find(file => file.relative === firstVideo);
  f.remote.put(`${remotePath}/${firstVideo}`, 'neu');
  assert.equal(await (await f.request(file)).text(), 'neu');
  f.remote.hooks.beforeGet = name => f.remote.put(name, 'noch neuer');
  await assert.rejects(f.request(file), /inzwischen geändert/);
});

test('Moduswechsel erhält IDs, Lernpunkte und lokale Videos; Download bleibt ausdrücklich wählbar', async t => {
  const f = await fixture(t); await f.connect();
  const first = f.videos().find(file => file.relative === firstVideo);
  f.library.setFileState(first.id, { read: true, ...reflection });
  await f.service.setVideoMode('download'); await f.service.runningPromise;
  assert.equal(f.service.status().phase, 'done', f.service.status().error);
  assert.equal(await fs.readFile(path.join(f.library.root, firstVideo), 'utf8'), '0123456789abcdef');
  assert.equal(f.videos().find(file => file.id === first.id).source, undefined);
  f.remote.calls.length = 0;
  await f.service.setVideoMode('stream'); await f.service.runningPromise;
  assert.equal(f.videos().find(file => file.id === first.id).source, 'nextcloud');
  assert.equal(f.videos().find(file => file.id === first.id).state.serviceIdea, reflection.serviceIdea);
  assert.equal(await fs.readFile(path.join(f.library.root, firstVideo), 'utf8'), '0123456789abcdef');
  assert.equal(f.remote.calls.filter(call => call.method === 'GET' && /\.(mp4|webm)$/.test(call.name)).length, 0);
});

test('Cloud-Katalog bleibt ohne gespeichertes Passwort nach Neustart sichtbar und getrennt von anderen Bibliotheken', async t => {
  const f = await fixture(t); await f.connect(); await f.store.flush();
  const restored = new Store(f.store.filename); await restored.load();
  assert.equal(restored.data.nextcloud.videoMode, 'stream');
  assert.equal(restored.data.nextcloud.videos.length, 2);
  const library = new CourseLibrary(restored);
  const service = new Nextcloud({ store: restored, library, dataDirectory: f.temporary, safeStorage: { isEncryptionAvailable: () => false } });
  t.after(async () => { await service.close(); await library.close(); });
  await service.initialize(); await library.chooseRoot(f.library.root);
  assert.equal(library.search({ query: 'Kurs', kind: 'video' }).total, 2);
  const file = library.search({ query: 'Kurs', kind: 'video' }).items[0];
  assert.throws(() => service.streamVideo(file.id, new Request('https://resource/test')), /anmelden/);
  const other = path.join(f.temporary, 'Andere'); await fs.mkdir(other); await library.chooseRoot(other);
  assert.equal(library.search({ query: 'Kurs', kind: 'video' }).total, 0);
  await library.chooseRoot(f.library.root);
  assert.equal(library.search({ query: 'Kurs', kind: 'video' }).total, 2);
});

test('Streamen lässt sich ohne vorherigen lokalen Kursordner einrichten; Trennen entfernt nur Cloud-Katalog', async t => {
  const f = await fixture(t, { noRoot: true }); await f.connect();
  assert.ok(f.library.root.startsWith(path.join(f.temporary, 'cloud-courses')));
  assert.equal(f.videos().length, 2);
  const file = f.videos()[0];
  await f.service.disconnect();
  assert.equal(f.videos().length, 0);
  assert.throws(() => f.request(file), /nicht in der aktiven Bibliothek/);
  assert.equal(await fs.readFile(path.join(f.library.root, 'Kurs/Tag 1/Notizen.txt'), 'utf8'), 'Begleitmaterial');
});

test('Fehlerhafte Cloud-Metadaten erzeugen keine Zugriffe außerhalb der Bibliothek', async t => {
  const f = await fixture(t);
  await f.library.setCloudVideos(f.library.root, [
    { relative: '../privat.mp4', size: 4 }, { relative: '/absolut.mp4', size: 4 },
    { relative: 'Kurs/keinvideofile.txt', size: 4 }, { relative: 'Kurs/video.mp4', size: -2 },
    { relative: 'Kurs/.geheim/video.mp4', size: 4 }
  ]);
  assert.equal(f.videos().length, 0);
});

test('Abbruch und Trennen stoppen laufende Videostreams', async t => {
  const f = await fixture(t); await f.connect();
  f.remote.hooks.download = async (_name, entry, _request, response) => {
    response.writeHead(200, { 'Content-Length': entry.data.length }); response.write(entry.data.subarray(0, 2));
  };
  const file = f.videos().find(item => item.relative === firstVideo);
  const controller = new AbortController();
  const response = await f.request(file, {}, 'GET', controller.signal);
  const reader = response.body.getReader(); await reader.read(); controller.abort();
  await assert.rejects(reader.read());
  const second = await f.request(file); const secondReader = second.body.getReader(); await secondReader.read();
  await f.service.disconnect(); await assert.rejects(secondReader.read());
});

test('Server ohne Range-Unterstützung werden nicht mit falschen Teilantworten gekennzeichnet', async t => {
  const f = await fixture(t); await f.connect();
  f.remote.hooks.download = async (_name, entry, _request, response) => response.writeHead(200, { 'Content-Length': entry.data.length }).end(entry.data);
  const file = f.videos().find(item => item.relative === firstVideo);
  const response = await f.request(file, { Range: 'bytes=4-7' });
  assert.equal(response.status, 200); assert.equal(response.headers.get('content-range'), null);
  assert.equal(await response.text(), '0123456789abcdef');
});
