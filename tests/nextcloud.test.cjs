const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { NextcloudClient, normalizeServer, normalizePath, parseListing } = require('../electron/nextcloud-client.cjs');
const { synchronize } = require('../electron/nextcloud-sync.cjs');
const { Nextcloud } = require('../electron/nextcloud.cjs');
const { Store } = require('../electron/store.cjs');
const { createServer } = require('./helpers/nextcloud-server.cjs');

async function fixture(t) {
  const remote = await createServer();
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'kursraum-nextcloud-'));
  const localRoot = path.join(temporary, 'Kurse');
  await fs.mkdir(localRoot);
  remote.mkdir('Lernen/Kurse');
  const client = new NextcloudClient({ serverUrl: remote.serverUrl, username: 'karim', password: 'app-passwort' });
  const write = async (name, content) => { const target = path.join(localRoot, name); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, content); };
  const read = name => fs.readFile(path.join(localRoot, name), 'utf8');
  const sync = options => synchronize({ client, localRoot, remotePath: 'Lernen/Kurse', manifestPath: path.join(temporary, 'manifest.json'), ...options });
  t.after(async () => { await remote.close(); await fs.rm(temporary, { recursive: true, force: true }); });
  return { remote, temporary, localRoot, client, write, read, sync };
}

test('Nextcloud-Anmeldung und Ordnerbrowser unterstützen Unterpfade und Unicode', async t => {
  const { client, remote } = await fixture(t);
  remote.mkdir('Lernen/Kurse/SQL & Grüße #1');
  assert.deepEqual((await client.folders('Lernen/Kurse')).folders.map(folder => folder.name), ['SQL & Grüße #1']);
  assert.equal((await client.folders('Lernen/Kurse/SQL & Grüße #1')).path, 'Lernen/Kurse/SQL & Grüße #1');
  const wrong = new NextcloudClient({ serverUrl: remote.serverUrl, username: 'karim', password: 'falsch' });
  await assert.rejects(wrong.folders(), /Anmeldung fehlgeschlagen/);
});

test('Nextcloud lässt unsichere URLs, Pfadwechsel und XML-Entitäten nicht zu', () => {
  assert.throws(() => normalizeServer('http://cloud.example.org'), /HTTPS/);
  assert.throws(() => normalizeServer('https://user:pass@cloud.example.org'), /ohne Zugangsdaten/);
  assert.throws(() => normalizePath('Kurse/../geheim'), /nicht unterstützt/);
  assert.throws(() => normalizePath('Kurse/..\\geheim'), /nicht unterstützt/);
  assert.throws(() => parseListing('<!DOCTYPE x><d:multistatus xmlns:d="DAV:"/>', 'https://cloud.example.org/remote.php/dav/files/karim/', ''), /Ungültige/);
  const outside = '<d:multistatus xmlns:d="DAV:"><d:response><d:href>https://other.example.org/file</d:href></d:response></d:multistatus>';
  assert.throws(() => parseListing(outside, 'https://cloud.example.org/remote.php/dav/files/karim/', ''), /außerhalb/);
});

test('Upload und Download gleichen Kursdateien ab und übertragen unveränderte Dateien nicht erneut', async t => {
  const { remote, write, read, sync } = await fixture(t);
  await write('SQL/Kapitel 1/Notizen.txt', 'lokaler Inhalt');
  remote.put('Lernen/Kurse/Linux/Kapitel 2/Übung #1.txt', 'Cloud-Inhalt');
  const first = await sync();
  assert.equal(first.uploaded, 1);
  assert.equal(first.downloaded, 1);
  assert.deepEqual(first.conflicts, []);
  assert.equal(remote.entries.get('Lernen/Kurse/SQL/Kapitel 1/Notizen.txt').data.toString(), 'lokaler Inhalt');
  assert.equal(await read('Linux/Kapitel 2/Übung #1.txt'), 'Cloud-Inhalt');
  remote.calls.length = 0;
  const second = await sync();
  assert.equal(second.unchanged, 2);
  assert.equal(remote.calls.filter(call => ['GET', 'PUT'].includes(call.method)).length, 0);
  await write('SQL/Kapitel 1/Notizen.txt', 'lokal aktualisiert');
  remote.put('Lernen/Kurse/Linux/Kapitel 2/Übung #1.txt', 'Cloud aktualisiert');
  const third = await sync();
  assert.equal(third.uploaded, 1);
  assert.equal(third.downloaded, 1);
  assert.equal(await read('Linux/Kapitel 2/Übung #1.txt'), 'Cloud aktualisiert');
});

