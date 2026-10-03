const { _electron: electron } = require('playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const project = path.resolve(__dirname, '../..');
let app, page, temporary;
const errors = [];

// Two different page heights exercise both sides of the scrollbar threshold.
function pdfFixture() {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << >> /Contents 5 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 300] /Resources << >> /Contents 6 0 R >>',
    ...['0.2 0.4 0.7 rg 0 0 595 842 re f\n', '0.7 0.4 0.2 rg 0 0 595 300 re f\n'].map(content => `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}endstream`),
  ];
  let data = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((object, i) => { offsets.push(Buffer.byteLength(data)); data += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(data);
  data += `xref\n0 ${offsets.length}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return data;
}

(async () => {
  temporary = await fs.mkdtemp('/tmp/kursraum-companion-ui-');
  const root = path.join(temporary, 'Kurse');
  const folder = path.join(root, 'Mein Kurs', '01 Einstieg');
  const profile = path.join(temporary, 'profile');
  await fs.mkdir(folder, { recursive: true }); await fs.mkdir(profile);
  await fs.writeFile(path.join(folder, '02 Material.pdf'), pdfFixture());
  await fs.writeFile(path.join(folder, '03 Notizen.txt'), 'Begleitnotizen zum Video.');
  await fs.writeFile(path.join(profile, 'kursraum-settings.json'), JSON.stringify({ root, files: {}, chapters: {}, settings: { theme: 'dark' } }));
  const bootstrap = path.join(temporary, 'main.cjs');
  await fs.writeFile(bootstrap, `require('electron').app.setPath('userData', ${JSON.stringify(profile)});require(${JSON.stringify(path.join(project, 'electron/main.cjs'))});`);
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.VITE_DEV_SERVER_URL;
  app = await electron.launch({ executablePath: path.join(project, 'node_modules/electron/dist/electron'), args: ['--no-sandbox', bootstrap], env });
  page = await app.firstWindow(); page.on('pageerror', error => errors.push(error.message));
  await page.locator('.course-card').first().waitFor();
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 90;
    const context = canvas.getContext('2d'); const stream = canvas.captureStream(10);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
    const chunks = []; const done = new Promise(resolve => { recorder.ondataavailable = e => chunks.push(e.data); recorder.onstop = resolve; });
    recorder.start(); let frame = 0;
    const draw = setInterval(() => { context.fillStyle = frame++ % 2 ? '#817ed5' : '#456a85'; context.fillRect(0, 0, 160, 90); }, 100);
    await new Promise(resolve => setTimeout(resolve, 700)); recorder.stop(); await done;
    clearInterval(draw); stream.getTracks().forEach(track => track.stop());
    return [...new Uint8Array(await new Blob(chunks).arrayBuffer())];
  });
  await fs.writeFile(path.join(folder, '01 Video.webm'), Buffer.from(bytes));
  await page.evaluate(() => window.kursraum.rescan());
  await page.locator('.course-card').first().click();
  await page.getByRole('button', { name: '01 Video.webm ansehen', exact: true }).click();
  await page.locator('video').evaluate(video => { window.testVideo = video; video.loop = true; return video.play(); });
  await page.getByRole('button', { name: 'Begleitmaterial öffnen', exact: true }).click();
  await page.getByLabel('Begleitdokument auswählen').selectOption({ label: '02 Material.pdf' });
  await page.waitForFunction(() => {
    const canvas = document.querySelector('.pdf-canvas-wrap canvas');
    return canvas?.width > 0 && !document.querySelector('.pdf-canvas-wrap .preview-placeholder');
  });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(900, 650));
  const divider = page.getByRole('separator', { name: 'Bereiche aufteilen' });
  await divider.focus(); await page.keyboard.press('Home');
  // Count rendered canvas dimension changes after each resize should have settled.
  for (let step = 0; step <= 10; step++) {
    if (step) await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(500);
    const result = await page.evaluate(async () => {
      const canvas = document.querySelector('.pdf-canvas-wrap canvas');
      let changes = 0;
      const observer = new MutationObserver(records => { changes += records.filter(record => ['width', 'height'].includes(record.attributeName)).length; });
      observer.observe(canvas, { attributes: true });
      await new Promise(resolve => setTimeout(resolve, 800)); observer.disconnect();
      return { changes, width: canvas.width, pane: document.querySelector('.companion-preview').clientWidth };
    });
    assert.ok(result.width > 0);
    assert.equal(result.changes, 0, 'PDF must settle without a scrollbar/render feedback loop');
  }
  console.log('PASS: Eleven split widths settle without repeated PDF rendering (original regression reproduced at 60%)');
  const rendered = () => page.waitForFunction(() => document.querySelector('.pdf-canvas-wrap')?.getAttribute('aria-busy') === 'false');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(800, 650));
  await page.waitForTimeout(200); await rendered();
  await page.evaluate(() => {
    window.blankFrames = 0; window.sampleFrames = 0; window.samplePdf = true;
    const sample = () => {
      if (!window.samplePdf) return;
      const canvas = document.querySelector('.pdf-canvas-wrap canvas');
      if (canvas) {
        window.sampleFrames++;
        if (!canvas.width || !canvas.height || !canvas.getContext('2d').getImageData(0, 0, 1, 1).data[3]) window.blankFrames++;
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  const box = await divider.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + 120); await page.mouse.down();
  await page.mouse.move(220, box.y + 120, { steps: 35 });
  await page.mouse.move(595, box.y + 120, { steps: 35 }); await page.mouse.up();
  await page.waitForTimeout(200); await rendered();
  const samples = await page.evaluate(() => { window.samplePdf = false; return { blank: window.blankFrames, frames: window.sampleFrames }; });
  assert.ok(samples.frames > 10); assert.equal(samples.blank, 0, 'Visible PDF pixels must remain during divider dragging');
  await page.getByLabel('PDF-Zoom').selectOption('2'); await rendered();
  assert.equal(await page.locator('.pdf-canvas-wrap').evaluate(wrap => wrap.scrollWidth > wrap.clientWidth), true);
  await page.getByRole('button', { name: 'Nächste Seite', exact: true }).click(); await rendered();
  assert.match(await page.locator('.pdf-controls').innerText(), /Seite 2 von 2/);
  assert.equal(await page.getByRole('button', { name: 'Nächste Seite', exact: true }).isDisabled(), true);
  assert.equal(await page.locator('.pdf-canvas-wrap canvas').evaluate(canvas => {
    const [r, , b, a] = canvas.getContext('2d').getImageData(0, 0, 1, 1).data;
    return r > b && a === 255;
  }), true, 'The newly selected page is actually drawn');
  await page.getByLabel('PDF-Zoom').selectOption('1'); await rendered();
  await page.getByRole('button', { name: 'Vorherige Seite', exact: true }).click(); await rendered();
  await page.screenshot({ path: path.join(temporary, 'companion-narrow.png') });
  await page.getByLabel('Begleitdokument auswählen').selectOption({ label: '03 Notizen.txt' });
  await page.getByText('Begleitnotizen zum Video.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Begleitmaterial schließen', exact: true }).click();
  await page.getByRole('button', { name: 'Begleitmaterial öffnen', exact: true }).click();
  await page.getByText('Begleitnotizen zum Video.', { exact: true }).waitFor();
  await page.getByLabel('Begleitdokument auswählen').selectOption({ label: '02 Material.pdf' }); await rendered();
  assert.equal(await page.locator('video').evaluate(video => video === window.testVideo && !video.paused && !video.error), true, 'Video playback survives resizing and document switches');
  console.log('PASS: Narrow window, live divider dragging without blank frames, zoom, page changes, reopening and uninterrupted video');
  assert.deepEqual(errors, []);
  console.log(`PASS: Companion PDF sizes settle. Screenshots: ${temporary}`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { if (app) await app.close(); });
