const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const chokidar = require('chokidar');
const { scanTree, fileKind, isInside, relPath } = require('./scanner.cjs');

const collator = new Intl.Collator('de', { numeric: true, sensitivity: 'base' });
const naturalCompare = (a, b) => collator.compare(a, b);
const norm = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('de');
const idFor = (root, kind, relative) => crypto.createHash('sha256').update(`${root}\0${kind}\0${relative}`).digest('hex');

class CourseLibrary {
  constructor(store, emit = () => {}) {
    this.store = store;
    this.emit = emit;
    this.root = null;
    this.dirs = new Set();
    this.files = new Map();
    this.fileById = new Map();
    this.courses = new Map();
    this.watcher = null;
    this.generation = 0;
    this.revision = 0;
    this.scanning = false;
    this.progress = null;
    this.error = null;
    this.pendingEvents = new Map();
    this.queue = Promise.resolve();
    this.rebuildTimer = null;
  }

  async initialize() {
    const saved = this.store.data.root;
    if (!saved) return;
    try {
      const real = await fs.realpath(saved);
      if (!(await fs.stat(real)).isDirectory()) throw new Error('Kein Ordner.');
      this.root = real;
      void this.rescan();
    } catch {
      this.error = 'Der zuletzt ausgewählte Kursordner ist nicht mehr erreichbar. Bitte erneut auswählen.';
      this.emit({ type: 'error', message: this.error });
    }
  }

  async chooseRoot(selected) {
    const real = await fs.realpath(selected);
    if (!(await fs.stat(real)).isDirectory()) throw new Error('Bitte einen Ordner wählen.');
    this.generation++;
    clearTimeout(this.rebuildTimer);
    if (this.watcher) await this.watcher.close();
    this.watcher = null;
    this.root = real;
    this.store.data.root = real;
    await this.store.flush();
    this.dirs = new Set();
    this.files = new Map();
    this.fileById = new Map();
    this.courses = new Map();
    this.error = null;
    this.emitChanged();
    await this.rescan();
    return this.overview();
  }

  emitChanged() {
    this.revision++;
    this.emit({ type: 'changed', revision: this.revision });
  }

  async rescan() {
    if (!this.root) return;
    const token = ++this.generation;
    if (this.watcher) await this.watcher.close();
    if (token !== this.generation) return;
    this.pendingEvents = new Map();
    this.watcher = chokidar.watch(this.root, {
      ignoreInitial: true, followSymlinks: false, ignorePermissionErrors: true,
      awaitWriteFinish: { stabilityThreshold: 350, pollInterval: 100 }
    });
    this.watcher.on('all', (event, absolute) => {
      if (token !== this.generation || !['add', 'change', 'unlink', 'addDir', 'unlinkDir'].includes(event)) return;
      if (this.scanning) this.pendingEvents.set(absolute, event);
      else this.enqueue(event, absolute);
    });
    this.watcher.on('error', error => {
      if (token !== this.generation) return;
      this.error = `Datei-Watcher: ${error.message}`;
      this.emit({ type: 'error', message: this.error });
    });
    this.scanning = true;
    this.error = null;
    this.progress = { files: 0, folders: 0, current: '' };
    this.emit({ type: 'progress', progress: this.progress, scanning: true });
    try {
      const result = await scanTree(this.root, p => {
        if (token === this.generation) {
          this.progress = p;
          this.emit({ type: 'progress', progress: p, scanning: true });
        }
      }, () => token !== this.generation);
      if (token !== this.generation) return;
      this.dirs = result.dirs;
      this.files = result.files;
      await this.rebuildIndex();
      this.scanning = false;
      const events = [...this.pendingEvents];
      this.pendingEvents.clear();
      for (const [absolute, event] of events) this.enqueue(event, absolute);
      this.progress = { files: this.files.size, folders: this.dirs.size, current: '' };
      this.emit({ type: 'progress', progress: this.progress, scanning: false });
      this.emitChanged();
    } catch (error) {
      if (token !== this.generation) return;
      this.scanning = false;
      this.error = `Scan fehlgeschlagen: ${error.message}`;
      this.emit({ type: 'error', message: this.error });
    }
  }

