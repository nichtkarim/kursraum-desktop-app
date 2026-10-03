import React, { memo, useEffect } from 'react';
import { Handle, Position, useUpdateNodeInternals } from '@xyflow/react';
import { BookOpen, ChevronDown, ChevronUp, Flag, Grip, Settings2, Check, AlertCircle } from 'lucide-react';

export default memo(function CourseNode({ id, data, selected }) {
  const { node, course, progress, complete, recommended, compact, chapters, inRoute, ports = { incoming: [], outgoing: [] } } = data;
  const updateInternals = useUpdateNodeInternals();
  const portSignature = ports.incoming.map(e => e.id).join(',') + '|' + ports.outgoing.map(e => e.id).join(',');
  useEffect(() => { updateInternals(id); }, [id, portSignature, updateInternals]);
  const portPosition = (i, count) => `${25 + (i + 1) * 50 / (count + 1)}%`;
  const condition = { and: 'UND', or: 'ODER', xor: 'ENTWEDER ODER' }[node.prerequisiteMode || 'and'];
  return <article className={`roadmap-node ${selected ? 'is-selected' : ''} ${complete ? 'is-complete' : ''} ${recommended ? 'is-next' : ''} ${!course ? 'is-missing' : ''} ${inRoute ? 'in-route' : ''} ${data.removing ? 'is-removing' : ''}`}>
    <Handle type="target" position={Position.Left} aria-label="Voraussetzung verbinden" />
    {ports.incoming.map((edge, i) => <Handle key={edge.id} id={`in-${edge.id}`} type="target" position={Position.Left} isConnectable={false} className="roadmap-edge-port" style={{ top: portPosition(i, ports.incoming.length), background: data.connectionColor }} />)}
    <div className="roadmap-node-grip"><Grip size={14} /><span>{complete ? 'ABGESCHLOSSEN' : recommended ? 'DEIN NÄCHSTER SCHRITT' : node.required ? 'LERNSTATION' : 'OPTIONAL'}</span>{node.milestone && <Flag size={15} />}</div>
    {ports.incoming.length > 1 && <button className="roadmap-node-condition nodrag" onClick={() => data.inspect(id)} title="Verknüpfung der Voraussetzungen bearbeiten" style={{ borderColor: data.connectionColor }}><strong>{condition}</strong><span>{ports.incoming.length} Voraussetzungen</span></button>}
    <button className="roadmap-node-open nodrag" onClick={() => data.open(id)} aria-label={`${course?.name || node.courseName} öffnen`}>
      {!compact && <div className="roadmap-node-cover">{course?.coverId ? <img src={window.kursraum.thumbnailUrl(course.coverId)} alt="" loading="lazy" onError={e => { e.currentTarget.style.display = 'none'; }} /> : <BookOpen size={34} />}<span>{node.milestone ? 'MEILENSTEIN' : 'KURS'}</span></div>}
      <h3>{course?.name || node.courseName || 'Kurs zuordnen'}</h3>
    </button>
    <div className="roadmap-node-progress"><span>{!course ? <><AlertCircle size={13} /> Kurs fehlt · neu zuordnen</> : complete ? <><Check size={13} /> {node.checkpoint && progress < 100 ? 'Checkpoint erreicht' : 'Abgeschlossen'}</> : `${progress} % gelesen`}</span><span>{node.duration > 0 ? `${node.duration} min` : ''}</span></div>
    <div className="roadmap-progress"><span style={{ width: `${complete ? 100 : progress}%` }} /></div>
    {!compact && node.goal && <p className="roadmap-node-goal">{node.goal}</p>}
    <div className="roadmap-node-tools nodrag">
      <button onClick={() => data.expand(id)} disabled={!course}>{node.expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}{course?.chapterCount || 0} Kapitel</button>
      <button aria-label={`Eigenschaften: ${course?.name || node.courseName}`} onClick={() => data.inspect(id)}><Settings2 size={15} /></button>
    </div>
    {node.expanded && <div className="roadmap-chapters nodrag nowheel">{chapters ? chapters.map(ch => <button key={ch.path} onClick={() => data.open(id, ch.path)}><span>{ch.state?.complete ? '✓' : '○'}</span><span>{ch.name}</span><small>{ch.fileCount ? Math.round(100 * (ch.readCount || 0) / ch.fileCount) : 0}%</small></button>) : <p>Kapitel werden geladen …</p>}</div>}
    <Handle type="source" position={Position.Right} aria-label="Folgekurs verbinden" />
    {ports.outgoing.map((edge, i) => <Handle key={edge.id} id={`out-${edge.id}`} type="source" position={Position.Right} isConnectable={false} className="roadmap-edge-port" style={{ top: portPosition(i, ports.outgoing.length) }} />)}
  </article>;
});
