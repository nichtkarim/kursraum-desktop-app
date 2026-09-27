const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { scanTree, isInside, fileKind } = require('../electron/scanner.cjs');
const { CourseLibrary } = require('../electron/library.cjs');
const { parseRange } = require('../electron/range.cjs');

const fakeStore = () => ({
  data: { root: null },
  file: () => ({ read: false, favorite: false }),
  chapter: () => ({ complete: false, note: '' }),
  setFile: () => ({ read: false, favorite: false }),
  setChapter: () => ({ complete: false, note: '' }),
  schedule: () => {}
});

test('Pfadkontrolle lehnt benachbarte Verzeichnisse ab', () => {
  const base = path.resolve('/tmp', 'Kurse');
  assert.equal(isInside(base, path.join(base, 'Kurs', 'file.txt')), true);
  assert.equal(isInside(base, path.resolve('/tmp', 'Kurse-sichtbar', 'file.txt')), false);
});

test('Range-Parser unterstützt offene und Suffix-Ranges', () => {
  assert.deepEqual(parseRange('bytes=3-5', 10), { start: 3, end: 5 });
  assert.deepEqual(parseRange('bytes=8-', 10), { start: 8, end: 9 });
  assert.deepEqual(parseRange('bytes=-4', 10), { start: 6, end: 9 });
  assert.throws(() => parseRange('bytes=11-13', 10));
  assert.throws(() => parseRange('bytes=0-1,4-5', 10));
});

test('Dateitypen und verschachtelte Unicode-Ordner werden indexiert', async t => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'kursraum-test-'));
  t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  const root = await fs.realpath(temporary);
  const courseDir = path.join(root, 'Äpfel & Öfen');
  const chapterDir = path.join(courseDir, 'Tag 02 – Shell', 'Übungen');
  await fs.mkdir(chapterDir, { recursive: true });
  await fs.writeFile(path.join(courseDir, 'description.md'), '# Beispiel\n\nEin deutscher Kurs.');
  await fs.writeFile(path.join(chapterDir, 'Lektion 01.txt'), 'Hallo');
  await fs.writeFile(path.join(chapterDir, 'Dokument.PDF'), '%PDF');
  const { dirs, files } = await scanTree(root);
  assert.equal(files.size, 3);
  assert.ok(dirs.has('Äpfel & Öfen/Tag 02 – Shell/Übungen'));
  const library = new CourseLibrary(fakeStore());
  library.root = root;
  library.dirs = dirs;
  library.files = files;
  await library.rebuildIndex();
  const [course] = library.overview().courses;
  assert.equal(course.name, 'Äpfel & Öfen');
  assert.equal(course.fileCount, 2);
  assert.equal(course.chapterCount, 2);
  assert.match(course.description, /Beispiel/);
  const chapterFiles = library.listFiles({ courseId: course.id, chapterPath: 'Tag 02 – Shell/Übungen' });
  assert.equal(chapterFiles.total, 2);
  assert.equal(chapterFiles.items[0].kind, 'pdf');
  assert.equal(library.search({ query: 'SHÉLL' }).total, 2);
  assert.equal(fileKind('film.mp4'), 'video');
});

test('Scanner folgt keinen Symlinks auf externe Dateien', async t => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'kursraum-link-'));
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'kursraum-outside-'));
  t.after(() => Promise.all([fs.rm(temporary, { recursive: true, force: true }), fs.rm(outside, { recursive: true, force: true })]));
  const root = await fs.realpath(temporary);
  await fs.mkdir(path.join(root, 'Kurs'));
  await fs.writeFile(path.join(outside, 'geheim.txt'), 'privat');
  try { await fs.symlink(path.join(outside, 'geheim.txt'), path.join(root, 'Kurs', 'verweis.txt')); }
  catch (error) { if (['EPERM', 'EACCES'].includes(error.code)) return; throw error; }
  const result = await scanTree(root);
  assert.equal(result.files.size, 0);
});
