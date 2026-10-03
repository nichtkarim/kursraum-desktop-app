const { _electron: electron } = require('playwright-core');
const fs = require('node:fs/promises');
const path = require('node:path');

const project = path.resolve(__dirname, '../..');
const output = path.join(project, 'docs/screenshots');
let app;
let temp;

(async () => {
  temp = await fs.mkdtemp('/tmp/kursraum-readme-');
  const root = path.join(temp, 'Kurse');
  const profile = path.join(temp, 'profile');
  await fs.cp(path.join(project, 'example/Kurse'), root, { recursive: true });
  await fs.mkdir(profile);
  await fs.writeFile(path.join(profile, 'kursraum-settings.json'), JSON.stringify({ root, files: {}, chapters: {}, settings: { theme: 'dark' } }));
  const bootstrap = path.join(temp, 'main.cjs');
  await fs.writeFile(bootstrap, `require('electron').app.setPath('userData', ${JSON.stringify(profile)});require(${JSON.stringify(path.join(project, 'electron/main.cjs'))});`);
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.VITE_DEV_SERVER_URL;
  app = await electron.launch({ executablePath: path.join(project, 'node_modules/electron/dist/electron'), args: ['--no-sandbox', bootstrap], env });
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 900));
  const screenshot = async name => {
    await page.screenshot({ path: path.join(output, name), type: 'jpeg', quality: 85, animations: 'disabled' });
    console.log(name);
  };
  await page.locator('.course-card').first().waitFor();
  await page.waitForFunction(() => document.querySelectorAll('.course-card').length >= 4);
  await screenshot('01-kursuebersicht.jpg');

  // Record a short, self-contained demo video with Chromium. No course media is published.
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 960; canvas.height = 540;
    const context = canvas.getContext('2d');
    const stream = canvas.captureStream(12);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
    const chunks = [];
    const done = new Promise(resolve => { recorder.ondataavailable = event => chunks.push(event.data); recorder.onstop = resolve; });
    let frame = 0;
    const draw = () => {
      const gradient = context.createLinearGradient(0, 0, 960, 540);
      gradient.addColorStop(0, '#223454'); gradient.addColorStop(1, '#55549e');
      context.fillStyle = gradient; context.fillRect(0, 0, 960, 540);
      context.fillStyle = 'rgba(255,255,255,.08)'; context.beginPath(); context.arc(780 + frame % 30, 130, 220, 0, 2 * Math.PI); context.fill();
      context.fillStyle = '#cfc9ff'; context.font = 'bold 26px sans-serif'; context.fillText('KURSRAUM  /  LINUX GRUNDLAGEN', 92, 125);
      context.fillStyle = '#ffffff'; context.font = 'bold 66px sans-serif'; context.fillText('Die Shell verstehen', 92, 245);
      context.font = '30px sans-serif'; context.fillText('Befehle, Pfade und Automatisierung', 94, 305);
      context.fillStyle = '#a9e3d3'; context.font = 'bold 25px monospace'; context.fillText('$ pwd  &&  ls -la', 95, 390);
      frame++;
    };
    draw(); recorder.start();
    const interval = setInterval(draw, 80);
    await new Promise(resolve => setTimeout(resolve, 2000));
    recorder.stop(); await done; clearInterval(interval); stream.getTracks().forEach(track => track.stop());
    return [...new Uint8Array(await new Blob(chunks).arrayBuffer())];
  });
  const videoFile = path.join(root, 'Linux Grundlagen', '02 – Shell', '01 Die Shell verstehen.webm');
  await fs.writeFile(videoFile, Buffer.from(bytes));
  await page.evaluate(() => window.kursraum.rescan());
  await page.locator('.course-card').filter({ hasText: 'Linux Grundlagen' }).click();
  await page.locator('.chapter-link').filter({ hasText: '02 – Shell' }).click();
  await page.getByRole('button', { name: '01 Die Shell verstehen.webm ansehen', exact: true }).waitFor();
  await screenshot('02-kurs-und-kapitel.jpg');

  await page.getByRole('button', { name: '01 Die Shell verstehen.webm ansehen', exact: true }).click();
  await page.locator('video').waitFor();
  await page.getByRole('button', { name: 'Begleitmaterial öffnen', exact: true }).click();
  await page.getByLabel('Begleitdokument auswählen').selectOption({ label: '02 Befehlsübersicht.pdf' });
  await page.waitForFunction(() => document.querySelector('.pdf-canvas-wrap')?.getAttribute('aria-busy') === 'false');
  await screenshot('03-video-mit-begleitmaterial.jpg');

  await page.getByRole('button', { name: 'Dateiinformationen', exact: true }).click();
  await page.getByRole('button', { name: 'Als gelesen', exact: true }).click();
  await page.getByLabel('Lernpunkt 1', { exact: true }).fill('Ich kann mich im Terminal orientieren und meinen aktuellen Ordner anzeigen.');
  await page.getByLabel('Lernpunkt 2', { exact: true }).fill('Ich kann Dateien auflisten und einfache Shell-Befehle kombinieren.');
  await page.getByLabel('Dienstleistungsidee (Pflichtfeld)', { exact: true }).fill('Ich könnte kleinen Teams eine Einführung in die Shell und ihre täglichen Arbeitsabläufe anbieten.');
  await screenshot('04-reflexion-zum-video.jpg');
  await page.getByRole('button', { name: 'Speichern & abschließen', exact: true }).click();
  await page.locator('.reflection-dialog').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Vorschau schließen', exact: true }).click();
  await page.getByRole('button', { name: 'Reflexion & Ideen', exact: true }).click();
  await page.locator('.reflection-card').first().waitFor();
  await screenshot('05-reflexionen-und-ideen.jpg');
  if (errors.length) throw new Error(errors.join('\n'));
})().catch(error => { console.error(error); process.exitCode = 1; })
  .finally(async () => { if (app) await app.close(); if (temp) await fs.rm(temp, { recursive: true, force: true }); });
