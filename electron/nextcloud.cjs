const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const { NextcloudClient, normalizePath } = require('./nextcloud-client.cjs');
const { synchronize } = require('./nextcloud-sync.cjs');

class Nextcloud {
  constructor({ store, library, safeStorage, dataDirectory, emit = () => {} }) {
    Object.assign(this, { store, library, safeStorage, dataDirectory, emit });
    this.client = null;
    this.draft = null;
    this.localChoice = null;
    this.controller = null;
    this.runningPromise = null;
    this.timer = null;
    this.state = { running: false, phase: 'idle', error: '', result: null, current: '', completed: 0, total: 0, bytes: 0, size: 0 };
  }
  canSavePassword() {
    return this.safeStorage.isEncryptionAvailable() && (process.platform !== 'linux' || !['basic_text', 'unknown'].includes(this.safeStorage.getSelectedStorageBackend()));
  }
  status() {
    const config = this.store.data.nextcloud;
    return { ...this.state, configured: Boolean(config), authenticated: Boolean(this.client),
      serverUrl: config?.serverUrl || '', username: config?.username || '', remotePath: config?.remotePath || '', localRoot: config?.localRoot || '',
      autoSync: config?.autoSync ?? true, lastSync: config?.lastSync || null,
      canSavePassword: this.canSavePassword(), passwordSaved: Boolean(config?.encryptedPassword) };
  }
  notify(patch = {}) {
    this.state = { ...this.state, ...patch };
    this.emit({ type: 'nextcloud', status: this.status() });
  }
  initialize() {
    const config = this.store.data.nextcloud;
    if (config?.encryptedPassword && this.canSavePassword()) {
      try {
        const password = this.safeStorage.decryptString(Buffer.from(config.encryptedPassword, 'base64'));
        this.client = new NextcloudClient({ ...config, password });
      } catch { this.state.error = 'Bitte erneut bei Nextcloud anmelden.'; }
    }
    this.timer = setInterval(() => {
      if (this.store.data.nextcloud?.autoSync && this.client && !this.state.running && this.library.root === this.store.data.nextcloud.localRoot) this.start();
    }, 5 * 60 * 1000);
    this.timer.unref();
  }
  async login(credentials) {
    if (this.state.running) throw new Error('Bitte zuerst die laufende Synchronisierung stoppen.');
    const client = new NextcloudClient(credentials);
    const listing = await client.folders('');
    this.draft = { client, password: credentials.password, remember: credentials.remember === true };
    this.localChoice = null;
    return listing;
  }
  browse(remotePath) {
    const client = this.draft?.client || this.client;
    if (!client) throw new Error('Bitte zuerst bei Nextcloud anmelden.');
    return client.folders(remotePath);
  }
  async chooseLocal(selected) {
    const real = await fs.realpath(selected);
    if (!(await fs.stat(real)).isDirectory()) throw new Error('Bitte einen lokalen Kursordner auswählen.');
    this.localChoice = real;
    return real;
  }
  async configure({ remotePath, autoSync }) {
    if (this.state.running) throw new Error('Bitte zuerst die laufende Synchronisierung stoppen.');
    const client = this.draft?.client || this.client;
    if (!client) throw new Error('Bitte zuerst bei Nextcloud anmelden.');
    const remote = normalizePath(remotePath);
    await client.folders(remote);
    const localRoot = this.localChoice || this.library.root;
    if (!localRoot) throw new Error('Bitte einen lokalen Kursordner auswählen.');
    if (!(await fs.stat(localRoot)).isDirectory()) throw new Error('Der lokale Kursordner ist nicht erreichbar.');
    let encryptedPassword = '';
    if (this.draft) {
      if (this.draft.remember && this.canSavePassword()) encryptedPassword = this.safeStorage.encryptString(this.draft.password).toString('base64');
    } else encryptedPassword = this.store.data.nextcloud?.encryptedPassword || '';
    this.store.data.nextcloud = { serverUrl: client.serverUrl, username: client.username, remotePath: remote, localRoot,
      autoSync: autoSync === true, encryptedPassword, lastSync: null };
    await this.store.flush();
    this.client = client;
    this.draft = null;
    this.localChoice = null;
    if (this.library.root !== localRoot) await this.library.chooseRoot(localRoot);
    this.start();
    return this.status();
  }
  start() {
    if (this.state.running) return this.status();
    const config = this.store.data.nextcloud;
    if (!config || !this.client) throw new Error('Bitte zuerst bei Nextcloud anmelden und einen Ordner verbinden.');
    if (this.library.root !== config.localRoot) throw new Error('Öffne zuerst den verbundenen lokalen Kursordner oder wähle die Ordner neu aus.');
    const key = crypto.createHash('sha256').update(JSON.stringify([config.serverUrl, config.username, config.remotePath, config.localRoot])).digest('hex');
    const manifestPath = path.join(this.dataDirectory, 'nextcloud', `${key}.json`);
    this.controller = new AbortController();
    this.notify({ running: true, phase: 'scanning', error: '', result: null, current: '', completed: 0, total: 0, bytes: 0, size: 0 });
    this.runningPromise = synchronize({ client: this.client, localRoot: config.localRoot, remotePath: config.remotePath,
      manifestPath, signal: this.controller.signal, onProgress: progress => this.notify(progress) }).then(async result => {
      config.lastSync = new Date().toISOString();
      await this.store.flush();
      this.notify({ result, phase: result.conflicts.length ? 'conflicts' : 'done' });
    }).catch(error => {
      const cancelled = this.controller.signal.aborted;
      this.notify({ phase: cancelled ? 'cancelled' : 'error', error: cancelled ? '' : error.message });
    }).finally(async () => {
      try {
        if (this.library.root === config.localRoot) await this.library.rescan();
      } catch (error) {
        this.notify({ phase: 'error', error: `Kursordner konnte nicht neu eingelesen werden: ${error.message}` });
      } finally {
        this.controller = null;
        this.notify({ running: false, current: '' });
      }
    });
    return this.status();
  }
  cancel() { this.controller?.abort(); return this.status(); }
  async disconnect() {
    this.cancel();
    await this.runningPromise;
    this.store.data.nextcloud = null;
    this.client = null;
    this.draft = null;
    this.localChoice = null;
    await this.store.flush();
    this.notify({ running: false, phase: 'idle', error: '', result: null });
    return this.status();
  }
  async close() { clearInterval(this.timer); this.cancel(); await this.runningPromise; }
}
module.exports = { Nextcloud };
