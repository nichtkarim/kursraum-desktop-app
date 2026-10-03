const test = require('node:test');
const assert = require('node:assert/strict');
const graph = import('../src/roadmap/graph.js');

test('Canvas-Aktualisierungen erhalten gemessene Größen und laufende Verschiebungen', async () => {
  const { reconcileNodes } = await graph;
  const measured = { width: 280, height: 340 };
  const previous = [{ id: 'a', measured, position: { x: 42, y: 17 }, dragging: true }, { id: 'deleted' }];
  const next = reconcileNodes(previous, [{ id: 'a', position: { x: 0, y: 0 }, data: { progress: 50 } }, { id: 'new' }]);
  assert.equal(next[0].measured, measured);
  assert.deepEqual(next[0].position, { x: 42, y: 17 });
  assert.equal(next[0].data.progress, 50);
  assert.equal(next.length, 2);
  previous[0].dragging = false;
  assert.deepEqual(reconcileNodes(previous, [{ id: 'a', position: { x: 80, y: 90 } }])[0].position, { x: 80, y: 90 });
});

test('Anordnen respektiert Abhängigkeiten und ausgeklappte Kartenhöhen', async () => {
  const { arrangeNodes } = await graph;
  const nodes = ['a', 'b', 'c', 'd'].map(id => ({ id, position: { x: 0, y: 0 } }));
  const edges = [{ id: 'ac', source: 'a', target: 'c' }, { id: 'bc', source: 'b', target: 'c' }, { id: 'cd', source: 'c', target: 'd' }];
  const result = arrangeNodes(nodes, edges, [{ id: 'a', measured: { height: 560 } }, { id: 'b', measured: { height: 280 } }]);
  const byId = new Map(result.map(node => [node.id, node.position]));
  for (const edge of edges) assert.ok(byId.get(edge.target).x - byId.get(edge.source).x >= 560);
  assert.ok(byId.get('b').y - byId.get('a').y >= 560 + 80);
  assert.deepEqual(nodes[0].position, { x: 0, y: 0 });
});

test('Linien umgehen Zwischenkarten auch bei rückwärts gerichteten Verbindungen', async () => {
  const { routeConnection, roundedPath } = await graph;
  const rectangles = [{ id: 'a', x: 0, y: 0, width: 280, height: 280 }, { id: 'middle', x: 450, y: 0, width: 280, height: 380 }, { id: 'b', x: 950, y: 0, width: 280, height: 280 }];
  for (const backward of [false, true]) {
    const points = routeConnection({ source: backward ? 'b' : 'a', target: backward ? 'a' : 'b', sourceX: backward ? 1230 : 280, sourceY: 140, targetX: backward ? 0 : 950, targetY: 140, rectangles });
    assert.ok(!roundedPath(points).includes('NaN'));
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      for (let t = .01; t < 1; t += .01) {
        const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
        assert.ok(rectangles.every(r => x <= r.x || x >= r.x + r.width || y <= r.y || y >= r.y + r.height), `Line enters a card at ${x}, ${y}`);
      }
    }
  }
});
