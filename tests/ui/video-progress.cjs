const { _electron: electron } = require('playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const project = path.resolve(__dirname, '../..');
let app, page, temporary;
const errors = [];
(async () => {
  temporary = await fs.mkdtemp('/tmp/kursraum-resume-ui-');
  const root = path.join(temporary, 'Kurse');
  const folder = path.join(root, 'Mein Kurs', '01 Einstieg');
  const profile = path.join(temporary, 'profile');
  await fs.mkdir(folder, { recursive: true }); await fs.mkdir(profile);
  await fs.writeFile(path.join(folder, 'Notizen.txt'), 'Notizen');
  await fs.writeFile(path.join(profile, 'kursraum-settings.json'), JSON.stringify({ root, files: {}, chapters: {} }));
  const bootstrap = path.join(temporary, 'main.cjs');
  await fs.writeFile(bootstrap, `require('electron').app.setPath('userData', ${JSON.stringify(profile)});require(${JSON.stringify(path.join(project, 'electron/main.cjs'))});`);
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.VITE_DEV_SERVER_URL;
  const launch = async () => {
    app = await electron.launch({ executablePath: path.join(project, 'node_modules/electron/dist/electron'), args: ['--no-sandbox', bootstrap], env });
    page = await app.firstWindow(); page.on('pageerror', error => errors.push(error.message));
    await page.locator('.course-card').first().waitFor();
  };
  const button = name => page.getByRole('button', { name, exact: true });
  const open = async (name = '01 Video.webm') => {
    await button(`${name} ansehen`).click();
    await page.waitForFunction(() => document.querySelector('video')?.readyState >= 2);
  };
  const close = () => button('Vorschau schließen').click();
  const seek = async seconds => {
    await page.locator('video').evaluate((video, value) => new Promise(resolve => {
      video.pause(); video.addEventListener('seeked', resolve, { once: true }); video.currentTime = value;
    }), seconds);
  };
  const at = seconds => page.waitForFunction(value => Math.abs(document.querySelector('video').currentTime - value) < 0.2, seconds);
  await launch();
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 90;
    const context = canvas.getContext('2d'); const stream = canvas.captureStream(10);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
    const chunks = []; const done = new Promise(resolve => { recorder.ondataavailable = e => chunks.push(e.data); recorder.onstop = resolve; });
    recorder.start(); let frame = 0;
    const draw = setInterval(() => { context.fillStyle = frame++ % 2 ? '#817ed5' : '#456a85'; context.fillRect(0, 0, 160, 90); }, 100);
    await new Promise(resolve => setTimeout(resolve, 9000)); recorder.stop(); await done;
    clearInterval(draw); stream.getTracks().forEach(track => track.stop());
    return [...new Uint8Array(await new Blob(chunks).arrayBuffer())];
  });

  await fs.writeFile(path.join(folder, '01 Video.webm'), Buffer.from(bytes));
  await fs.writeFile(path.join(folder, '02 Video.webm'), Buffer.from(bytes));
  await page.evaluate(() => window.kursraum.rescan());
  await page.locator('.course-card').first().click();
  await open();
  const id = await page.locator('video').evaluate(video => new URL(video.src).pathname.slice(1));
  await seek(2.5); await close(); await open(); await at(2.5);
  assert.equal(await page.locator('video').evaluate(video => video.paused), true);
  await seek(1.2); await close(); await open(); await at(1.2);
  await close(); await open('02 Video.webm'); await at(0); await close();
  console.log('PASS: Exact resume, backward seeking, fresh state despite stale list, separate positions per video');
  await open(); await at(1.2);
  await page.locator('video').evaluate(video => video.play());
  await page.waitForFunction(async videoId => (await window.kursraum.videoProgress(videoId)) > 5, id);
  // Close the actual Electron window while playing, without a preceding pause.
  const last = await page.locator('video').evaluate(video => video.currentTime);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await app.close(); app = null;
  await launch(); await page.locator('.course-card').first().click(); await open();
  const resumed = await page.locator('video').evaluate(video => video.currentTime);
  assert.ok(Math.abs(resumed - last) < 0.6, `Expected restart at ${last}, got ${resumed}`);
  console.log('PASS: Periodic checkpoint and exact progress on application close/restart during playback');
  await page.locator('video').evaluate(video => { video.playbackRate = 4; return video.play(); });
  await page.locator('.reflection-dialog').waitFor();
  await button('Noch nicht abschließen').click();
  await close(); await open(); await at(0);
  assert.equal(await page.evaluate(videoId => window.kursraum.videoProgress(videoId), id), 0);
  assert.deepEqual(errors, []);
  console.log(`PASS: Natural video end resets position without bypassing reflection. Profile: ${temporary}`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { if (app) await app.close(); });
