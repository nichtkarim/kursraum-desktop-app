const { DOMParser } = require('@xmldom/xmldom');

const DAV = 'DAV:';
const PROPERTIES = '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/><d:getetag/><d:getcontentlength/><d:getlastmodified/></d:prop></d:propfind>';
function segments(value = '') {
  if (typeof value !== 'string') throw new Error('Ungültiger Ordnerpfad.');
  const parts = value.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  if (parts.some(part => part === '.' || part === '..' || /[\\\x00-\x1f<>:"|?*]/.test(part) || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(part))) {
    throw new Error('Der Ordner enthält einen nicht unterstützten Datei- oder Ordnernamen.');
  }
  return parts;
}
const normalizePath = value => segments(value).join('/');
function normalizeServer(value) {
  let url;
  try { url = new URL(String(value).trim()); } catch { throw new Error('Bitte eine gültige Nextcloud-Adresse eingeben.'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) throw new Error('Bitte eine HTTPS-Adresse für Nextcloud verwenden.');
  if (url.username || url.password || url.search || url.hash) throw new Error('Bitte nur die Nextcloud-Adresse ohne Zugangsdaten oder Zusatzparameter eingeben.');
  url.pathname = url.pathname.replace(/\/+$/, '') + '/';
  return url.href;
}
function parseListing(xml, rootUrl, requestedPath) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Ungültige Nextcloud-Antwort.');
  const errors = [];
  const document = new DOMParser({ errorHandler: { warning: e => errors.push(e), error: e => errors.push(e), fatalError: e => errors.push(e) } }).parseFromString(xml, 'application/xml');
  if (errors.length || document.documentElement?.namespaceURI !== DAV || document.documentElement.localName !== 'multistatus') throw new Error('Der Server hat keine gültige Ordnerliste geliefert.');
  const root = new URL(rootUrl);
  const base = decodeURIComponent(root.pathname).replace(/\/$/, '');
  const requested = normalizePath(requestedPath);
  const result = [];
  const elements = (node, name) => [...Array.from(node.getElementsByTagNameNS(DAV, name))];
  const text = (node, name) => elements(node, name)[0]?.textContent || '';
  for (const response of elements(document, 'response')) {
    const href = new URL(text(response, 'href'), root);
    const decoded = decodeURIComponent(href.pathname).replace(/\/$/, '');
    if (href.origin !== root.origin || (decoded !== base && !decoded.startsWith(`${base}/`))) throw new Error('Der Server hat einen Pfad außerhalb des Nextcloud-Kontos geliefert.');
    const relative = normalizePath(decoded.slice(base.length));
    if (relative !== requested && (relative.split('/').slice(0, -1).join('/') !== requested)) throw new Error('Unerwarteter Pfad in der Nextcloud-Antwort.');
    const properties = elements(response, 'propstat').filter(prop => /\s2\d\d(?:\s|$)/.test(text(prop, 'status')));
    if (!properties.length) continue;
    const property = name => properties.map(prop => text(prop, name)).find(Boolean) || '';
    const directory = properties.some(prop => elements(prop, 'collection').length > 0);
    const size = Number(property('getcontentlength') || 0);
    if (!directory && (!Number.isSafeInteger(size) || size < 0)) throw new Error('Ungültige Dateigröße vom Server.');
    result.push({ path: relative, name: relative.split('/').at(-1) || 'Alle Dateien', directory, size, etag: property('getetag'), modified: Date.parse(property('getlastmodified')) || 0 });
  }
  if (!result.some(entry => entry.path === requested)) throw new Error('Der ausgewählte Ordner ist nicht verfügbar.');
  return result;
}
class NextcloudClient {
  constructor({ serverUrl, username, password }, fetchImpl = fetch) {
    this.serverUrl = normalizeServer(serverUrl);
    this.username = String(username || '').trim();
    if (!this.username || ['.', '..'].includes(this.username) || /[\\/]/.test(this.username) || this.username.includes(':') || /[\x00-\x1f]/.test(this.username) || !password) throw new Error('Benutzername und App-Passwort sind erforderlich.');
    this.rootUrl = new URL(`remote.php/dav/files/${encodeURIComponent(this.username)}/`, this.serverUrl).href;
    this.authorization = `Basic ${Buffer.from(`${this.username}:${password}`).toString('base64')}`;
    this.fetch = fetchImpl;
  }
  url(relative = '') { return this.rootUrl + segments(relative).map(encodeURIComponent).join('/'); }
  async request(method, relative, { signal, headers = {}, body } = {}) {
    const signals = [AbortSignal.timeout(method === 'GET' || method === 'PUT' ? 30 * 60 * 1000 : 60000)];
    if (signal) signals.push(signal);
    let response;
    try {
      response = await this.fetch(this.url(relative), { method, redirect: 'manual', signal: AbortSignal.any(signals), headers: { Authorization: this.authorization, ...headers }, body, ...(body && typeof body !== 'string' ? { duplex: 'half' } : {}) });
    } catch (error) {
      if (signal?.aborted) throw new Error('Synchronisierung abgebrochen.');
      throw new Error(error.name === 'TimeoutError' ? 'Nextcloud antwortet zu langsam. Bitte erneut versuchen.' : 'Nextcloud ist nicht erreichbar. Prüfe Adresse, Internetverbindung und Zertifikat.');
    }
    if (!response.ok) {
      await response.body?.cancel();
      const messages = { 401: 'Anmeldung fehlgeschlagen. Prüfe Benutzername und App-Passwort.', 403: 'Keine Berechtigung für diesen Nextcloud-Ordner.', 404: 'Datei oder Ordner in Nextcloud nicht gefunden.', 409: 'Der Zielordner wurde verändert. Bitte erneut synchronisieren.', 412: 'Die Datei wurde inzwischen geändert. Bitte erneut synchronisieren.', 413: 'Die Datei überschreitet das Upload-Limit deines Nextcloud-Servers.', 423: 'Die Datei ist in Nextcloud gesperrt. Bitte später erneut versuchen.', 507: 'In Nextcloud ist nicht genügend Speicherplatz verfügbar.' };
      throw new Error(messages[response.status] || (response.status >= 300 && response.status < 400 ? 'Nextcloud leitet auf eine andere Adresse um. Bitte die endgültige HTTPS-Adresse eingeben.' : `Nextcloud-Anfrage fehlgeschlagen (HTTP ${response.status}).`));
    }
    return response;
  }
  async list(relative = '', { signal, depth = 1 } = {}) {
    const response = await this.request('PROPFIND', relative, { signal, headers: { Depth: String(depth), 'Content-Type': 'application/xml; charset=utf-8' }, body: PROPERTIES });
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const item = await reader.read();
        if (item.done) break;
        size += item.value.byteLength;
        if (size > 16 * 1024 * 1024) throw new Error('Die Ordnerliste ist zu groß. Wähle einen kleineren Kursordner.');
        chunks.push(Buffer.from(item.value));
      }
    } finally { await reader.cancel(); }
    return parseListing(Buffer.concat(chunks).toString('utf8'), this.rootUrl, relative);
  }
  async stat(relative, signal) { return (await this.list(relative, { signal, depth: 0 })).find(entry => entry.path === normalizePath(relative)); }
  async folders(relative = '') {
    const current = normalizePath(relative);
    const entries = await this.list(current);
    if (!entries.find(entry => entry.path === current)?.directory) throw new Error('Bitte einen Ordner auswählen.');
    return { path: current, folders: entries.filter(entry => entry.path !== current && entry.directory && !entry.name.startsWith('.')).sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true })) };
  }
}
module.exports = { NextcloudClient, normalizeServer, normalizePath, parseListing };
