export const RoadmapAPI = window.kursraum.roadmaps;
export const newId = () => crypto.randomUUID();
export function allowsConnection(nodes, edges, source, target) {
  if (!source || !target || source === target || !nodes.some(n => n.id === source) || !nodes.some(n => n.id === target) || edges.some(e => e.source === source && e.target === target)) return false;
  const visited = new Set(); const queue = [target];
  while (queue.length) { const id = queue.pop(); if (id === source) return false; if (visited.has(id)) continue; visited.add(id); queue.push(...edges.filter(e => e.source === id).map(e => e.target)); }
  return true;
}
export function cleanRoute(route, edges) {
  const valid = [];
  for (const id of route || []) { if (valid.length && !edges.some(e => e.source === valid.at(-1) && e.target === id)) break; valid.push(id); }
  return valid;
}
