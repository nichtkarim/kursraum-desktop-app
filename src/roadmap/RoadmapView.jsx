import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ReactFlow, Background, Controls, MiniMap, applyNodeChanges, applyEdgeChanges, MarkerType } from '@xyflow/react';
import { Plus, Upload, Download, Route, Trash2, X, Play, Flag, CheckCircle2, LayoutGrid, ArrowRight, Save, Settings2 } from 'lucide-react';
import '@xyflow/react/dist/style.css';
import './roadmap.css';
import CourseNode from './CourseNode.jsx';
import { RoadmapAPI as api, newId, allowsConnection, cleanRoute } from './RoadmapAPI.js';

const nodeTypes = { course: CourseNode };
function RoadmapDialog({ onClose, children, label }) {
  const ref = useRef(null);
  useEffect(() => { const element = ref.current; element.showModal(); return () => element.close(); }, []);
  return <dialog ref={ref} className="roadmap-modal-backdrop" aria-label={label} onCancel={e => { e.preventDefault(); onClose(); }}>{children}</dialog>;
}

const labels = { 'controls.zoomIn.ariaLabel': 'Vergrößern', 'controls.zoomOut.ariaLabel': 'Verkleinern', 'controls.fitView.ariaLabel': 'Alles anzeigen', 'controls.interactive.ariaLabel': 'Bearbeitung umschalten', 'minimap.ariaLabel': 'Roadmap-Übersicht', 'node.a11yDescription.default': 'Mit Enter Kurs öffnen. Mit Pfeiltasten verschieben. Eigenschaften über den Knotenknopf öffnen.' };

