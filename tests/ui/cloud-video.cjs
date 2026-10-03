const { _electron: electron } = require('playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createServer } = require('../helpers/nextcloud-server.cjs');
const project = path.resolve(__dirname, '../..');
let app, page, remote, temporary;
const errors = [];
(async () => {
  temporary = await fs.mkdtemp('/tmp/kursraum-cloud-ui-');
  remote = await createServer();
  const profile = path.join(temporary, 'profile'); await fs.mkdir(profile);
  const bootstrap = path.join(temporary, 'main.cjs');
  await fs.writeFile(bootstrap, `require('electron').app.setPath('userData', ${JSON.stringify(profile)});require(${JSON.stringify(path.join(project, 'electron/main.cjs'))});`);
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.VITE_DEV_SERVER_URL;
  const launch = async () => {
    app = await electron.launch({ executablePath: path.join(project, 'node_modules/electron/dist/electron'), args: ['--no-sandbox', bootstrap], env });
    page = await app.firstWindow(); page.on('pageerror', error => errors.push(error.message));
    await page.getByRole('button', { name: 'Nextcloud', exact: true }).waitFor();
  };
  const button = name => page.getByRole('button', { name, exact: true });
  const waitSync = async () => {
    // Wait for the UI action and sync to settle, not an idle snapshot before the IPC write begins.
    await page.locator('.cloud-connected .cloud-video-mode:not([disabled])').waitFor();
    const result = await page.waitForFunction(async () => {
      const status = await window.kursraum.nextcloudStatus();
      return status.configured && !status.running && ['done', 'error', 'conflicts', 'cancelled'].includes(status.phase) ? status : null;
    });
    const status = await result.jsonValue(); await result.dispose();
    assert.equal(status.phase, 'done', JSON.stringify(status)); return status;
  };
  const connect = async () => {
    await button('Nextcloud').click();
    await page.getByLabel('Nextcloud-Adresse', { exact: true }).fill(remote.serverUrl);
    await page.getByLabel('Benutzername', { exact: true }).fill('karim');
    await page.getByLabel('App-Passwort', { exact: true }).fill('app-passwort');
    const remember = page.getByRole('checkbox', { name: 'Anmeldung geschützt auf diesem Gerät speichern', exact: true });
    if (await remember.count()) await remember.uncheck();
    await button('Anmelden und Ordner auswählen').click();
    await button('Lernen').click(); await button('Kurse').click();
    await page.getByRole('radio', { name: /^Videos direkt aus der Cloud streamen/ }).check();
    await button('Verbinden und Videos streamen').click();
    await page.locator('.cloud-connected').waitFor();
    return waitSync();
  };
  const files = () => page.evaluate(async () => {
    const { courses } = await window.kursraum.overview();
    return (await window.kursraum.listFiles({ courseId: courses[0].id, chapterPath: 'Einstieg' })).items;
  });
  await launch();
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 180;
    const context = canvas.getContext('2d'); const stream = canvas.captureStream(10);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' }); const chunks = [];
    const done = new Promise(resolve => { recorder.ondataavailable = event => chunks.push(event.data); recorder.onstop = resolve; });
    recorder.start(); let frame = 0;
    const draw = setInterval(() => { context.fillStyle = frame++ % 2 ? '#817ed5' : '#456a85'; context.fillRect(0, 0, 320, 180); }, 100);
    await new Promise(resolve => setTimeout(resolve, 1600)); recorder.stop(); await done; clearInterval(draw); stream.getTracks().forEach(track => track.stop());
    return [...new Uint8Array(await new Blob(chunks).arrayBuffer())];
  });
  remote.put('Lernen/Kurse/Cloud-Kurs/Einstieg/01 Video.webm', Buffer.from(bytes));
  remote.put('Lernen/Kurse/Cloud-Kurs/Einstieg/02 Video.webm', Buffer.from(bytes));
  remote.put('Lernen/Kurse/Cloud-Kurs/Einstieg/03 Begleitmaterial.txt', 'Das bleibt als Begleitmaterial lokal verfügbar.');
  let status = await connect();
  assert.equal(status.videoMode, 'stream'); assert.equal(status.cloudVideoCount, 2);
  assert.equal(remote.calls.filter(call => call.method === 'GET' && call.name.endsWith('.webm')).length, 0);
  const localVideo = path.join(status.localRoot, 'Cloud-Kurs/Einstieg/01 Video.webm');
  await assert.rejects(fs.stat(localVideo), { code: 'ENOENT' });
  await page.screenshot({ path: path.join(temporary, 'cloud-settings.png') });
  await button('Nextcloud schließen').click();
  await page.locator('.course-card').first().click(); await button('01 Video.webm ansehen').click();
  await page.getByText('Cloud-Stream', { exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('video')?.readyState >= 1);
  const first = (await files()).find(file => file.name === '01 Video.webm');
  const range = await page.evaluate(async id => {
    const response = await fetch(window.kursraum.mediaUrl(id), { headers: { Range: 'bytes=3-10' } });
    return { status: response.status, range: response.headers.get('content-range'), cache: response.headers.get('cache-control'), bytes: [...new Uint8Array(await response.arrayBuffer())] };
  }, first.id);
  assert.equal(range.status, 206); assert.equal(range.cache, 'no-store'); assert.deepEqual(range.bytes, bytes.slice(3, 11));
  await button('Dateiinformationen').click();
  assert.equal(await button('Speichern').count(), 0); assert.equal(await button('Extern öffnen').count(), 0);
  await button('Dateiinformationen').click();
  await page.screenshot({ path: path.join(temporary, 'cloud-player.png') });
  await page.locator('video').evaluate(video => new Promise(resolve => {
    video.addEventListener('seeked', resolve, { once: true }); video.currentTime = 0.25;
  }));
  await button('Vorschau schließen').click();
  await button('01 Video.webm ansehen').click();
  await page.waitForFunction(() => Math.abs(document.querySelector('video').currentTime - 0.25) < 0.05);
  console.log('PASS: Cloud streaming resumes at the saved position without downloading a video file');
  await page.locator('video').evaluate(video => video.play());
  await page.locator('.reflection-dialog').waitFor();
  await page.getByLabel('Lernpunkt 1', { exact: true }).fill('Erster Lernpunkt aus dem Cloud-Video.');
  await page.getByLabel('Lernpunkt 2', { exact: true }).fill('Zweiter Lernpunkt aus dem Cloud-Video.');
  await page.getByLabel('Dienstleistungsidee (Pflichtfeld)', { exact: true }).fill('Eine passende Dienstleistung anbieten.');
  await button('Speichern & abschließen').click();
  await page.locator('.reflection-dialog').waitFor({ state: 'detached' });
  await button('Abbrechen').click(); await button('Vorschau schließen').click();
  await assert.rejects(fs.stat(localVideo), { code: 'ENOENT' });
  assert.equal((await files()).find(file => file.id === first.id).state.read, true);
  console.log('PASS: Setup without local folder, streaming playback, real protocol ranges and reflection without a local video');

  remote.hooks.beforeGet = name => { if (name.endsWith('02 Video.webm')) throw new Error('Test network failure'); };
  await button('02 Video.webm ansehen').click(); await button('Cloud-Video erneut laden').waitFor();
  remote.hooks.beforeGet = null;
  await button('Cloud-Video erneut laden').click();
  await page.waitForFunction(() => document.querySelector('video')?.readyState >= 1);
  await button('Vorschau schließen').click();
  console.log('PASS: Network errors are visible and playback can be retried');

  await app.close(); app = null; await launch();
  await page.locator('.course-card').first().waitFor();
  assert.equal((await files()).filter(file => file.source === 'nextcloud').length, 2);
  assert.equal((await page.evaluate(() => window.kursraum.nextcloudStatus())).authenticated, false);
  assert.equal((await files()).find(file => file.id === first.id).state.serviceIdea, 'Eine passende Dienstleistung anbieten.');
  status = await connect();
  await page.getByRole('radio', { name: /^Videos lokal synchronisieren/ }).check();
  await button('Videomodus speichern').click(); await button('Videomodus speichern').waitFor({ state: 'detached' }); await waitSync();
  assert.deepEqual(await fs.readFile(localVideo), Buffer.from(bytes));
  assert.equal((await files()).find(file => file.id === first.id).source, undefined);
  await page.getByRole('radio', { name: /^Videos direkt aus der Cloud streamen/ }).check();
  await button('Videomodus speichern').click(); await button('Videomodus speichern').waitFor({ state: 'detached' }); await waitSync();
  assert.deepEqual(await fs.readFile(localVideo), Buffer.from(bytes));
  assert.equal((await files()).find(file => file.id === first.id).source, 'nextcloud');
  assert.equal((await files()).find(file => file.id === first.id).state.read, true);
  assert.equal((await fs.readFile(path.join(profile, 'kursraum-settings.json'), 'utf8')).includes('app-passwort'), false);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(800, 650));
  await page.screenshot({ path: path.join(temporary, 'cloud-small.png') });
  assert.deepEqual(errors, []);
  console.log('PASS: Restart, login, opt-in download, switching back preserves files, no renderer errors');
  console.log(`Screenshots: ${temporary}`);
})().catch(async error => { console.error(error); process.exitCode = 1; if (page && !page.isClosed()) await page.screenshot({ path: path.join(temporary, 'failure.png') }).catch(() => {}); })
  .finally(async () => { if (app) await app.close(); if (remote) await remote.close(); });
