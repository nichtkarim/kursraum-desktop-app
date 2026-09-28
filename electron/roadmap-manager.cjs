const { randomUUID } = require('node:crypto');
const MAX_NODES = 500;
const MAX_BYTES = 2 * 1024 * 1024;
const clone = value => structuredClone(value);
const text = (value, max = 200) => typeof value === 'string' ? value.slice(0, max).trim() : '';
const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
const coordinate = value => Number.isFinite(value) ? Math.max(-100000, Math.min(100000, value)) : 0;

function topological(nodes, edges) {
  const incoming = new Map(nodes.map(n => [n.id, 0]));
  const outgoing = new Map(nodes.map(n => [n.id, []]));
  for (const edge of edges) {
    if (!incoming.has(edge.source) || !incoming.has(edge.target)) throw new Error('Verbindung verweist auf einen unbekannten Knoten.');
    incoming.set(edge.target, incoming.get(edge.target) + 1);
    outgoing.get(edge.source).push(edge.target);
  }
  const ready = nodes.filter(n => incoming.get(n.id) === 0).map(n => n.id);
  const result = [];
  for (let i = 0; i < ready.length; i++) {
    const id = ready[i]; result.push(id);
    for (const next of outgoing.get(id)) {
      incoming.set(next, incoming.get(next) - 1);
      if (!incoming.get(next)) ready.push(next);
    }
  }
  if (result.length !== nodes.length) throw new Error('Diese Verbindung erzeugt einen Kreis. Lernpfade brauchen eine eindeutige Richtung.');
  return result;
}

function sanitize(input) {
  if (!input || typeof input !== 'object' || !Array.isArray(input.nodes) || !Array.isArray(input.edges)) throw new Error('Ungültige Roadmap.');
  if (Buffer.byteLength(JSON.stringify(input)) > MAX_BYTES || input.nodes.length > MAX_NODES || input.edges.length > 2000) throw new Error('Roadmap zu groß (maximal 500 Knoten, 2000 Verbindungen, 2 MB).');
  const title = text(input.title, 120);
  if (!title) throw new Error('Bitte einen Namen für die Roadmap eingeben.');
  const ids = new Set();
  const nodes = input.nodes.map(node => {
    if (!node || !validId(node.id) || ids.has(node.id)) throw new Error('Ungültige oder doppelte Knoten-ID.');
    ids.add(node.id);
    const startDate = text(node.startDate, 10);
    if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new Error('Ungültiges Startdatum.');
    return { id: node.id, courseId: typeof node.courseId === 'string' && /^[a-f0-9]{64}$/.test(node.courseId) ? node.courseId : '',
      courseName: text(node.courseName), position: { x: coordinate(node.position?.x), y: coordinate(node.position?.y) },
      goal: text(node.goal, 1500), notes: text(node.notes, 8000), duration: Number.isFinite(node.duration) ? Math.max(0, Math.min(100000, Math.round(node.duration))) : 0,
      required: node.required !== false, milestone: node.milestone === true, checkpoint: node.checkpoint === true, startDate, expanded: node.expanded === true };
  });
  const edgeIds = new Set(); const pairs = new Set();
  const edges = input.edges.map(edge => {
    if (!edge || !validId(edge.id) || edgeIds.has(edge.id) || edge.source === edge.target) throw new Error('Ungültige Verbindung.');
    const pair = `${edge.source}:${edge.target}`;
    if (pairs.has(pair)) throw new Error('Diese Verbindung besteht bereits.');
    edgeIds.add(edge.id); pairs.add(pair);
    return { id: edge.id, source: edge.source, target: edge.target, label: text(edge.label, 150) };
  });
  topological(nodes, edges);
  const route = Array.isArray(input.route) ? input.route.filter(id => ids.has(id)) : [];
  if (new Set(route).size !== route.length || route.some((id, i) => i && !pairs.has(`${route[i - 1]}:${id}`))) throw new Error('Der markierte Pfad muss verbunden sein.');
  return { title, nodes, edges, route, viewport: { x: coordinate(input.viewport?.x), y: coordinate(input.viewport?.y), zoom: Number.isFinite(input.viewport?.zoom) ? Math.max(.15, Math.min(2, input.viewport.zoom)) : 1 } };
}

