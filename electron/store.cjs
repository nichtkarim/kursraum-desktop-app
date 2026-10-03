const fs = require('node:fs/promises');
const path = require('node:path');

function learningPoints(current, patch) {
  const supplied = Object.hasOwn(patch, 'learningPoints');
  let points = current.learningPoints || [];
  if (supplied) {
    if (!Array.isArray(patch.learningPoints) || patch.learningPoints.length > 100 ||
        patch.learningPoints.some(point => typeof point !== 'string' || point.length > 2000)) {
      throw new Error('Bitte gültige Lernpunkte eingeben (höchstens 100 Punkte mit je 2000 Zeichen).');
    }
    points = patch.learningPoints.map(point => point.trim()).filter(Boolean);
    if (new Set(points.map(point => point.normalize('NFKC').toLocaleLowerCase('de'))).size !== points.length) {
      throw new Error('Bitte unterschiedliche Lernpunkte eintragen.');
    }
  }
  if (supplied && points.length < 2) {
    throw new Error('Trage mindestens zwei Lernpunkte für deine Reflexion ein.');
  }
  return points;
}

function reflectionText(current, patch, key, maximum) {
  if (!Object.hasOwn(patch, key)) return current[key] || '';
  if (typeof patch[key] !== 'string' || patch[key].length > maximum) throw new Error('Bitte gültige Angaben zur Dienstleistungsidee eingeben.');
  return patch[key].trim();
}

class Store {
  constructor(filename) {
    this.filename = filename;
    this.data = { root: null, nextcloud: null, settings: { theme: 'dark', fontScale: 1, locale: 'de', roadmapReducedMotion: false }, files: {}, chapters: {} };
    this.timer = null;
    this.writing = Promise.resolve();
  }

  async load() {
    try {
      const raw = JSON.parse(await fs.readFile(this.filename, 'utf8'));
      if (!raw || typeof raw !== 'object') return;
      this.data.root = typeof raw.root === 'string' ? raw.root : null;
      const cloud = raw.nextcloud;
      if (cloud && ['serverUrl', 'username', 'remotePath', 'localRoot'].every(key => typeof cloud[key] === 'string')) {
        this.data.nextcloud = { serverUrl: cloud.serverUrl, username: cloud.username, remotePath: cloud.remotePath, localRoot: cloud.localRoot,
          videoMode: cloud.videoMode === 'stream' ? 'stream' : 'download', videos: Array.isArray(cloud.videos) ? cloud.videos : [],
          autoSync: cloud.autoSync === true, encryptedPassword: typeof cloud.encryptedPassword === 'string' ? cloud.encryptedPassword : '', lastSync: cloud.lastSync || null };
      }
      this.data.settings = { ...this.data.settings, ...(raw.settings || {}) };
      this.data.files = raw.files && typeof raw.files === 'object' ? raw.files : {};
      this.data.chapters = raw.chapters && typeof raw.chapters === 'object' ? raw.chapters : {};
    } catch (error) {
      if (error.code !== 'ENOENT') console.warn('Einstellungen konnten nicht gelesen werden:', error);
    }
  }

  settings() { return { ...this.data.settings }; }
  file(id) { return this.data.files[id] || { read: false, favorite: false }; }
  chapter(id) { return this.data.chapters[id] || { complete: false, note: '' }; }

  setSetting(key, value) {
    if (key === 'theme' && !['dark', 'light'].includes(value)) throw new Error('Ungültiges Theme.');
    if (key === 'fontScale' && (!Number.isFinite(value) || value < 0.85 || value > 1.3)) throw new Error('Ungültige Schriftgröße.');
    if (key === 'locale' && value !== 'de') throw new Error('Momentan ist nur Deutsch verfügbar.');
    if (key === 'roadmapReducedMotion' && typeof value !== 'boolean') throw new Error('Ungültige Animationseinstellung.');
    if (!['theme', 'fontScale', 'locale', 'roadmapReducedMotion'].includes(key)) throw new Error('Unbekannte Einstellung.');
    this.data.settings[key] = value;
    this.schedule();
    return this.settings();
  }

  setFile(id, patch) {
    const current = this.file(id);
    const points = learningPoints(current, patch);
    const position = Object.hasOwn(patch, 'playbackPosition') ? patch.playbackPosition : current.playbackPosition;
    if (position !== undefined && (!Number.isFinite(position) || position < 0)) throw new Error('Ungültige Videoposition.');
    const next = { ...(position === undefined ? {} : { playbackPosition: position }), read: Boolean(patch.read ?? current.read), favorite: Boolean(patch.favorite ?? current.favorite), learningPoints: points,
      serviceIdea: reflectionText(current, patch, 'serviceIdea', 4000),
      serviceAudience: reflectionText(current, patch, 'serviceAudience', 1000),
      serviceNextStep: reflectionText(current, patch, 'serviceNextStep', 2000) };
    if (!next.read && !next.favorite && !points.length && !next.serviceIdea && !next.serviceAudience && !next.serviceNextStep && !next.playbackPosition) delete this.data.files[id];
    else this.data.files[id] = next;
    this.schedule();
    return next;
  }

  setChapter(id, patch) {
    const current = this.chapter(id);
    const points = learningPoints(current, patch);
    const next = {
      complete: Boolean(patch.complete ?? current.complete),
      note: typeof patch.note === 'string' ? patch.note.slice(0, 8000) : current.note,
      learningPoints: points
    };
    if (!next.complete && !next.note && !points.length) delete this.data.chapters[id];
    else this.data.chapters[id] = next;
    this.schedule();
    return next;
  }

  schedule() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.flush(); }, 250);
  }

  async flush() {
    clearTimeout(this.timer);
    this.timer = null;
    const content = JSON.stringify(this.data, null, 2);
    this.writing = this.writing.catch(() => {}).then(async () => {
      await fs.mkdir(path.dirname(this.filename), { recursive: true });
      const temporary = `${this.filename}.${process.pid}.tmp`;
      await fs.writeFile(temporary, content, { mode: 0o600 });
      await fs.rename(temporary, this.filename);
    });
    return this.writing;
  }
}
module.exports = { Store };