test('Erster Abgleich erkennt identische Inhalte; Konflikte überschreiben keine Version', async t => {
  const { remote, write, read, sync } = await fixture(t);
  await write('Kurs/gleich.txt', 'identisch');
  remote.put('Lernen/Kurse/Kurs/gleich.txt', 'identisch');
  await write('Kurs/anders.txt', 'lokal');
  remote.put('Lernen/Kurse/Kurs/anders.txt', 'cloud');
  const first = await sync();
  assert.equal(first.unchanged, 1);
  assert.deepEqual(first.conflicts, ['Kurs/anders.txt']);
  assert.equal(await read('Kurs/anders.txt'), 'lokal');
  assert.equal(remote.entries.get('Lernen/Kurse/Kurs/anders.txt').data.toString(), 'cloud');
  await write('Kurs/gleich.txt', 'neu lokal');
  remote.put('Lernen/Kurse/Kurs/gleich.txt', 'neu cloud');
  const second = await sync();
  assert.deepEqual(second.conflicts, ['Kurs/anders.txt', 'Kurs/gleich.txt']);
  assert.equal(await read('Kurs/gleich.txt'), 'neu lokal');
});

test('Gelöschte Dateien werden ergänzt und keine Löschbefehle versendet', async t => {
  const { remote, localRoot, write, sync, read } = await fixture(t);
  await write('Kurs/Datei.txt', 'erhalten');
  await sync();
  await fs.unlink(path.join(localRoot, 'Kurs/Datei.txt'));
  await sync();
  assert.equal(await read('Kurs/Datei.txt'), 'erhalten');
  remote.entries.delete('Lernen/Kurse/Kurs/Datei.txt');
  await sync();
  assert.equal(remote.entries.get('Lernen/Kurse/Kurs/Datei.txt').data.toString(), 'erhalten');
  assert.equal(remote.calls.filter(call => call.method === 'DELETE').length, 0);
});

test('Abgebrochener Download erhält die vorhandene Datei und entfernt Teil-Dateien', async t => {
  const { remote, write, read, sync, localRoot } = await fixture(t);
  await write('Kurs/Datei.txt', 'alter Inhalt');
  await sync();
  remote.put('Lernen/Kurse/Kurs/Datei.txt', 'neuer Inhalt aus der Cloud');
  remote.hooks.download = async (_name, entry, _req, res) => {
    res.writeHead(200, { 'Content-Length': entry.data.length });
    res.write(entry.data.subarray(0, 2));
    setTimeout(() => res.destroy(), 15);
  };
  await assert.rejects(sync());
  assert.equal(await read('Kurs/Datei.txt'), 'alter Inhalt');
  assert.deepEqual(await fs.readdir(path.join(localRoot, 'Kurs')), ['Datei.txt']);
});

test('Zeitgleiche Änderung in Nextcloud verhindert einen überschreibenden Upload', async t => {
  const { remote, write, sync } = await fixture(t);
  await write('Kurs/Datei.txt', 'alt');
  await sync();
  await write('Kurs/Datei.txt', 'lokal geändert');
  remote.hooks.beforePut = async name => remote.put(name, 'gleichzeitig remote geändert');
  await assert.rejects(sync(), /inzwischen geändert/);
  assert.equal(remote.entries.get('Lernen/Kurse/Kurs/Datei.txt').data.toString(), 'gleichzeitig remote geändert');
});

test('Symlinks und versteckte Dateien gelangen nicht in die Nextcloud-Synchronisierung', async t => {
  const { localRoot, temporary, write, sync, remote } = await fixture(t);
  await write('.privat', 'kein Upload');
  await write('Kurs/.kursraum-sync-test.part', 'unvollständig');
  assert.equal((await sync()).uploaded, 0);
  await fs.writeFile(path.join(temporary, 'privat.txt'), 'privat');
  await fs.symlink(path.join(temporary, 'privat.txt'), path.join(localRoot, 'Link.txt'));
  await assert.rejects(sync(), /Symbolischer Link/);
  assert.equal(remote.calls.filter(call => call.method === 'PUT').length, 0);
});

test('Sync-Dienst speichert keine Klartextpasswörter, meldet Status und trennt ohne Dateiverlust', async t => {
  const { remote, temporary, localRoot, write, read } = await fixture(t);
  const store = new Store(path.join(temporary, 'settings.json'));
  const messages = [];
  const library = { root: localRoot, rescan: async () => {}, chooseRoot: async root => { library.root = root; } };
  const service = new Nextcloud({ store, library, dataDirectory: temporary, emit: value => messages.push(value), safeStorage: { isEncryptionAvailable: () => false } });
  t.after(() => service.close());
  await write('Kurs/Test.txt', 'bleibt lokal');
  await service.login({ serverUrl: remote.serverUrl, username: 'karim', password: 'app-passwort', remember: true });
  await service.configure({ remotePath: 'Lernen/Kurse', autoSync: true });
  await service.runningPromise;
  assert.equal(service.status().phase, 'done');
  assert.equal(service.status().passwordSaved, false);
  assert.equal(service.status().result.uploaded, 1);
  assert.equal((await fs.readFile(store.filename, 'utf8')).includes('app-passwort'), false);
  assert.equal(JSON.stringify(messages).includes('app-passwort'), false);
  await service.disconnect();
  assert.equal(service.status().configured, false);
  assert.equal(await read('Kurs/Test.txt'), 'bleibt lokal');
  assert.ok(remote.entries.has('Lernen/Kurse/Kurs/Test.txt'));
});
