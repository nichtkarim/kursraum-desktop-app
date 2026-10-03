// React Flow's measured dimensions belong to the canvas, not to the saved file.
// Losing them on a save hides nodes until another measurement arrives.
export function reconcileNodes(previous, next) {
  const byId = new Map(previous.map(node => [node.id, node]));
  return next.map(node => {
    const old = byId.get(node.id);
    return old ? { ...old, ...node, position: old.dragging ? old.position : node.position } : node;
  });
}

export function connectionPorts(nodes, edges) {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const ports = new Map(nodes.map(node => [node.id, { incoming: [], outgoing: [] }]));
  for (const edge of edges) {
    ports.get(edge.source)?.outgoing.push(edge);
    ports.get(edge.target)?.incoming.push(edge);
  }
  for (const port of ports.values()) {
    for (const [key, other] of [['incoming', 'source'], ['outgoing', 'target']]) {
      port[key].sort((a, b) => (byId.get(a[other])?.position.y || 0) - (byId.get(b[other])?.position.y || 0) || a.id.localeCompare(b.id));
    }
  }
  return ports;
}

export function arrangeNodes(nodes, edges, measurements = []) {
  const measured = new Map(measurements.map(n => [n.id, n.measured?.height || 280]));
  if (!edges.length) {
    const columns = Math.max(1, Math.ceil(Math.sqrt(nodes.length)));
    const rowHeight = Math.max(280, ...measured.values()) + 80;
    return nodes.map((n, i) => ({ ...n, position: { x: (i % columns) * 500, y: Math.floor(i / columns) * rowHeight } }));
  }
  const ports = connectionPorts(nodes, edges);
  const degree = new Map(nodes.map(n => [n.id, ports.get(n.id).incoming.length]));
  const levels = new Map(nodes.map(n => [n.id, 0]));
  const ready = nodes.filter(n => !degree.get(n.id)).map(n => n.id);
  for (const id of ready) for (const edge of ports.get(id).outgoing) {
    levels.set(edge.target, Math.max(levels.get(edge.target), levels.get(id) + 1));
    degree.set(edge.target, degree.get(edge.target) - 1);
    if (!degree.get(edge.target)) ready.push(edge.target);
  }
  const columns = [];
  for (const node of nodes) (columns[levels.get(node.id)] ||= []).push(node);
  const rank = new Map(nodes.map(n => [n.id, n.position.y]));
  // Barycentric sweeps put connected courses near one another, reducing crossings.
  for (let pass = 0; pass < 4; pass++) {
    const forward = pass % 2 === 0;
    for (const column of forward ? columns : [...columns].reverse()) {
      const score = node => {
        const links = ports.get(node.id)[forward ? 'incoming' : 'outgoing'];
        return links.length ? links.reduce((sum, e) => sum + rank.get(e[forward ? 'source' : 'target']), 0) / links.length : rank.get(node.id);
      };
      column.sort((a, b) => score(a) - score(b));
      column.forEach((node, i) => rank.set(node.id, i));
    }
  }
  const heights = columns.map(col => col.reduce((sum, n) => sum + (measured.get(n.id) || 280) + 80, -80));
  const fullHeight = Math.max(...heights);
  const positions = new Map();
  columns.forEach((column, x) => {
    let y = (fullHeight - heights[x]) / 2;
    for (const node of column) {
      positions.set(node.id, { x: x * 560, y });
      y += (measured.get(node.id) || 280) + 80;
    }
  });
  return nodes.map(node => ({ ...node, position: positions.get(node.id) }));
}

function intersects(a, b, rect) {
  const pad = 12;
  const left = rect.x - pad, right = rect.x + rect.width + pad;
  const top = rect.y - pad, bottom = rect.y + rect.height + pad;
  return a.x === b.x
    ? a.x > left && a.x < right && Math.max(a.y, b.y) > top && Math.min(a.y, b.y) < bottom
    : a.y > top && a.y < bottom && Math.max(a.x, b.x) > left && Math.min(a.x, b.x) < right;
}

// Route through clear horizontal lanes, including around skipped course columns.
export function routeConnection({ source, target, sourceX, sourceY, targetX, targetY, rectangles, sourceLane = 0, targetLane = 0 }) {
  const exit = sourceX + 28 + sourceLane * 12;
  const entry = targetX - 28 - targetLane * 12;
  rectangles = rectangles.filter(rect => rect.x - 12 < Math.max(exit, entry, sourceX, targetX) && rect.x + rect.width + 12 > Math.min(exit, entry, sourceX, targetX));
  const candidates = new Set([sourceY, targetY, (sourceY + targetY) / 2]);
  for (const rect of rectangles) {
    candidates.add(rect.y - 30 - sourceLane * 12);
    candidates.add(rect.y + rect.height + 30 + sourceLane * 12);
  }
  let best, bestScore = Infinity;
  const ordered = [...candidates].sort((a, b) => (Math.abs(a - sourceY) + Math.abs(a - targetY)) - (Math.abs(b - sourceY) + Math.abs(b - targetY)));
  for (const y of ordered) {
    const points = [{ x: sourceX, y: sourceY }, { x: exit, y: sourceY }, { x: exit, y }, { x: entry, y }, { x: entry, y: targetY }, { x: targetX, y: targetY }];
    let collisions = 0, length = 0;
    for (let i = 1; i < points.length; i++) {
      length += Math.abs(points[i].x - points[i - 1].x) + Math.abs(points[i].y - points[i - 1].y);
      if (points[i].x === points[i - 1].x && points[i].y === points[i - 1].y) continue;
      for (const rect of rectangles) {
        if ((i === 1 && rect.id === source) || (i === points.length - 1 && rect.id === target)) continue;
        if (intersects(points[i - 1], points[i], rect)) collisions++;
      }
    }
    const score = collisions * 1e7 + length;
    if (score < bestScore) { bestScore = score; best = points; }
    if (!collisions) break;
  }
  return best.filter((point, i) => !i || point.x !== best[i - 1].x || point.y !== best[i - 1].y);
}

export function roundedPath(points) {
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const previous = points[i - 1], point = points[i], next = points[i + 1];
    const before = Math.hypot(point.x - previous.x, point.y - previous.y);
    const after = Math.hypot(next.x - point.x, next.y - point.y);
    const radius = Math.min(8, before / 2, after / 2);
    path += ` L ${point.x - (point.x - previous.x) / before * radius} ${point.y - (point.y - previous.y) / before * radius}`;
    path += ` Q ${point.x} ${point.y} ${point.x + (next.x - point.x) / after * radius} ${point.y + (next.y - point.y) / after * radius}`;
  }
  return `${path} L ${points.at(-1).x} ${points.at(-1).y}`;
}