export default function RoadmapView({ courses, revision, settings, onSetting, activeId, onActiveId, onOpenCourse, onStartPath }) {
  const [maps, setMaps] = useState([]);
  const [draft, setDraft] = useState(null);
  const current = useRef(null);
  const saveRevision = useRef(new Map());
  const queue = useRef(Promise.resolve());
  const generation = useRef(0);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const failed = useRef(false);
  const [inspected, setInspected] = useState(null);
  const [selectedEdge, setSelectedEdge] = useState(null);
  const [picker, setPicker] = useState(null);
  const [picked, setPicked] = useState([]);
  const [name, setName] = useState('Mein Lernpfad');
  const [filter, setFilter] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [marking, setMarking] = useState(false);
  const [compact, setCompact] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [chapterData, setChapterData] = useState({});
  const [flowNodes, setFlowNodes] = useState([]);
  const [flowEdges, setFlowEdges] = useState([]);
  const flow = useRef(null);
  const [systemReduced, setSystemReduced] = useState(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const reduced = settings.roadmapReducedMotion || systemReduced;
  const draftRef = current;

  useEffect(() => { const mq = window.matchMedia('(prefers-reduced-motion: reduce)'); const change = () => setSystemReduced(mq.matches); mq.addEventListener('change', change); return () => mq.removeEventListener('change', change); }, []);
  const refreshList = useCallback(() => api.list().then(setMaps).catch(e => setError(e.message)), []);
  useEffect(() => { refreshList(); const off = window.kursraum.onEvent(e => { if (e.type === 'roadmap') refreshList(); }); return off; }, [refreshList]);
  const install = useCallback(value => { current.current = value; saveRevision.current.set(value.id, value.revision); failed.current = false; setDraft(value); setInspected(null); setSelectedEdge(null); setChapterData({}); setError(''); setStatus('Gespeichert'); setCompact(value.nodes.length > 80); }, []);
  useEffect(() => {
    const token = ++generation.current; current.current = null; setDraft(null);
    if (!activeId) return;
    api.get(activeId).then(value => { if (token === generation.current) install(value); }).catch(e => { if (token === generation.current) setError(e.message); });
    return () => { generation.current++; };
  }, [activeId, install]);
  useEffect(() => {
    if (!activeId) return;
    let alive = true;
    api.get(activeId).then(value => {
      if (!alive || current.current?.id !== value.id) return;
      const next = { ...current.current, statuses: value.statuses, recommended: value.recommended, order: value.order };
      current.current = next; setDraft(next); setChapterData({});
    }).catch(e => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [activeId, revision]);

  const persist = useCallback(value => {
    const token = generation.current;
    setSaving(true); setStatus('Wird gespeichert …');
    queue.current = queue.current.catch(() => {}).then(async () => {
      try {
        const saved = await api.save({ ...value, revision: saveRevision.current.get(value.id) ?? value.revision });
        saveRevision.current.set(value.id, saved.revision);
        if (token !== generation.current) return;
        failed.current = false;
        setStatus('Gespeichert');
        if (current.current === value) { current.current = saved; setDraft(saved); }
      } catch (e) { failed.current = true; setError(e.message); setStatus('Nicht gespeichert'); }
    });
    const pending = queue.current;
    void pending.finally(() => { if (queue.current === pending) setSaving(false); });
    return pending;
  }, []);
  const change = useCallback((updater, save = true) => {
    if (!current.current) return;
    const next = updater(current.current); current.current = next; setDraft(next);
    if (save) return persist(next);
  }, [persist]);
  const flush = useCallback(async () => { if (current.current) await persist(current.current); await queue.current; return !failed.current; }, [persist]);
  const switchMap = async id => { if (await flush()) onActiveId(id || null); };
  const open = useCallback(async (id, chapter) => {
    if (marking && chapter === undefined) {
      change(d => {
        if (d.route.includes(id)) return { ...d, route: d.route.slice(0, d.route.indexOf(id)) };
        if (d.route.length && !d.edges.some(e => e.source === d.route.at(-1) && e.target === id)) { setError('Wähle einen direkt verbundenen Folgekurs oder leere den markierten Pfad.'); return d; }
        return { ...d, route: [...d.route, id] };
      }); return;
    }
    if (!await flush()) return;
    try { const course = await api.resolve(current.current.id, id); onOpenCourse(course.id, chapter); }
    catch (e) { setError(e.message); setInspected(id); }
  }, [marking, change, flush, onOpenCourse]);
  const inspect = useCallback(id => { setInspected(id); setSelectedEdge(null); }, []);
  const expand = useCallback(id => change(d => ({ ...d, nodes: d.nodes.map(n => n.id === id ? { ...n, expanded: !n.expanded } : n) })), [change]);
  useEffect(() => {
    if (!draft) return;
    let alive = true;
    for (const node of draft.nodes.filter(n => n.expanded && n.courseId && !chapterData[n.courseId])) {
      window.kursraum.course(node.courseId).then(course => { if (alive) setChapterData(prev => ({ ...prev, [node.courseId]: course.chapters })); }).catch(e => { if (alive) setError(e.message); });
    }
    return () => { alive = false; };
  }, [draft, chapterData]);
  const coursesById = useMemo(() => new Map(courses.map(c => [c.id, c])), [courses]);
  const statuses = useMemo(() => new Map((draft?.statuses || []).map(s => [s.id, s])), [draft?.statuses]);
  useEffect(() => {
    if (!draft) { setFlowNodes([]); setFlowEdges([]); return; }
    setFlowNodes(draft.nodes.map(node => ({ id: node.id, type: 'course', position: node.position, selected: inspected === node.id, dragHandle: '.roadmap-node-grip',
      ariaLabel: `${coursesById.get(node.courseId)?.name || node.courseName}, Kurs`,
      data: { node, course: coursesById.get(node.courseId), progress: statuses.get(node.id)?.progress || 0, complete: statuses.get(node.id)?.complete,
        recommended: draft.recommended === node.id, inRoute: draft.route.includes(node.id), removing: removing === node.id, compact, chapters: chapterData[node.courseId], open, inspect, expand } })));
    setFlowEdges(draft.edges.map(e => ({ ...e, selected: selectedEdge === e.id, type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed },
      animated: !reduced && draft.route.some((id, i) => id === e.source && draft.route[i + 1] === e.target),
      style: { stroke: draft.route.some((id, i) => id === e.source && draft.route[i + 1] === e.target) ? '#a7a0ff' : undefined, strokeWidth: 2 } })));
  }, [draft, coursesById, statuses, inspected, selectedEdge, compact, chapterData, open, inspect, expand, reduced, removing]);

  const connect = useCallback(connection => {
    const d = draftRef.current;
    if (!allowsConnection(d.nodes, d.edges, connection.source, connection.target)) { setError('Diese Verbindung ist doppelt oder würde einen Kreis erzeugen.'); return; }
    change(value => ({ ...value, edges: [...value.edges, { id: newId(), source: connection.source, target: connection.target, label: '' }] }));
  }, [change]);
  const removeEdge = id => { change(d => { const edges = d.edges.filter(e => e.id !== id); return { ...d, edges, route: cleanRoute(d.route, edges) }; }); setSelectedEdge(null); };
  const removeNode = id => { const mapId = current.current.id; setRemoving(id); setTimeout(() => { if (current.current?.id !== mapId) return; change(d => { const nodes = d.nodes.filter(n => n.id !== id); const edges = d.edges.filter(e => e.source !== id && e.target !== id); return { ...d, nodes, edges, route: cleanRoute(d.route.filter(n => n !== id), edges) }; }); setInspected(null); setRemoving(null); }, reduced ? 0 : 160); };
  const patchNode = (id, patch, save = true) => change(d => ({ ...d, nodes: d.nodes.map(n => n.id === id ? { ...n, ...patch } : n) }), save);
  const addCourses = async event => {
    event.preventDefault(); setError('');
    try {
      if (picker === 'create') { if (!await flush()) return; const result = await api.create({ title: name, courseIds: picked }); onActiveId(result.id); }
      else change(d => ({ ...d, nodes: [...d.nodes, ...picked.filter(id => !d.nodes.some(n => n.courseId === id)).map((id, i) => ({ id: newId(), courseId: id, courseName: coursesById.get(id).name, position: { x: ((d.nodes.length + i) % 4) * 340, y: Math.floor((d.nodes.length + i) / 4) * 320 }, required: true, duration: 0, goal: '', notes: '' }))] }));
      setPicker(null); setPicked([]);
    } catch (e) { setError(e.message); }
  };
  const autoLayout = () => {
    const d = draftRef.current;
    if (!d.edges.length) { const columns = Math.max(1, Math.ceil(Math.sqrt(d.nodes.length))); change(value => ({ ...value, nodes: value.nodes.map((n, i) => ({ ...n, position: { x: (i % columns) * 340, y: Math.floor(i / columns) * 340 } })) })); setTimeout(() => flow.current?.fitView({ padding: .15, duration: reduced ? 0 : 350 }), 60); return; }
    const levels = new Map(d.nodes.map(n => [n.id, 0]));
    for (let i = 0; i < d.nodes.length; i++) for (const e of d.edges) levels.set(e.target, Math.max(levels.get(e.target), levels.get(e.source) + 1));
    const rows = new Map(); change(value => ({ ...value, nodes: value.nodes.map(n => { const level = levels.get(n.id); const row = rows.get(level) || 0; rows.set(level, row + 1); return { ...n, position: { x: level * 360, y: row * 360 } }; }) }));
    setTimeout(() => flow.current?.fitView({ padding: .15, duration: reduced ? 0 : 350 }), 60);
  };
  const startPath = async () => {
    if (!await flush()) return;
    const d = current.current; const path = d.route.length ? d.route : d.order;
    const nodes = path.map(id => d.nodes.find(n => n.id === id)).filter(Boolean);
    if (!nodes.length) return;
    if (nodes.some(n => !coursesById.has(n.courseId))) { setError('Bitte fehlende Kurse zuerst neu zuordnen.'); return; }
    onStartPath({ roadmapId: d.id, title: d.title, courseIds: nodes.map(n => n.courseId), index: 0 });
  };
  const selected = draft?.nodes.find(n => n.id === inspected);
  const edge = draft?.edges.find(e => e.id === selectedEdge);
  const totalDone = (draft?.statuses || []).filter(s => s.complete).length;

  return <section className={`roadmap-page ${reduced ? 'reduced-effects' : ''}`} aria-label="Roadmaps">
    <header className="roadmap-header"><div><span className="eyebrow">DEIN WEG DURCHS WISSEN</span><h1><Route size={27} /> Roadmaps</h1></div>
      <div className="roadmap-header-actions"><button onClick={async () => { if (!await flush()) return; try { const result = await api.import(); if (result) onActiveId(result.id); } catch (e) { setError(e.message); } }}><Upload size={16} /> Importieren</button><button className="roadmap-primary" onClick={() => { setPicker('create'); setPicked([]); setName('Mein Lernpfad'); }}><Plus size={17} /> Neue Roadmap</button></div></header>
    {error && <div role="alert" className="roadmap-error"><span>{error}</span><button aria-label="Roadmap-Fehler schließen" onClick={() => setError('')}><X size={17} /></button></div>}
    <div className="roadmap-bar"><select aria-label="Roadmap auswählen" value={activeId || ''} onChange={e => switchMap(e.target.value)}><option value="">Roadmap auswählen …</option>{maps.map(m => <option key={m.id} value={m.id}>{m.title} · {m.count} Kurse</option>)}</select>
      {draft && <><input aria-label="Roadmap umbenennen" value={draft.title} maxLength={120} onChange={e => change(d => ({ ...d, title: e.target.value }), false)} onBlur={() => persist(current.current)} /><span className="roadmap-save" role="status">{status}</span><button title="Jetzt speichern" aria-label="Roadmap speichern" onClick={() => persist(current.current)}><Save size={16} /></button><button aria-label="Roadmap exportieren" title="Als JSON exportieren" onClick={async () => { if (await flush()) api.export(activeId).catch(e => setError(e.message)); }}><Download size={17} /></button><button aria-label="Roadmap löschen" onClick={() => setConfirmDelete(true)}><Trash2 size={17} /></button></>}
    </div>
    {!draft ? <div className="roadmap-empty"><div className="roadmap-empty-symbol"><Route size={56} /></div><h2>Aus Kursen wird ein Weg.</h2><p>Verbinde deine Kurse, setze Meilensteine und behalte deinen nächsten Schritt im Blick.</p><button className="roadmap-primary" onClick={() => { setPicker('create'); setPicked([]); }}>Erste Roadmap erstellen</button></div> : <>
      <div className="roadmap-tools"><button onClick={() => { setPicker('add'); setPicked([]); }}><Plus size={16} /> Kurse hinzufügen</button><button onClick={autoLayout}><LayoutGrid size={16} /> Anordnen</button>
        <button className={marking ? 'active' : ''} aria-pressed={marking} onClick={() => setMarking(v => !v)}><Flag size={16} /> Pfad markieren</button>
        {draft.route.length > 0 && <button onClick={() => change(d => ({ ...d, route: [] }))}>Pfad leeren ({draft.route.length})</button>}
        <button onClick={startPath} disabled={!draft.nodes.length}><Play size={16} /> {draft.route.length ? 'Pfad starten' : 'Reihenfolge starten'}</button>
        <label><input type="checkbox" checked={compact} onChange={e => setCompact(e.target.checked)} /> Kompakt</label><label><input type="checkbox" checked={settings.roadmapReducedMotion || false} onChange={e => onSetting('roadmapReducedMotion', e.target.checked)} /> Weniger Effekte</label>
      </div>
      <div className="roadmap-summary"><span><CheckCircle2 size={15} /> {totalDone} / {draft.nodes.length} Stationen abgeschlossen</span>
        {draft.recommended ? <button onClick={() => open(draft.recommended)}>Nächster Schritt: {draft.nodes.find(n => n.id === draft.recommended)?.courseName}<ArrowRight size={15} /></button> : <span>{totalDone === draft.nodes.length && draft.nodes.length ? 'Ziel erreicht!' : 'Voraussetzungen, Kurszuordnung oder Startdatum prüfen.'}</span>}
      </div>
      {marking && <p className="roadmap-path-hint">Klicke zuerst einen Startkurs, danach direkt verbundene Folgekurse. Die markierte Sequenz wird gespeichert.</p>}
      <div className="roadmap-editor"><div className="roadmap-canvas">
        <ReactFlow key={activeId} nodes={flowNodes} edges={flowEdges} nodeTypes={nodeTypes} colorMode={settings.theme} ariaLabelConfig={labels}
          onInit={instance => { flow.current = instance; }} defaultViewport={draft.viewport} minZoom={.15} maxZoom={2} onlyRenderVisibleElements
          onNodesChange={changes => { setFlowNodes(old => applyNodeChanges(changes, old)); const positions = changes.filter(c => c.type === 'position' && c.position && c.dragging !== true); if (positions.length) change(d => ({ ...d, nodes: d.nodes.map(n => { const move = positions.find(c => c.id === n.id); return move ? { ...n, position: move.position } : n; }) })); }}
          onNodeDragStop={(_event, node) => change(d => ({ ...d, nodes: d.nodes.map(n => n.id === node.id ? { ...n, position: node.position } : n) }))}
          onEdgesChange={changes => setFlowEdges(old => applyEdgeChanges(changes, old))}
          onConnect={connect} isValidConnection={c => allowsConnection(draftRef.current.nodes, draftRef.current.edges, c.source, c.target)}
          onMoveEnd={(_event, viewport) => { const old = current.current?.viewport; if (old && (old.x !== viewport.x || old.y !== viewport.y || old.zoom !== viewport.zoom)) change(d => ({ ...d, viewport })); }}
          onNodeClick={(event, node) => { if (!event.target.closest('button, .react-flow__handle, .roadmap-node-grip')) open(node.id); }}
          onNodeContextMenu={(event, node) => { event.preventDefault(); inspect(node.id); }}
          onNodeDoubleClick={() => {}} onEdgeClick={(_event, e) => { setSelectedEdge(e.id); setInspected(null); }}
          onPaneClick={() => { setInspected(null); setSelectedEdge(null); }} deleteKeyCode={null} zoomOnDoubleClick={false}
          onKeyDown={event => { if (event.key === 'Enter' && event.target.classList.contains('react-flow__node')) { const id = event.target.dataset.id; if (id) { event.preventDefault(); open(id); } } }}>
          <Background color={settings.theme === 'light' ? '#c9cce0' : '#30374c'} gap={24} /><Controls /><MiniMap pannable zoomable nodeColor={n => n.data?.complete ? '#64c2a0' : n.data?.recommended ? '#9288ff' : '#545e7a'} />
        </ReactFlow>
        {!draft.nodes.length && <div className="roadmap-canvas-empty">Füge Kurse hinzu, um deinen Lernpfad zu beginnen.</div>}
      </div>
      {(selected || edge) && <aside className="roadmap-properties" aria-label="Knoteneigenschaften"><div className="roadmap-properties-title"><h3>{selected ? 'Lernstation' : 'Verbindung'}</h3><button aria-label="Eigenschaften schließen" onClick={() => { setInspected(null); setSelectedEdge(null); }}><X size={18} /></button></div>
        {selected && <>
          <label>Kurs zuordnen<select aria-label="Kurs neu zuordnen" value={selected.courseId} onChange={e => { const course = coursesById.get(e.target.value); patchNode(selected.id, { courseId: e.target.value, courseName: course?.name || selected.courseName }); }}>{!coursesById.has(selected.courseId) && <option value={selected.courseId}>Fehlend: {selected.courseName}</option>}{courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label>Lernziel<textarea aria-label="Lernziel" value={selected.goal || ''} maxLength={1500} onChange={e => patchNode(selected.id, { goal: e.target.value }, false)} onBlur={() => persist(current.current)} /></label>
          <label>Dauer in Minuten<input type="number" min="0" max="100000" value={selected.duration || 0} onChange={e => patchNode(selected.id, { duration: Number(e.target.value) }, false)} onBlur={() => persist(current.current)} /></label>
          <label>Geplanter Start<input type="date" value={selected.startDate || ''} onChange={e => patchNode(selected.id, { startDate: e.target.value })} /></label>
          <label className="roadmap-check"><input type="checkbox" checked={selected.required !== false} onChange={e => patchNode(selected.id, { required: e.target.checked })} /> Pflichtstation</label>
          <label className="roadmap-check"><input type="checkbox" checked={selected.milestone || false} onChange={e => patchNode(selected.id, { milestone: e.target.checked })} /> Meilenstein</label>
          <label className="roadmap-check"><input type="checkbox" checked={selected.checkpoint || false} onChange={e => patchNode(selected.id, { checkpoint: e.target.checked })} /> Checkpoint erreicht</label>
          <label>Notizen<textarea aria-label="Roadmap-Notizen" value={selected.notes || ''} maxLength={8000} onChange={e => patchNode(selected.id, { notes: e.target.value }, false)} onBlur={() => persist(current.current)} /></label>
          <label>Verbinden mit<select aria-label="Folgekurs auswählen" defaultValue="" onChange={e => { if (e.target.value) connect({ source: selected.id, target: e.target.value }); e.target.value = ''; }}><option value="">Folgekurs auswählen …</option>{draft.nodes.filter(n => allowsConnection(draft.nodes, draft.edges, selected.id, n.id)).map(n => <option key={n.id} value={n.id}>{n.courseName}</option>)}</select></label>
          <button className="roadmap-danger" onClick={() => removeNode(selected.id)}><Trash2 size={16} /> Aus Roadmap entfernen</button><small>Die Kursdateien bleiben erhalten.</small>
        </>}
        {edge && <><p>Die Ausgangsstation ist eine Voraussetzung für die Zielstation.</p><label>Bedingung / Hinweis<input value={edge.label || ''} maxLength={150} onChange={e => change(d => ({ ...d, edges: d.edges.map(item => item.id === edge.id ? { ...item, label: e.target.value } : item) }), false)} onBlur={() => persist(current.current)} /></label><button className="roadmap-danger" onClick={() => removeEdge(edge.id)}><Trash2 size={16} /> Verbindung entfernen</button></>}
      </aside>}
      </div>
      <footer className="roadmap-footer">Kurs anklicken: öffnen · Griffleiste: verschieben · Verbindungspunkte: verknüpfen · Rechtsklick: Eigenschaften · Änderungen werden lokal gespeichert</footer>
    </>}
    {picker && <RoadmapDialog label="Kursauswahl" onClose={() => setPicker(null)}><form className="roadmap-picker" onSubmit={addCourses} role="dialog" aria-modal="true" aria-label={picker === 'create' ? 'Roadmap erstellen' : 'Kurse hinzufügen'}><div className="roadmap-properties-title"><h2>{picker === 'create' ? 'Dein neuer Lernpfad' : 'Kurse hinzufügen'}</h2><button type="button" aria-label="Kursauswahl schließen" onClick={() => setPicker(null)}><X size={20} /></button></div>{picker === 'create' && <label>Name<input autoFocus aria-label="Name der Roadmap" required maxLength={120} value={name} onChange={e => setName(e.target.value)} /></label>}
      <input type="search" aria-label="Kursauswahl filtern" placeholder="Kurse suchen …" value={filter} onChange={e => setFilter(e.target.value)} />
      <div className="roadmap-picker-list">{courses.filter(c => c.name.toLocaleLowerCase().includes(filter.toLocaleLowerCase()) && (picker === 'create' || !draft?.nodes.some(n => n.courseId === c.id))).map(c => <label key={c.id}><input type="checkbox" checked={picked.includes(c.id)} onChange={e => setPicked(old => e.target.checked ? [...old, c.id] : old.filter(id => id !== c.id))} /><span>{c.name}<small>{c.chapterCount} Kapitel · {c.fileCount} Materialien</small></span></label>)}{!courses.length && <p>Wähle zuerst einen Kursordner in der Bibliothek aus.</p>}</div>
      <div className="roadmap-picker-actions"><span>{picked.length} Kurse ausgewählt</span><button type="submit" className="roadmap-primary" disabled={saving || !picked.length}>{picker === 'create' ? 'Roadmap erstellen' : 'Hinzufügen'}</button></div>
    </form></RoadmapDialog>}
    {confirmDelete && <RoadmapDialog label="Löschen bestätigen" onClose={() => setConfirmDelete(false)}><div className="roadmap-picker" role="alertdialog" aria-modal="true" aria-label="Roadmap löschen"><h2>„{draft?.title}“ löschen?</h2><p>Nur die Roadmap wird entfernt. Deine Kurse und Lernfortschritte bleiben erhalten.</p><div className="roadmap-picker-actions"><button onClick={() => setConfirmDelete(false)}>Abbrechen</button><button className="roadmap-danger" onClick={async () => { await queue.current; try { await api.delete(activeId); onActiveId(null); setConfirmDelete(false); } catch (e) { setError(e.message); } }}>Endgültig löschen</button></div></div></RoadmapDialog>}
  </section>;
}
