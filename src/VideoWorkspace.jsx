import React, { useEffect, useRef, useState } from 'react';
import { FileText, ExternalLink, X, Info, Star, CheckCircle2, Download, Folder } from 'lucide-react';
import Preview from './Preview.jsx';

const api = window.kursraum;
const documentKinds = new Set(['pdf', 'docx', 'text', 'markdown', 'image']);

export default function VideoWorkspace({ file, onClose, onToggleRead, onToggleFavorite, ...playerProps }) {
  const split = useRef(null);
  const [ratio, setRatio] = useState(50);
  const [info, setInfo] = useState(false);
  const [open, setOpen] = useState(false);
  const [chapters, setChapters] = useState([]);
  const [chapterPath, setChapterPath] = useState(file.chapterPath);
  const [documents, setDocuments] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    api.course(file.courseId).then(course => { if (alive) setChapters(course.chapters); })
      .catch(e => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [file.courseId]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    setError('');
    setDocuments([]);
    (async () => {
      const found = [];
      let page = 0;
      let result;
      do {
        result = await api.listFiles({ courseId: file.courseId, chapterPath, kind: 'all', page });
        if (!alive) return;
        found.push(...result.items.filter(item => documentKinds.has(item.kind)));
        page += 1;
      } while (page * result.pageSize < result.total);
      setDocuments(found);
    })().catch(e => { if (alive) setError(e.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [open, file.courseId, chapterPath]);

  const resize = event => {
    const bounds = split.current.getBoundingClientRect();
    setRatio(Math.max(25, Math.min(75, 100 * (event.clientX - bounds.left) / bounds.width)));
  };
  const external = method => api[method](file.id).catch(e => setError(e.message));

  return <div className="learning-room">
    <header className="learning-toolbar">
      <h2 id="reader-title" title={file.name}>{file.name}</h2>
      <button type="button" className="companion-toggle" aria-expanded={open} onClick={() => setOpen(value => !value)}><FileText size={17} /><span>{open ? 'Begleitmaterial ausblenden' : 'Begleitmaterial öffnen'}</span></button>
      {open && <label className="split-setting">Aufteilung<input aria-label="Breite des Videos" type="range" min="25" max="75" value={ratio} onChange={e => setRatio(Number(e.target.value))} /></label>}
      <button className="icon-button" title="Dateiinformationen und Aktionen" aria-label="Dateiinformationen" aria-expanded={info} onClick={() => setInfo(v => !v)}><Info size={19} /></button>
      <button className="icon-button" aria-label="Vorschau schließen" onClick={onClose}><X size={21} /></button>
    </header>
    {info && <div className="learning-info">
      <span>{(file.size / 1024 / 1024).toLocaleString('de-DE', { maximumFractionDigits: 1 })} MB · {new Date(file.modified).toLocaleDateString('de-DE')}</span>
      <button onClick={onToggleRead}><CheckCircle2 size={16} />{file.state?.read ? 'Gelesen' : 'Als gelesen'}</button>
      <button onClick={onToggleFavorite}><Star size={16} />{file.state?.favorite ? 'Favorit entfernen' : 'Favorit'}</button>
      <button onClick={() => external('download')}><Download size={16} />Speichern</button>
      <button onClick={() => external('open')}><ExternalLink size={16} />Extern öffnen</button>
      <button onClick={() => external('reveal')}><Folder size={16} />Ordner</button>
    </div>}
    <div ref={split} className={`video-workspace ${open ? 'with-documents' : ''}`} style={{ '--video-share': `${ratio}fr`, '--document-share': `${100 - ratio}fr` }}>
      <div className="video-column"><Preview file={file} {...playerProps} /></div>
      {open && <>
        <div className="learning-divider" role="separator" aria-label="Bereiche aufteilen" aria-orientation="vertical" aria-valuenow={ratio} aria-valuemin={25} aria-valuemax={75} tabIndex={0}
          onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); resize(e); }}
          onPointerMove={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) resize(e); }}
          onPointerUp={e => e.currentTarget.releasePointerCapture(e.pointerId)}
          onKeyDown={e => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) { e.preventDefault(); setRatio(v => e.key === 'Home' ? 25 : e.key === 'End' ? 75 : Math.max(25, Math.min(75, v + (e.key === 'ArrowLeft' ? -5 : 5)))); } }} />
        <section className="companion-panel" aria-label="Begleitmaterial">
          <div className="companion-toolbar">
            <select className="companion-chapter" aria-label="Kapitel für Begleitmaterial" title="Kapitel auswählen" value={chapterPath} onChange={e => { setChapterPath(e.target.value); setSelected(null); }}>
              {chapters.map(ch => <option key={ch.path} value={ch.path}>{ch.name}</option>)}
            </select>
            <select className="companion-file" aria-label="Begleitdokument auswählen" title={selected?.name || 'Dokument auswählen'} value={selected?.id || ''} disabled={loading} onChange={e => setSelected(documents.find(item => item.id === e.target.value) || null)}>
              <option value="">{loading ? 'Laden …' : 'Dokument auswählen …'}</option>
              {documents.map(doc => <option key={doc.id} value={doc.id}>{doc.name}</option>)}
            </select>
            {selected && <button className="icon-button" title="Dokument in Standard-App öffnen" aria-label="Dokument extern öffnen" onClick={() => api.open(selected.id).catch(e => setError(e.message))}><ExternalLink size={17} /></button>}
            <button className="icon-button" aria-label="Begleitmaterial schließen" onClick={() => setOpen(false)}><X size={18} /></button>
          </div>
          {chapterPath !== file.chapterPath && <button className="back-link companion-return" onClick={() => { setChapterPath(file.chapterPath); setSelected(null); }}>Zum Kapitel des Videos</button>}
          {error && <p role="alert">{error}</p>}
          {!loading && !error && !documents.length && <p className="companion-hint">Keine Begleitdokumente in diesem Kapitel. Du kannst ein anderes Kapitel auswählen.</p>}
          <div className="companion-preview">{selected ? <Preview file={selected} /> : <div className="companion-empty"><FileText size={32} /><p>Dokument oben auswählen</p><small>PDF, Word, Text, Markdown oder Bilder</small></div>}</div>
        </section>
      </>}
    </div>
  </div>;
}
