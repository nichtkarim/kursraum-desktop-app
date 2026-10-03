const { _electron: electron } = require('playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const project = path.resolve(__dirname, '../..');
let app, temporary;

(async () => {
  temporary = await fs.mkdtemp('/tmp/kursraum-roadmap-stability-');
  const root = path.join(temporary, 'Kurse');
  for (const name of ['Python', 'Linux', 'Git', 'Docker']) {
    const folder = path.join(root, name, '01 Einstieg');
    await fs.mkdir(folder, { recursive: true });
    await fs.writeFile(path.join(folder, 'Lektion.txt'), 'Lernmaterial');
  }
  const profile = path.join(temporary, 'profile');
  await fs.mkdir(profile);
  await fs.writeFile(path.join(profile, 'kursraum-settings.json'), JSON.stringify({ root, settings: { theme: 'dark', fontScale: 1 } }));
  const bootstrap = path.join(temporary, 'main.cjs');
  await fs.writeFile(bootstrap, `require('electron').app.setPath('userData',${JSON.stringify(profile)});require(${JSON.stringify(process.env.KURSRAUM_TEST_APP_MAIN || path.join(project, 'electron/main.cjs'))});`);
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ executablePath: path.join(project, 'node_modules/electron/dist/electron'), args: ['--no-sandbox', bootstrap], env });
  const page = await app.firstWindow();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.locator('.course-card').first().waitFor();
  const mapId = await page.evaluate(async () => {
    const courses = (await window.kursraum.overview()).courses;
    let map = await window.kursraum.roadmaps.create({ title: 'Verzweigte Roadmap', courseIds: ['Python', 'Linux', 'Git', 'Docker'].map(name => courses.find(c => c.name === name).id) });
    const [a, b, c, d] = map.nodes;
    map = await window.kursraum.roadmaps.save({ ...map,
      nodes: map.nodes.map((n, i) => ({ ...n, position: [{ x: 0, y: 0 }, { x: 0, y: 370 }, { x: 400, y: 185 }, { x: 1000, y: 185 }][i], prerequisiteMode: i === 2 ? 'or' : 'and' })),
      edges: [[a, c], [b, c], [a, d], [b, d]].map(([from, to], i) => ({ id: `link${i}`, source: from.id, target: to.id })) });
    return map.id;
  });
  await page.getByRole('button', { name: 'Roadmaps', exact: true }).click();
  await page.getByLabel('Roadmap auswählen', { exact: true }).selectOption(mapId);
  await page.locator('.roadmap-node').first().waitFor();
  await page.getByRole('button', { name: 'Alles anzeigen', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.react-flow__node').length === 4 && [...document.querySelectorAll('.react-flow__node')].every(n => getComputedStyle(n).visibility === 'visible'));
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    window.canvasSamples = { hiddenFrames: 0, missingFrames: 0, frames: 0, running: true };
    const sample = () => {
      if (!window.canvasSamples.running) return;
      const nodes = [...document.querySelectorAll('.react-flow__node')];
      window.canvasSamples.frames++;
      if (nodes.length !== 4) window.canvasSamples.missingFrames++;
      if (nodes.some(n => getComputedStyle(n).visibility !== 'visible')) window.canvasSamples.hiddenFrames++;
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  for (let i = 0; i < 12; i++) {
    await page.getByLabel('Roadmap umbenennen', { exact: true }).fill(`Verzweigte Roadmap ${i}`);
    await page.getByRole('button', { name: 'Roadmap speichern', exact: true }).click();
    await page.waitForFunction(async ({ id, title }) => (await window.kursraum.roadmaps.get(id)).title === title, { id: mapId, title: `Verzweigte Roadmap ${i}` });
    if (i % 3 === 0) await page.evaluate(() => window.kursraum.rescan());
  }
  await page.waitForTimeout(250);
  const samples = await page.evaluate(() => { window.canvasSamples.running = false; return window.canvasSamples; });
  console.log('Canvas frames during save / library refresh:', samples);
  assert.equal(samples.missingFrames, 0, 'Roadmap nodes disappeared during a save');
  assert.equal(samples.hiddenFrames, 0, 'Roadmap nodes flickered during a save');
  assert.deepEqual(errors, []);
  console.log('PASS: No flicker or missing nodes during repeated saves and library refreshes');
  assert.equal(await page.locator('.roadmap-node-condition').count(), 2);
  assert.equal(await page.locator('.react-flow__edge-text').count(), 0);
  const assertClearPaths = async () => {
    const collisions = await page.evaluate(() => {
      const boxes = [...document.querySelectorAll('.react-flow__node')].map(n => n.getBoundingClientRect());
      let count = 0;
      for (const edge of document.querySelectorAll('.react-flow__edge-path')) {
        for (let step = 2; step < edge.getTotalLength() - 2; step += 3) {
          const point = edge.getPointAtLength(step);
          const screen = new DOMPoint(point.x, point.y).matrixTransform(edge.getScreenCTM());
          if (boxes.some(b => screen.x > b.left + 1 && screen.x < b.right - 1 && screen.y > b.top + 1 && screen.y < b.bottom - 1)) count++;
        }
      }
      return count;
    });
    assert.equal(collisions, 0, 'Connections should not cross course cards');
  };
  await assertClearPaths();
  const edge = page.locator('.react-flow__edge-path').first();
  const point = await edge.evaluate(e => { const p = e.getPointAtLength(e.getTotalLength() / 2); const t = new DOMPoint(p.x, p.y).matrixTransform(e.getScreenCTM()); return { x: t.x, y: t.y }; });
  await page.mouse.move(point.x, point.y);
  await page.waitForFunction(() => [...document.querySelectorAll('.react-flow__edge-path')].filter(e => Number(e.style.opacity) < .2).length === 3);
  await page.mouse.move(10, 10);
  await page.getByRole('button', { name: 'Anordnen', exact: true }).click();
  await page.getByRole('button', { name: 'Ansicht zentrieren', exact: true }).click();
  await page.waitForTimeout(200);
  await assertClearPaths();
  await page.screenshot({ path: '/tmp/kursraum-roadmap-routing.png' });
  const before = await page.evaluate(id => window.kursraum.roadmaps.get(id), mapId);
  await page.getByRole('button', { name: 'Bibliothek', exact: true }).click();
  await page.evaluate(async id => { const map = await window.kursraum.roadmaps.get(id); await window.kursraum.roadmaps.save({ ...map, viewport: { x: 50000, y: 50000, zoom: .5 } }); }, mapId);
  await page.reload();
  await page.getByRole('button', { name: 'Roadmaps', exact: true }).click();
  await page.getByLabel('Roadmap auswählen', { exact: true }).selectOption(mapId);
  await page.waitForFunction(() => {
    const canvas = document.querySelector('.roadmap-canvas')?.getBoundingClientRect();
    const nodes = [...document.querySelectorAll('.react-flow__node')];
    return canvas && nodes.length === 4 && nodes.every(n => { const b = n.getBoundingClientRect(); return b.left >= canvas.left && b.right <= canvas.right && b.top >= canvas.top && b.bottom <= canvas.bottom; });
  });
  const after = await page.evaluate(id => window.kursraum.roadmaps.get(id), mapId);
  assert.deepEqual(after.nodes, before.nodes);
  assert.deepEqual(after.edges, before.edges);
  assert.deepEqual(errors, []);
  console.log('PASS: Distinct logic badges, unobstructed connections, hover focus, layout and recovery of an offscreen viewport without data loss');

})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (app) await app.close();
  if (temporary) await fs.rm(temporary, { recursive: true, force: true });
});