  enqueue(event, absolute) {
    if (path.basename(absolute).startsWith('.kursraum-sync-')) return;
    const token = this.generation;
    this.queue = this.queue.catch(() => {}).then(() => { if (token === this.generation) return this.applyEvent(event, absolute); }).catch(error => {
      this.error = `Dateiaktualisierung fehlgeschlagen: ${error.message}`;
      this.emit({ type: 'error', message: this.error });
    });
  }

  async applyEvent(event, absolute) {
    const rel = relPath(path.relative(this.root, absolute));
    if (!rel || rel === '..' || rel.startsWith('../') || path.isAbsolute(rel)) return;
    if (event === 'unlinkDir') {
      for (const key of this.dirs) if (key === rel || key.startsWith(`${rel}/`)) this.dirs.delete(key);
      for (const key of this.files.keys()) if (key.startsWith(`${rel}/`)) this.files.delete(key);
    } else if (event === 'unlink') {
      this.files.delete(rel);
    } else if (event === 'addDir') {
      const branch = await scanTree(this.root, () => {}, () => false, absolute);
      // A newly added folder may already contain nested material. Merge only its subtree.
      for (const dir of branch.dirs) if (dir === rel || dir.startsWith(`${rel}/`)) this.dirs.add(dir);
      for (const [key, item] of branch.files) if (key.startsWith(`${rel}/`)) this.files.set(key, item);
    } else {
      try {
        const stat = await fs.lstat(absolute);
        const real = await fs.realpath(absolute);
        if (!stat.isFile() || !isInside(this.root, real)) { this.files.delete(rel); }
        else this.files.set(rel, { relative: rel, name: path.basename(absolute), size: stat.size, modified: stat.mtimeMs, kind: fileKind(absolute) });
      } catch (error) {
        if (!['ENOENT', 'EACCES', 'EPERM'].includes(error.code)) throw error;
        this.files.delete(rel);
      }
    }
    clearTimeout(this.rebuildTimer);
    this.rebuildTimer = setTimeout(() => {
      this.queue = this.queue.catch(() => {}).then(async () => {
        await this.rebuildIndex();
        this.emitChanged();
      }).catch(error => this.emit({ type: 'error', message: error.message }));
    }, 180);
  }

