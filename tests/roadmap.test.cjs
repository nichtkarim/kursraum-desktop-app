const test = require('node:test');
const assert = require('node:assert/strict');
const { RoadmapManager, sanitize, topological } = require('../electron/roadmap-manager.cjs');
const id = n => n.toString(16).padStart(64, '0');
function fixture() {
  let saved = {};
  const storage = { get: () => structuredClone(saved), set: (_key, value) => { saved = structuredClone(value); } };
  const courses = [1,2,3,4].map(n => ({ id: id(n), name: `Kurs ${n}`, fileCount: 4, readCount: n === 1 ? 4 : 0 }));
  const library = { overview: () => ({ courses }), course: value => { const c = courses.find(c => c.id === value); if (!c) throw new Error('Kurs nicht gefunden'); return { ...c, chapters: [] }; } };
  const manager = new RoadmapManager(storage, library);
  return { manager, storage, library, courses };
}
test('Roadmaps erstellen, umbenennen, getrennt speichern/laden und löschen', () => {
  const { manager, storage, library } = fixture();
  const first = manager.create({ title: 'Lernpfad', courseIds: [id(1), id(2)] });
  const other = manager.create({ title: 'Anderer Pfad', courseIds: [id(3)] });
  const saved = manager.save({ ...first, title: 'Umbenannt', nodes: first.nodes.map((n,i) => ({ ...n, position: { x: i*400, y: 120 }, notes: 'Testnotiz' })) });
  const reloaded = new RoadmapManager(storage, library);
  assert.equal(reloaded.get(saved.id).title, 'Umbenannt');
  assert.equal(reloaded.get(saved.id).nodes[1].position.x, 400);
  assert.equal(reloaded.get(saved.id).nodes[0].notes, 'Testnotiz');
  assert.throws(() => manager.save(first), /bereits geändert/);
  reloaded.delete(saved.id); assert.equal(reloaded.list().length, 1); assert.equal(reloaded.get(other.id).title, 'Anderer Pfad');
});
test('Fortschritt und Abhängigkeiten bestimmen den nächsten Schritt live', () => {
  const { manager, courses } = fixture();
  let r = manager.create({ title: 'Pfad', courseIds: [id(1),id(2),id(3)] });
  r = manager.save({ ...r, edges: [{ id:'a', source:r.nodes[0].id, target:r.nodes[1].id },{ id:'b', source:r.nodes[1].id, target:r.nodes[2].id }] });
  assert.equal(r.recommended, r.nodes[1].id);
  courses[1].readCount = 4;
  assert.equal(manager.get(r.id).recommended, r.nodes[2].id);
  courses[1].name = 'Neuer Titel'; assert.equal(manager.get(r.id).statuses[1].course.name, 'Neuer Titel');
  courses[1].id = id(20); assert.equal(manager.get(r.id).statuses[1].course, null);
  r = manager.save({ ...manager.get(r.id), nodes: r.nodes.map((n,i) => i===1 ? {...n,courseId:id(20)} : n) });
  assert.equal(r.nodes[1].courseName,'Neuer Titel');
});
test('Kreise, doppelte Verbindungen, fremde Endpunkte und ungültige Pfade werden abgewiesen', () => {
  const { manager } = fixture(); const r = manager.create({ title:'Test',courseIds:[id(1),id(2)] });
  const [a,b]=r.nodes;
  assert.throws(() => manager.save({...r,edges:[{id:'a',source:a.id,target:b.id},{id:'b',source:b.id,target:a.id}]}),/Kreis/);
  assert.throws(() => manager.save({...r,edges:[{id:'a',source:a.id,target:'missing'}]}),/unbekannten/);
  assert.throws(() => manager.save({...r,edges:[{id:'a',source:a.id,target:b.id},{id:'b',source:a.id,target:b.id}]}),/bereits/);
  assert.throws(() => manager.save({...r,route:[a.id,b.id]}),/verbunden/);
  assert.equal(manager.get(r.id).revision,1);
});
test('Portable Exporte enthalten keine internen Pfade/IDs; Import ordnet anhand der Namen zu', () => {
  const { manager } = fixture(); let r=manager.create({title:'Export',courseIds:[id(1),id(2)]});
  r=manager.save({...r,root:'/private/secret',nodes:r.nodes.map(n=>({...n,absolute:'/private/secret/video.mp4',coverUrl:'file:///private/image'})),edges:[{id:'link',source:r.nodes[0].id,target:r.nodes[1].id}]});
  const exported=manager.export(r.id);const json=JSON.stringify(exported);
  assert.ok(!json.includes('/private'));assert.ok(!json.includes('courseId'));assert.ok(!json.includes(id(1)));
  const copy=manager.import(exported); assert.notEqual(copy.id,r.id);assert.equal(copy.nodes[0].courseId,id(1));
  exported.nodes[0].courseName='Nicht vorhanden'; assert.equal(manager.import(exported).nodes[0].courseId,'');
  assert.throws(()=>manager.import({...exported,schemaVersion:99}),/Nicht unterstützt/);
});
test('Öffnen einer Lernstation löst den vorhandenen Kurs auf und lehnt fehlende Zuordnungen ab', () => {
  const {manager}=fixture();const r=manager.create({title:'Öffnen',courseIds:[id(2)]});
  assert.equal(manager.resolve(r.id,r.nodes[0].id).id,id(2));
  assert.throws(()=>manager.resolve(r.id,'unknown'),/Knoten/);
  const missing=manager.save({...r,nodes:r.nodes.map(n=>({...n,courseId:''}))});
  assert.throws(()=>manager.resolve(missing.id,missing.nodes[0].id),/Kurs/);
});
test('Checkpoints, Startdaten und Pflichtstationen beeinflussen Empfehlungen ohne Dateistatus zu verändern',()=>{
 const {manager,courses}=fixture();let r=manager.create({title:'Meta',courseIds:[id(2),id(3)]});
 r=manager.save({...r,nodes:r.nodes.map((n,i)=>({...n,startDate:i===0?'2999-01-01':'',milestone:true}))});assert.equal(r.recommended,r.nodes[1].id);
 r=manager.save({...r,nodes:r.nodes.map(n=>({...n,checkpoint:true}))});assert.equal(r.recommended,null);assert.equal(courses[1].readCount,0);
});
test('Und, Oder und Entweder oder steuern Voraussetzungen und bleiben beim Export erhalten', () => {
  const { manager, courses } = fixture();
  let roadmap = manager.create({ title: 'Alternativen', courseIds: [id(1), id(2), id(3)] });
  const [first, second, target] = roadmap.nodes;
  const edges = [{ id: 'first', source: first.id, target: target.id }, { id: 'second', source: second.id, target: target.id }];
  const nodes = roadmap.nodes.map(n => n.id === second.id ? { ...n, startDate: '2999-01-01' } : n);
  roadmap = manager.save({ ...roadmap, nodes, edges });
  assert.equal(roadmap.nodes[2].prerequisiteMode, 'and');
  assert.equal(roadmap.recommended, null);

  roadmap = manager.save({ ...roadmap, nodes: roadmap.nodes.map(n => n.id === target.id ? { ...n, prerequisiteMode: 'or' } : n) });
  assert.equal(roadmap.recommended, target.id);
  roadmap = manager.save({ ...roadmap, nodes: roadmap.nodes.map(n => n.id === target.id ? { ...n, prerequisiteMode: 'xor', prerequisiteChoice: '' } : n) });
  assert.equal(roadmap.recommended, null);
  roadmap = manager.save({ ...roadmap, nodes: roadmap.nodes.map(n => n.id === target.id ? { ...n, prerequisiteChoice: first.id } : n) });
  assert.equal(roadmap.recommended, target.id);
  roadmap = manager.save({ ...roadmap, nodes: roadmap.nodes.map(n => n.id === target.id ? { ...n, prerequisiteChoice: second.id } : n) });
  assert.equal(roadmap.recommended, null);
  courses[1].readCount = 4;
  assert.equal(manager.get(roadmap.id).recommended, target.id);
  const exported = manager.export(roadmap.id);
  const imported = manager.import(exported);
  assert.equal(imported.nodes[2].prerequisiteMode, 'xor');
  assert.equal(imported.nodes[2].prerequisiteChoice, second.id);
  assert.throws(() => manager.save({ ...roadmap, nodes: roadmap.nodes.map(n => n.id === target.id ? { ...n, prerequisiteChoice: 'unknown' } : n) }), /gewählte Alternative/);
});

test('500 Knoten werden validiert, sortiert und über 500 abgewiesen',()=>{
 const nodes=Array.from({length:500},(_,i)=>({id:`n${i}`,courseName:`Kurs ${i}`,position:{x:i*10,y:0}}));
 const edges=nodes.slice(1).map((n,i)=>({id:`e${i}`,source:nodes[i].id,target:n.id}));
 const start=performance.now();const result=sanitize({title:'Großer Graph',nodes,edges});assert.equal(topological(result.nodes,result.edges).length,500);assert.ok(performance.now()-start<1000);
 assert.throws(()=>sanitize({title:'Zu groß',nodes:[...nodes,{id:'extra'}],edges:[]}),/zu groß/);
});
