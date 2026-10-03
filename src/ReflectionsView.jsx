import React, { useEffect, useState } from 'react';
import { BookOpen, Lightbulb, Play, Search } from 'lucide-react';

function ServiceIdea({ state }) {
  return <section className="service-idea"><h3><Lightbulb size={17} /> Dienstleistungsidee</h3><p>{state.serviceIdea}</p>
    {(state.serviceAudience || state.serviceNextStep) && <dl>
      {state.serviceAudience && <div><dt>Für wen?</dt><dd>{state.serviceAudience}</dd></div>}
      {state.serviceNextStep && <div><dt>Erster Umsetzungsschritt</dt><dd>{state.serviceNextStep}</dd></div>}
    </dl>}
  </section>;
}

export default function ReflectionsView({ root, revision, onEdit, onOpenVideo }) {
  const [entries, setEntries] = useState([]);
  const [query, setQuery] = useState('');
  const [courseId, setCourseId] = useState('');
  const [mode, setMode] = useState('reflections');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    window.kursraum.reflections().then(data => { if (alive) setEntries(data); })
      .catch(e => { if (alive) setError(e.message); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [root, revision]);
  const courses = [...new Map(entries.map(entry => [entry.courseId, entry.courseName])).entries()];
  const ideas = entries.filter(entry => entry.state.serviceIdea);
  const shown = (mode === 'ideas' ? ideas : entries).filter(entry => (!courseId || entry.courseId === courseId) &&
    `${entry.courseName} ${entry.chapterPath} ${entry.name} ${(entry.state.learningPoints || []).join(' ')} ${entry.state.serviceIdea || ''} ${entry.state.serviceAudience || ''} ${entry.state.serviceNextStep || ''}`.toLocaleLowerCase('de').includes(query.trim().toLocaleLowerCase('de')));
  return <section className="reflections-page">
    <div className="page-heading"><span className="eyebrow">WISSEN VERSTEHEN. IDEEN ENTWICKELN.</span><h1>Reflexion & Ideen</h1><p>Deine Erkenntnisse aus den Videos und die Dienstleistungen, die daraus entstehen könnten.</p></div>
    <div className="reflection-view-switch" role="group" aria-label="Ansicht wählen">
      <button className={mode === 'reflections' ? 'selected' : ''} aria-pressed={mode === 'reflections'} onClick={() => setMode('reflections')}><BookOpen size={17} /> Reflexionen <span>{entries.length}</span></button>
      <button className={mode === 'ideas' ? 'selected' : ''} aria-pressed={mode === 'ideas'} onClick={() => setMode('ideas')}><Lightbulb size={17} /> Dienstleistungsideen <span>{ideas.length}</span></button>
    </div>
    <div className="reflection-filter-bar">
      <label className="reflection-search"><Search size={18} /><input type="search" aria-label="Reflexionen und Ideen durchsuchen" placeholder="Erkenntnis, Idee, Zielgruppe oder Video suchen …" value={query} onChange={e => setQuery(e.target.value)} /></label>
      <select aria-label="Reflexionen nach Kurs filtern" value={courseId} onChange={e => setCourseId(e.target.value)}><option value="">Alle Kurse</option>{courses.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
    </div>
    {error && <p role="alert">{error}</p>}
    {loading ? <p role="status">Reflexionen werden geladen …</p> : shown.length ? <div className="reflection-list">{shown.map(entry => <article className="reflection-card" key={`${entry.type}:${entry.id}`}>
      <div className="reflection-card-heading"><div><small>{entry.courseName} · {entry.chapterPath || 'Kursstart'} · {entry.kind === 'video' ? 'Video' : entry.type === 'chapter' ? 'Kapitel' : 'Material'}</small><h2>{entry.name}</h2></div><button className="secondary-button" onClick={() => onEdit(entry)}>Bearbeiten</button></div>
      {mode === 'reflections' ? <><h3 className="reflection-points-heading">Das habe ich gelernt</h3><ol>{(entry.state.learningPoints || []).map((point, index) => <li key={index}>{point}</li>)}</ol>
        {entry.state.serviceIdea ? <ServiceIdea state={entry.state} /> : entry.kind === 'video' && <p className="reflection-missing-idea">Deine Dienstleistungsidee kannst du über „Bearbeiten“ ergänzen.</p>}
      </> : <><ServiceIdea state={entry.state} /><details className="reflection-point-details"><summary>Lernpunkte zum Video ansehen</summary><ol>{(entry.state.learningPoints || []).map((point, index) => <li key={index}>{point}</li>)}</ol></details></>}
      {entry.kind === 'video' && <button className="reflection-revisit" onClick={() => onOpenVideo(entry)}><Play size={15} /> Video wieder ansehen</button>}
    </article>)}</div> : !error && <div className="empty-section">{mode === 'ideas' ? <Lightbulb size={30} /> : <BookOpen size={30} />}<h2>{query || courseId ? 'Keine passenden Einträge' : mode === 'ideas' ? 'Deine Ideensammlung wächst mit jedem Video' : 'Dein Reflexionsbuch beginnt mit dem nächsten Video'}</h2><p>{query || courseId ? 'Ändere den Suchbegriff oder den Kursfilter.' : 'Nach jedem Video hältst du mindestens zwei Lernpunkte und eine mögliche Dienstleistungsidee fest. Hier kannst du sie jederzeit wieder aufgreifen.'}</p></div>}
  </section>;
}