  async rebuildIndex() {
    const courses = new Map();
    const byName = new Map();
    const fileById = new Map();
    for (const dir of this.dirs) {
      if (!dir || dir.includes('/')) continue;
      const id = idFor(this.root, 'course', dir);
      const course = { id, name: dir, description: '', coverId: null, fileCount: 0,
        chapters: new Map(), files: [], byChapter: new Map() };
      courses.set(id, course);
      byName.set(dir, course);
    }
    for (const dir of this.dirs) {
      const [top, ...rest] = dir.split('/');
      if (!rest.length) continue;
      const course = byName.get(top);
      if (!course) continue;
      const chapterPath = rest.join('/');
      course.chapters.set(chapterPath, {
        path: chapterPath, name: rest.at(-1), depth: rest.length - 1,
        fileCount: 0, parentPath: rest.slice(0, -1).join('/')
      });
    }
    for (const item of this.files.values()) {
      const [top, ...rest] = item.relative.split('/');
      const course = byName.get(top);
      if (!course || !rest.length) continue;
      const id = idFor(this.root, 'file', item.relative);
      const chapterPath = rest.slice(0, -1).join('/');
      if (!chapterPath && /^description\.md$/i.test(item.name)) {
        if (item.size <= 65536) {
          try {
            const metadataPath = path.join(this.root, ...item.relative.split('/'));
            if (!isInside(this.root, await fs.realpath(metadataPath)) || (await fs.lstat(metadataPath)).isSymbolicLink()) continue;
            const raw = await fs.readFile(metadataPath, 'utf8');
            course.description = raw.replace(/^\s*#{1,6}\s*/gm, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
              .replace(/[*_`>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 260);
          } catch { /* inaccessible metadata is optional */ }
        }
        continue;
      }
      if (!chapterPath && /^cover\.(jpe?g|png|webp)$/i.test(item.name)) { course.coverId = id; fileById.set(id, item); continue; }
      fileById.set(id, item);
      course.files.push({ ...item, id, chapterPath, courseId: course.id });
      course.fileCount++;
      if (!course.byChapter.has(chapterPath)) course.byChapter.set(chapterPath, []);
      course.byChapter.get(chapterPath).push({ ...item, id, chapterPath, courseId: course.id });
      if (chapterPath && course.chapters.has(chapterPath)) course.chapters.get(chapterPath).fileCount++;
    }
    for (const course of courses.values()) {
      course.files.sort((a, b) => naturalCompare(a.relative, b.relative));
      for (const value of course.byChapter.values()) value.sort((a, b) => naturalCompare(a.name, b.name));
    }
    this.courses = courses;
    this.fileById = fileById;
  }

  summary(course) {
    const readCount = course.files.reduce((count, file) => count + Number(this.store.file(file.id).read), 0);
    return { id: course.id, name: course.name, description: course.description,
      coverId: course.coverId, fileCount: course.fileCount, readCount,
      chapterCount: course.chapters.size };
  }

  overview() {
    return { root: this.root, scanning: this.scanning, progress: this.progress,
      error: this.error, revision: this.revision,
      courses: [...this.courses.values()].sort((a, b) => naturalCompare(a.name, b.name)).map(c => this.summary(c)) };
  }

  course(id) {
    const course = this.courses.get(id);
    if (!course) throw new Error('Kurs nicht gefunden.');
    const chapters = [...course.chapters.values()].sort((a, b) => naturalCompare(a.path, b.path));
    if (course.byChapter.has('') || !chapters.length) chapters.unshift({ path: '', name: 'Kursstart', depth: 0, fileCount: (course.byChapter.get('') || []).length, parentPath: '' });
    return { ...this.summary(course), chapters: chapters.map(chapter => ({
      ...chapter, readCount: (course.byChapter.get(chapter.path) || []).filter(file => this.store.file(file.id).read).length, state: this.store.chapter(idFor(this.root, 'chapter', `${id}:${chapter.path}`))
    })) };
  }

  publicFile(file) {
    return { ...file, state: this.store.file(file.id) };
  }

  listFiles(args = {}) {
    const course = this.courses.get(args.courseId);
    if (!course) throw new Error('Kurs nicht gefunden.');
    const chapterPath = typeof args.chapterPath === 'string' ? args.chapterPath : '';
    if (chapterPath && !course.chapters.has(chapterPath)) throw new Error('Kapitel nicht gefunden.');
    let results = course.byChapter.get(chapterPath) || [];
    if (args.favoriteOnly) results = results.filter(file => this.store.file(file.id).favorite);
    if (args.kind && args.kind !== 'all') results = results.filter(file => file.kind === args.kind);
    const page = Math.max(0, Math.min(100000, Number.parseInt(args.page, 10) || 0));
    const pageSize = 60;
    return { total: results.length, page, pageSize, items: results.slice(page * pageSize, (page + 1) * pageSize).map(file => this.publicFile(file)) };
  }

  nextVideo(id) {
    const current = this.fileById.get(id);
    if (!current || current.kind !== 'video') throw new Error('Video nicht gefunden.');
    const course = this.courses.get(idFor(this.root, 'course', current.relative.split('/')[0]));
    if (!course) throw new Error('Kurs nicht gefunden.');
    // Follow the chapter list, with Kursstart first, independently of UI filters/pagination.
    const chapters = ['', ...[...course.chapters.keys()].sort(naturalCompare)];
    let found = false;
    for (const chapter of chapters) {
      for (const file of course.byChapter.get(chapter) || []) {
        if (found && file.kind === 'video') return { ...this.publicFile(file), courseName: course.name };
        if (file.id === id) found = true;
      }
    }
    return null;
  }

  search(args = {}) {
    const query = norm(String(args.query || '').slice(0, 160).trim());
    if (!query) return { total: 0, page: 0, pageSize: 60, items: [] };
    const page = Math.max(0, Math.min(100000, Number.parseInt(args.page, 10) || 0));
    const items = [];
    for (const course of this.courses.values()) {
      if (args.courseId && course.id !== args.courseId) continue;
      for (const file of course.files) {
        if (args.favoriteOnly && !this.store.file(file.id).favorite) continue;
        if (args.kind && args.kind !== 'all' && args.kind !== file.kind) continue;
        if (norm(`${file.name} ${file.chapterPath} ${course.name}`).includes(query)) items.push(file);
      }
    }
    items.sort((a, b) => naturalCompare(`${this.courses.get(a.courseId).name}/${a.relative}`, `${this.courses.get(b.courseId).name}/${b.relative}`));
    return { total: items.length, page, pageSize: 60,
      items: items.slice(page * 60, (page + 1) * 60).map(file => ({ ...this.publicFile(file), courseName: this.courses.get(file.courseId).name })) };
  }

  favorites(args = {}) {
    const page = Math.max(0, Math.min(100000, Number.parseInt(args.page, 10) || 0));
    const items = [];
    for (const course of this.courses.values()) for (const file of course.files) {
      if (this.store.file(file.id).favorite && (!args.kind || args.kind === 'all' || args.kind === file.kind))
        items.push({ ...this.publicFile(file), courseName: course.name });
    }
    items.sort((a, b) => naturalCompare(`${a.courseName}/${a.relative}`, `${b.courseName}/${b.relative}`));
    return { total: items.length, page, pageSize: 60, items: items.slice(page * 60, (page + 1) * 60) };
  }

  setFileState(id, patch = {}) {
    if (!this.fileById.has(id)) throw new Error('Datei nicht gefunden.');
    const state = this.store.setFile(id, patch);
    this.emitChanged();
    return state;
  }

  setChapterState(courseId, chapterPath, patch = {}) {
    const course = this.courses.get(courseId);
    if (!course || (chapterPath !== '' && !course.chapters.has(chapterPath))) throw new Error('Kapitel nicht gefunden.');
    if (typeof patch.note === 'string' && patch.note.length > 8000) throw new Error('Notiz ist zu lang.');
    const state = this.store.setChapter(idFor(this.root, 'chapter', `${courseId}:${chapterPath}`), patch);
    this.emitChanged();
    return state;
  }

  async resolveFile(id) {
    if (typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id)) throw new Error('Ungültige Datei-ID.');
    const file = this.fileById.get(id);
    if (!file || !this.root) throw new Error('Datei nicht gefunden.');
    const absolute = path.join(this.root, ...file.relative.split('/'));
    if (!isInside(this.root, absolute)) throw new Error('Ungültiger Dateipfad.');
    const [real, stat, linkStat] = await Promise.all([fs.realpath(absolute), fs.stat(absolute), fs.lstat(absolute)]);
    if (!isInside(this.root, real) || !stat.isFile() || linkStat.isSymbolicLink()) throw new Error('Dateizugriff verweigert.');
    return { absolute, file, stat };
  }

  async close() {
    this.generation++;
    clearTimeout(this.rebuildTimer);
    if (this.watcher) await this.watcher.close();
  }
}
module.exports = { CourseLibrary, scanTree, isInside, idFor, fileKind, naturalCompare };
