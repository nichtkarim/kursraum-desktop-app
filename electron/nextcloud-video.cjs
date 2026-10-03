const path = require('node:path');
const { parseRange } = require('./range.cjs');
const { normalizePath } = require('./nextcloud-client.cjs');
const mime = { '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm', '.ogv': 'video/ogg' };

// Proxy the response body directly: no temporary file and no disk cache.
async function videoResponse({ client, remotePath, file, request, signal }) {
  if (!['GET', 'HEAD'].includes(request.method) || file.kind !== 'video') throw new Error('Ungültige Videoanfrage.');
  const relative = normalizePath(file.relative);
  const remoteName = [normalizePath(remotePath), relative].filter(Boolean).join('/');
  const stat = await client.stat(remoteName, signal);
  if (!stat || stat.directory || !stat.etag) throw new Error('Cloud-Video nicht verfügbar. Bitte die Bibliothek aktualisieren.');
  const headers = new Headers({
    'Content-Type': mime[path.extname(relative).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff', 'Access-Control-Allow-Origin': '*'
  });
  let range;
  try { range = parseRange(request.headers.get('range'), stat.size); }
  catch { headers.set('Content-Range', `bytes */${stat.size}`); return new Response(null, { status: 416, headers }); }
  headers.set('Content-Length', String(range ? range.end - range.start + 1 : stat.size));
  if (range) headers.set('Content-Range', `bytes ${range.start}-${range.end}/${stat.size}`);
  if (request.method === 'HEAD' || stat.size === 0) return new Response(null, { status: range ? 206 : 200, headers });
  const response = await client.request('GET', remoteName, { signal, headers: {
    'If-Match': stat.etag, 'Accept-Encoding': 'identity', ...(range ? { Range: `bytes=${range.start}-${range.end}` } : {})
  } });
  if (response.status === 206) {
    if (!range || response.headers.get('content-range') !== `bytes ${range.start}-${range.end}/${stat.size}`) {
      await response.body?.cancel();
      throw new Error('Nextcloud hat einen ungültigen Videoausschnitt geliefert.');
    }
  } else if (response.status === 200) {
    // HTTP permits a server to ignore Range. Pass a full response as 200, never mislabel it as 206.
    headers.delete('Content-Range');
    headers.set('Content-Length', String(stat.size));
  } else {
    await response.body?.cancel();
    throw new Error('Nextcloud hat keine gültige Videoantwort geliefert.');
  }
  const size = response.headers.get('content-length');
  if (size !== null && size !== headers.get('Content-Length')) {
    await response.body?.cancel();
    throw new Error('Die Größe des Cloud-Videos hat sich geändert. Bitte erneut öffnen.');
  }
  return new Response(response.body, { status: response.status, headers });
}
module.exports = { videoResponse };