function describe(record, library) {
  const courses = new Map(library.overview().courses.map(c => [c.id, c]));
  const statuses = record.nodes.map(node => {
    const course = courses.get(node.courseId);
    const progress = course?.fileCount ? Math.round(course.readCount * 100 / course.fileCount) : 0;
    return { id: node.id, course: course || null, progress, complete: Boolean(course && ((course.fileCount > 0 && course.readCount === course.fileCount) || node.checkpoint)) };
  });
  const byId = new Map(statuses.map(n => [n.id, n]));
  const prerequisites = new Map(record.nodes.map(n => [n.id, []]));
  for (const e of record.edges) prerequisites.get(e.target).push(e.source);
  const order = topological(record.nodes, record.edges);
  const nodesById = new Map(record.nodes.map(n => [n.id, n]));
  const date = new Date();
  const today = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const available = id => { const item = byId.get(id); const node = nodesById.get(id); return item.course && !item.complete && (!node.startDate || node.startDate <= today) && prerequisites.get(id).every(parent => byId.get(parent).complete); };
  const recommended = order.find(id => nodesById.get(id).required && available(id)) || order.find(available) || null;
  return { statuses, recommended, order };
}

class RoadmapManager {
  constructor(storage, library, emit = () => {}) { this.storage = storage; this.library = library; this.emit = emit; }
  records() { return this.storage.get('roadmaps', {}); }
  raw(id) { if (!validId(id) || !Object.hasOwn(this.records(), id)) throw new Error('Roadmap nicht gefunden.'); return clone(this.records()[id]); }
  list() { return Object.values(this.records()).map(r => ({ id: r.id, title: r.title, count: r.nodes.length, updatedAt: r.updatedAt })).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); }
  get(id) { const record = this.raw(id); return { ...record, ...describe(record, this.library) }; }
  put(record) { const records = this.records(); records[record.id] = record; this.storage.set('roadmaps', records); this.emit({ type: 'roadmap', id: record.id }); return this.get(record.id); }
  create({ title, courseIds = [] } = {}) {
    if (!Array.isArray(courseIds) || courseIds.length > MAX_NODES) throw new Error('Ungültige Kursauswahl.');
    if (this.list().length >= 200) throw new Error('Maximal 200 Roadmaps möglich.');
    const courses = new Map(this.library.overview().courses.map(c => [c.id, c]));
    const nodes = [...new Set(courseIds)].map((id, i) => {
      const course = courses.get(id); if (!course) throw new Error('Kurs nicht gefunden.');
      return { id: randomUUID(), courseId: id, courseName: course.name, position: { x: (i % 4) * 340, y: Math.floor(i / 4) * 320 } };
    });
    const clean = sanitize({ title, nodes, edges: [], route: [] });
    const now = new Date().toISOString();
    return this.put({ ...clean, schemaVersion: 1, id: randomUUID(), revision: 1, createdAt: now, updatedAt: now });
  }
  save(input) {
    const current = this.raw(input?.id);
    if (input.revision !== current.revision) throw new Error('Die Roadmap wurde bereits geändert. Bitte neu laden.');
    const clean = sanitize(input);
    const courses = new Map(this.library.overview().courses.map(c => [c.id, c]));
    for (const node of clean.nodes) { if (courses.has(node.courseId)) node.courseName = courses.get(node.courseId).name; }
    return this.put({ ...clean, schemaVersion: 1, id: current.id, revision: current.revision + 1, createdAt: current.createdAt, updatedAt: new Date().toISOString() });
  }
  delete(id) { this.raw(id); const records = this.records(); delete records[id]; this.storage.set('roadmaps', records); this.emit({ type: 'roadmap', id }); return true; }
  export(id) {
    const record = this.raw(id);
    // Portable names only. Never export library roots, file paths, IDs derived from paths or cover URLs.
    const clean = sanitize(record);
    return { format: 'kursraum-roadmap', schemaVersion: 1, ...clean, nodes: clean.nodes.map(({ courseId, ...node }) => node) };
  }
  import(data) {
    if (data?.format !== 'kursraum-roadmap' || data.schemaVersion !== 1) throw new Error('Nicht unterstützte Roadmap-Datei.');
    const clean = sanitize(data);
    if (this.list().length >= 200) throw new Error('Maximal 200 Roadmaps möglich.');
    const courses = this.library.overview().courses;
    for (const node of clean.nodes) { const matches = courses.filter(c => c.name === node.courseName); node.courseId = matches.length === 1 ? matches[0].id : ''; }
    const now = new Date().toISOString();
    return this.put({ ...clean, schemaVersion: 1, id: randomUUID(), revision: 1, createdAt: now, updatedAt: now });
  }
  resolve(id, nodeId) {
    const node = this.raw(id).nodes.find(n => n.id === nodeId);
    if (!node) throw new Error('Knoten nicht gefunden.');
    return this.library.course(node.courseId);
  }
}
module.exports = { RoadmapManager, sanitize, topological, describe, MAX_BYTES };
