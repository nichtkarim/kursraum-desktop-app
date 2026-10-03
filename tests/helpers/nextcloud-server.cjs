const http = require('node:http');
const { parseRange } = require('../../electron/range.cjs');
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
async function createServer() {
  let version = 0;
  const entries = new Map([['', { directory: true }]]);
  const calls = [];
  const hooks = {};
  const prefix = '/cloud/remote.php/dav/files/karim/';
  const mkdir = name => {
    const parts = name.split('/').filter(Boolean);
    for (let i = 1; i <= parts.length; i++) entries.set(parts.slice(0, i).join('/'), { directory: true });
  };
  const put = (name, data) => {
    mkdir(name.split('/').slice(0, -1).join('/'));
    entries.set(name, { directory: false, data: Buffer.from(data), etag: `"version-${++version}"`, modified: new Date().toUTCString() });
  };
  const server = http.createServer(async (req, res) => {
    try {
      if (req.headers.authorization !== `Basic ${Buffer.from('karim:app-passwort').toString('base64')}`) { res.writeHead(401).end(); return; }
      if (!req.url.startsWith(prefix)) { res.writeHead(404).end(); return; }
      const name = decodeURIComponent(req.url.slice(prefix.length)).replace(/\/$/, '');
      calls.push({ method: req.method, name, range: req.headers.range });
      const entry = entries.get(name);
      if (req.method === 'PROPFIND') {
        if (!entry) { res.writeHead(404).end(); return; }
        const values = [...entries].filter(([key]) => key === name || (req.headers.depth !== '0' && key.split('/').slice(0, -1).join('/') === name));
        const xml = values.map(([key, value]) => `<d:response><d:href>${escape(prefix + key.split('/').map(encodeURIComponent).join('/') + (value.directory ? '/' : ''))}</d:href><d:propstat><d:prop><d:resourcetype>${value.directory ? '<d:collection/>' : ''}</d:resourcetype><d:getcontentlength>${value.data?.length || 0}</d:getcontentlength><d:getetag>${escape(value.etag || '"folder"')}</d:getetag><d:getlastmodified>${value.modified || new Date().toUTCString()}</d:getlastmodified></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`).join('');
        res.writeHead(207, { 'Content-Type': 'application/xml' }).end(`<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">${xml}</d:multistatus>`);
      } else if (req.method === 'MKCOL') {
        if (entry) { res.writeHead(405).end(); return; }
        mkdir(name); res.writeHead(201).end();
      } else if (req.method === 'PUT') {
        await hooks.beforePut?.(name);
        const current = entries.get(name);
        if ((req.headers['if-none-match'] === '*' && current) || (req.headers['if-match'] && req.headers['if-match'] !== current?.etag)) { res.writeHead(412).end(); req.resume(); return; }
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        put(name, Buffer.concat(chunks));
        res.writeHead(201, { ETag: entries.get(name).etag }).end();
      } else if (req.method === 'GET') {
        await hooks.beforeGet?.(name);
        const current = entries.get(name);
        if (!current) { res.writeHead(404).end(); return; }
        if (req.headers['if-match'] !== current.etag) { res.writeHead(412).end(); return; }
        if (hooks.download) { await hooks.download(name, current, req, res); return; }
        let range;
        try { range = parseRange(req.headers.range, current.data.length); }
        catch { res.writeHead(416, { 'Content-Range': `bytes */${current.data.length}` }).end(); return; }
        if (range) res.writeHead(206, { 'Content-Length': range.end - range.start + 1, 'Content-Range': `bytes ${range.start}-${range.end}/${current.data.length}`, ETag: current.etag }).end(current.data.subarray(range.start, range.end + 1));
        else res.writeHead(200, { 'Content-Length': current.data.length, ETag: current.etag }).end(current.data);
      } else res.writeHead(405).end();
    } catch { if (!res.headersSent) res.writeHead(500); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { serverUrl: `http://127.0.0.1:${server.address().port}/cloud`, entries, calls, hooks, put, mkdir,
    async close() { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
}
module.exports = { createServer };
