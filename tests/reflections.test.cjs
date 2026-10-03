const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Store } = require('../electron/store.cjs');
const { CourseLibrary } = require('../electron/library.cjs');
const { scanTree } = require('../electron/scanner.cjs');
const points = ['Ich kann Dateien auflisten.', 'Ich kann Ordner anlegen.'];
const idea = 'Ich könnte eine strukturierte Dateiablage einrichten.';
const reflection = { learningPoints: points, serviceIdea: idea, serviceAudience: 'Kleine Teams', serviceNextStep: 'Eine Beispielablage erstellen.' };

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'kursraum-reflections-'));
  const store = new Store(path.join(directory, 'settings.json'));
  const library = new CourseLibrary(store);
  const root = path.join(directory, 'Kurse');
  const folder = path.join(root, 'Kurs', 'Kapitel');
  await fs.mkdir(folder, { recursive: true });
  for (const name of ['Video.mp4', 'Dokument.txt', 'Begleitmaterial.pdf', 'Bild.png']) await fs.writeFile(path.join(folder, name), 'Material');
  library.root = root;
  Object.assign(library, await scanTree(root));
  await library.rebuildIndex();
  const courseId = library.overview().courses[0].id;
  const files = library.listFiles({ courseId, chapterPath: 'Kapitel' }).items;
  t.after(async () => { await store.flush(); await fs.rm(directory, { recursive: true, force: true }); });
  return { directory, store, library, courseId, files, video: files.find(file => file.kind === 'video') };
}

test('Nur Videos brauchen beim Abschluss zwei Lernpunkte und eine Dienstleistungsidee', async t => {
  const { library, courseId, files, video } = await fixture(t);
  for (const file of files.filter(file => file.kind !== 'video')) {
    assert.equal(library.setFileState(file.id, { read: true }).read, true);
  }
  assert.equal(library.setChapterState(courseId, 'Kapitel', { complete: true }).complete, true);
  for (const patch of [{ read: true }, { read: true, learningPoints: points }, { read: true, learningPoints: points, serviceIdea: ' \n ' }, { read: true, learningPoints: ['Ein Punkt', '  '], serviceIdea: idea }]) {
    assert.throws(() => library.setFileState(video.id, patch), /Lernpunkte|Dienstleistungsidee/);
  }
  assert.equal(library.listFiles({ courseId, chapterPath: 'Kapitel' }).items.find(file => file.id === video.id).state.read, false);
  assert.equal(library.setFileState(video.id, { read: true, ...reflection }).read, true);
});

test('Reflexionen prüfen unterschiedliche Lernpunkte, Feldtypen und Längen auch bei Bearbeitung', async t => {
  const { library, video, store } = await fixture(t);
  assert.throws(() => library.setFileState(video.id, { read: true, learningPoints: ['Gelernt', ' gelernt '], serviceIdea: idea }), /unterschiedliche/);
  const saved = library.setFileState(video.id, { read: true, learningPoints: [' Erster Punkt ', '\nZweiter Punkt', 'Dritter Punkt', ' '], serviceIdea: ` ${idea} ` });
  assert.deepEqual(saved.learningPoints, ['Erster Punkt', 'Zweiter Punkt', 'Dritter Punkt']);
  assert.equal(saved.serviceIdea, idea);
  for (const patch of [{ learningPoints: ['Nur einer'] }, { learningPoints: 'Text' }, { learningPoints: [42, 'Text'] }, { learningPoints: ['x'.repeat(2001), 'Text'] }, { serviceIdea: '' }, { serviceIdea: 7 }, { serviceIdea: 'x'.repeat(4001) }, { serviceAudience: false }, { serviceNextStep: 'x'.repeat(2001) }]) {
    assert.throws(() => library.setFileState(video.id, patch));
    assert.deepEqual(store.file(video.id), saved);
  }
});

test('Lernpunkte und Ideen bleiben nach Zurücksetzen, Favoritenwechsel und Neustart erhalten', async t => {
  const { store, library, video, courseId } = await fixture(t);
  library.setFileState(video.id, { read: true, favorite: true, ...reflection });
  library.setFileState(video.id, { read: false, favorite: false });
  library.setChapterState(courseId, 'Kapitel', { complete: true, note: 'Freie Notiz' });
  await store.flush();
  const restored = new Store(store.filename);
  await restored.load();
  assert.deepEqual(restored.file(video.id), { read: false, favorite: false, ...reflection });
  assert.equal(library.setFileState(video.id, { read: true }).read, true);
  assert.equal(library.course(courseId).chapters[0].state.note, 'Freie Notiz');
});

test('Bestandsfortschritt bleibt erhalten; ältere Videolernpunkte lassen sich um eine Idee ergänzen', async t => {
  const { store, library, video, files, courseId } = await fixture(t);
  store.data.files[video.id] = { read: true, favorite: false, learningPoints: points };
  const document = files.find(file => file.kind === 'text');
  store.data.files[document.id] = { read: true, favorite: false, learningPoints: points };
  assert.equal(library.setFileState(video.id, { favorite: true }).read, true);
  assert.equal(library.setFileState(document.id, { read: true }).read, true);
  assert.equal(library.setChapterState(courseId, 'Kapitel', { complete: true, note: 'Ergänzt' }).complete, true);
  assert.throws(() => library.setFileState(video.id, { read: true }), /Dienstleistungsidee/);
  assert.deepEqual(library.setFileState(video.id, { serviceIdea: idea }).learningPoints, points);
  assert.equal(library.setFileState(video.id, { read: true }).serviceIdea, idea);
  assert.equal(library.reflections().length, 2);
});

test('Übersicht liefert Videozuordnung und Ideen und trennt Bibliotheken', async t => {
  const { directory, store, library, video } = await fixture(t);
  library.setFileState(video.id, { read: true, ...reflection });
  const [entry] = library.reflections();
  assert.equal(entry.kind, 'video');
  assert.equal(entry.type, 'file');
  assert.equal(entry.courseName, 'Kurs');
  assert.equal(entry.chapterPath, 'Kapitel');
  assert.equal(entry.state.serviceIdea, idea);
  assert.equal(entry.id, video.id);
  const otherRoot = path.join(directory, 'Andere Kurse');
  await fs.mkdir(path.join(otherRoot, 'Kurs', 'Kapitel'), { recursive: true });
  await fs.writeFile(path.join(otherRoot, 'Kurs', 'Kapitel', 'Video.mp4'), 'Anderes Video');
  library.root = otherRoot;
  Object.assign(library, await scanTree(otherRoot));
  await library.rebuildIndex();
  assert.deepEqual(library.reflections(), []);
  assert.equal(store.file(video.id).serviceIdea, idea);
});

test('Fehlgeschlagene Speicherung setzt Abschluss und Idee zurück; erneutes Speichern funktioniert', async t => {
  const { store, library, video } = await fixture(t);
  await fs.mkdir(store.filename);
  await assert.rejects(library.persistState(() => library.setFileState(video.id, { read: true, ...reflection })));
  assert.equal(store.file(video.id).read, false);
  assert.equal(store.file(video.id).serviceIdea, undefined);
  await fs.rmdir(store.filename);
  await Promise.all([
    library.persistState(() => library.setFileState(video.id, { read: true, ...reflection })),
    library.persistState(() => library.setFileState(video.id, { favorite: true }))
  ]);
  const restored = new Store(store.filename);
  await restored.load();
  assert.deepEqual(restored.file(video.id), { read: true, favorite: true, ...reflection });
});
