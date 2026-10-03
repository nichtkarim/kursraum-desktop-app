const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { CourseLibrary } = require('../electron/library.cjs');
const { scanTree } = require('../electron/scanner.cjs');
const { Store } = require('../electron/store.cjs');

async function fixture(t, names) {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'kursraum-videos-'));
  const root = path.join(temporary, 'Kurse');
  t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  for (const name of names) {
    const file = path.join(root, name);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, 'fixture');
  }
  const store = new Store(path.join(temporary, 'settings.json'));
  const library = new CourseLibrary(store);
  library.root = root;
  Object.assign(library, await scanTree(root));
  await library.rebuildIndex();
  return { library, store };
}

test('Videofolge folgt Kursstart, natürlichen Kapitelnummern und Unterkapiteln; überspringt Dokumente', async t => {
  const { library } = await fixture(t, [
    'Kurs/99 Willkommen.mp4',
    'Kurs/Tag 2/Video 2.mp4',
    'Kurs/Tag 2/Video 3.txt',
    'Kurs/Tag 2/Video 10.mp4',
    'Kurs/Tag 2/Übungen/Video 1.webm',
    'Kurs/Tag 3/Notizen.txt',
    'Kurs/Tag 10/Video 1.mp4',
    'Zweiter Kurs/Video 1.mp4'
  ]);
  const course = library.overview().courses.find(course => course.name === 'Kurs');
  let video = library.listFiles({ courseId: course.id }).items[0];
  const sequence = [video.relative];
  while ((video = library.nextVideo(video.id))) {
    assert.equal(video.courseId, course.id);
    sequence.push(video.relative);
  }
  assert.deepEqual(sequence, [
    'Kurs/99 Willkommen.mp4', 'Kurs/Tag 2/Video 2.mp4', 'Kurs/Tag 2/Video 10.mp4',
    'Kurs/Tag 2/Übungen/Video 1.webm', 'Kurs/Tag 10/Video 1.mp4'
  ]);
});

test('Videofolge funktioniert über die Seitengrenze der Materialliste hinaus', async t => {
  const { library } = await fixture(t, Array.from({ length: 65 }, (_, i) => `Kurs/Kapitel/Video ${i + 1}.mp4`));
  const courseId = library.overview().courses[0].id;
  const page = library.listFiles({ courseId, chapterPath: 'Kapitel' });
  assert.equal(page.items.length, 60);
  assert.equal(library.nextVideo(page.items.at(-1).id).name, 'Video 61.mp4');
});

test('Videofolge lehnt fehlende und nicht als Video erkannte Dateien ab', async t => {
  const { library } = await fixture(t, ['Kurs/Notizen.txt', 'Kurs/Video.mp4']);
  const courseId = library.overview().courses[0].id;
  const files = library.listFiles({ courseId }).items;
  assert.throws(() => library.nextVideo('unbekannt'), /Video nicht gefunden/);
  assert.throws(() => library.nextVideo(files.find(file => file.kind === 'text').id), /Video nicht gefunden/);
  const video = files.find(file => file.kind === 'video');
  library.fileById.delete(video.id);
  assert.throws(() => library.nextVideo(video.id), /Video nicht gefunden/);
});

test('Wiederholtes Abschließen bleibt gelesen und wird mit Favoritenstatus dauerhaft gespeichert', async t => {
  const { library, store } = await fixture(t, ['Kurs/Video.mp4']);
  const courseId = library.overview().courses[0].id;
  const video = library.listFiles({ courseId }).items[0];
  library.setFileState(video.id, { favorite: true });
  library.setFileState(video.id, { read: true, learningPoints: ['Erster Lernpunkt', 'Zweiter Lernpunkt'], serviceIdea: 'Eine mögliche Dienstleistung' });
  library.setFileState(video.id, { read: true });
  assert.equal(library.course(courseId).readCount, 1);
  await store.flush();
  const restored = new Store(store.filename);
  await restored.load();
  assert.deepEqual(restored.file(video.id), { read: true, favorite: true, learningPoints: ['Erster Lernpunkt', 'Zweiter Lernpunkt'], serviceIdea: 'Eine mögliche Dienstleistung', serviceAudience: '', serviceNextStep: '' });
});

test('Videoposition bleibt bei Neustart, Favoriten und Reflexion erhalten, ohne als gelesen zu gelten', async t => {
  const { library, store } = await fixture(t, ['Kurs/Video.mp4', 'Kurs/Zweites.mp4', 'Kurs/Notizen.txt']);
  const files = library.listFiles({ courseId: library.overview().courses[0].id }).items;
  const video = files.find(file => file.name === 'Video.mp4');
  await library.setVideoProgress(video.id, 123.75);
  assert.equal(store.file(video.id).read, false);
  assert.equal(await library.videoProgress(video.id), 123.75);
  await library.persistState(() => library.setFileState(video.id, { favorite: true }));
  await library.persistState(() => library.setFileState(video.id, { read: true, learningPoints: ['Eins', 'Zwei'], serviceIdea: 'Ein Workshop' }));
  assert.equal(await library.videoProgress(video.id), 123.75);
  const restored = new Store(store.filename); await restored.load();
  assert.equal(restored.file(video.id).playbackPosition, 123.75);
  assert.equal(await library.videoProgress(files.find(file => file.name === 'Zweites.mp4').id), 0);
  await library.setVideoProgress(video.id, 0);
  assert.equal(store.file(video.id).read, true);
  assert.equal(store.file(video.id).serviceIdea, 'Ein Workshop');
  assert.equal(await library.videoProgress(video.id), 0);
});

test('Videoposition validiert Eingaben, serialisiert Schreibzugriffe und verwendet auch Cloud-IDs', async t => {
  const { library, store } = await fixture(t, ['Kurs/Video.mp4', 'Kurs/Notizen.txt']);
  const files = library.listFiles({ courseId: library.overview().courses[0].id }).items;
  const video = files.find(file => file.kind === 'video');
  for (const value of [-1, NaN, Infinity, '30', null, {}]) await assert.rejects(library.setVideoProgress(video.id, value), /Ungültige Videoposition/);
  await assert.rejects(library.setVideoProgress(files.find(file => file.kind === 'text').id, 2), /Video nicht gefunden/);
  await assert.rejects(library.videoProgress('missing'), /Video nicht gefunden/);
  await library.setCloudVideos(library.root, [{ relative: 'Kurs/Video.mp4', name: 'Video.mp4', size: 10, modified: Date.now() }]);
  await Promise.all([library.setVideoProgress(video.id, 17), library.setVideoProgress(video.id, 9)]);
  assert.equal(await library.videoProgress(video.id), 9);
  const originalFlush = store.flush;
  store.flush = async () => { throw new Error('disk full'); };
  await assert.rejects(library.setVideoProgress(video.id, 50), /disk full/);
  store.flush = originalFlush;
  assert.equal(await library.videoProgress(video.id), 9);
  await library.setVideoProgress(video.id, 12);
  assert.equal(await library.videoProgress(video.id), 12);
});
