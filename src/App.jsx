import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, BookOpen, Bookmark, Cloud, Check, CheckCircle2, ChevronRight, Download, ExternalLink,
  File as FileIcon, FileText, Folder, FolderOpen, GraduationCap, HardDrive, Heart,
  Image as ImageIcon, Layers3, LayoutGrid, Menu, Moon, Play, RotateCw, Search,
  Settings2, Star, Sun, Video, X
} from 'lucide-react';
import Preview from './Preview.jsx';
import Reader from './Reader.jsx';
import NextcloudDialog from './NextcloudDialog.jsx';

const api = window.kursraum;
const number = new Intl.NumberFormat('de-DE');
const date = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });
const kindNames = { all: 'Alle', video: 'Videos', pdf: 'PDF', markdown: 'Markdown', text: 'Text', docx: 'Word', image: 'Bilder', other: 'Andere' };
const kindIcons = { video: Video, image: ImageIcon, pdf: FileText, markdown: FileText, text: FileText, docx: FileText, other: FileIcon };
function formatBytes(value) {
  if (!value) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(4, Math.floor(Math.log(value) / Math.log(1024)));
  return `${(value / (1024 ** exponent)).toLocaleString('de-DE', { maximumFractionDigits: exponent ? 1 : 0 })} ${units[exponent]}`;
}
function progress(course) { return course.fileCount ? Math.round(100 * course.readCount / course.fileCount) : 0; }
const normalize = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function CourseCard({ course, index, onClick }) {
  return <button type="button" className="course-card" onClick={onClick}>
    <div className={`course-cover tone-${index % 5}`}>
      {course.coverId ? <img src={api.mediaUrl(course.coverId)} alt="" loading="lazy" /> : <><div className="cover-orbit" /><span className="cover-monogram">{course.name.slice(0, 2).toUpperCase()}</span></>}
      <span className="course-cover-label"><BookOpen size={14} /> KURS</span>
    </div>
    <div className="course-card-content">
      <div className="course-category">{number.format(course.chapterCount)} KAPITEL · {number.format(course.fileCount)} MATERIALIEN</div>
      <h3>{course.name}</h3>
      <p>{course.description || 'Alle Materialien aus deinem lokalen Kursordner – übersichtlich an einem Ort.'}</p>
      <div className="course-card-bottom"><span>{progress(course)} % abgeschlossen</span><ChevronRight size={17} /></div>
      <div className="progress-track"><div style={{ width: `${progress(course)}%` }} /></div>
    </div>
  </button>;
}

function MaterialRow({ file, courseName, onOpen, onToggleFavorite }) {
  const Icon = kindIcons[file.kind] || FileIcon;
  return <div className="material-row">
    <button type="button" className="material-open" onClick={() => onOpen(file)} aria-label={`${file.name} ansehen`}>
      <span className={`material-icon kind-${file.kind}`}><Icon size={21} strokeWidth={1.8} /></span>
      <span className="material-description"><strong title={file.name}>{file.name}</strong><small>{courseName && <>{courseName} · </>}{kindNames[file.kind] || 'Datei'} · {formatBytes(file.size)} · {date.format(new Date(file.modified))}</small></span>
      {file.state?.read && <span className="material-read"><Check size={14} /> Gelesen</span>}
      <ChevronRight className="material-chevron" size={17} />
    </button>
    <button type="button" className={`icon-button favorite-button ${file.state?.favorite ? 'active' : ''}`}
      onClick={() => onToggleFavorite(file)} aria-label={file.state?.favorite ? 'Aus Favoriten entfernen' : 'Als Favorit markieren'} title="Favorit">
      <Star size={18} fill={file.state?.favorite ? 'currentColor' : 'none'} />
    </button>
  </div>;
}

function MaterialList({ title, subtitle, items, total, loading, onOpen, onToggleFavorite, onMore }) {
  return <section className="material-section"><div className="section-top"><div><h2>{title}</h2><p>{subtitle}</p></div><span className="count-pill">{number.format(total)} Dateien</span></div>
    {items.length ? <div className="material-list">{items.map(file => <MaterialRow key={file.id} file={file} courseName={file.courseName} onOpen={onOpen} onToggleFavorite={onToggleFavorite} />)}</div>
      : <div className="empty-section"><FolderOpen size={27} /><h3>{loading ? 'Materialien werden geladen …' : 'Noch keine Materialien'}</h3><p>{loading ? 'Einen Moment bitte.' : 'Hier ist noch nichts zu sehen. Wähle ein anderes Kapitel oder einen anderen Filter.'}</p></div>}
    {items.length < total && <button type="button" className="load-more" disabled={loading} onClick={onMore}>{loading ? 'Lädt …' : `Mehr anzeigen (${number.format(total - items.length)} weitere)`}</button>}
  </section>;
}

function FileFilters({ value, onChange }) {
  return <div className="filter-row" role="group" aria-label="Nach Dateityp filtern">
    {Object.entries(kindNames).map(([key, label]) => <button type="button" key={key} className={`filter-chip ${value === key ? 'selected' : ''}`} onClick={() => onChange(key)}>{label}</button>)}
  </div>;
}

export default function App() {
  const [overview, setOverview] = useState({ root: null, courses: [], scanning: false, progress: null, error: null });
  const [settings, setSettings] = useState({ theme: 'dark', fontScale: 1, locale: 'de' });
  const [view, setView] = useState('home');
  const [courseId, setCourseId] = useState(null);
  const [course, setCourse] = useState(null);
  const [chapterPath, setChapterPath] = useState(null);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [autoPlayVideoId, setAutoPlayVideoId] = useState(null);
  const [filter, setFilter] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');
  const [note, setNote] = useState('');
  const [reload, setReload] = useState(0);
  const [error, setError] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [nextcloudOpen, setNextcloudOpen] = useState(false);
  const [nextcloud, setNextcloud] = useState({ configured: false, authenticated: false, running: false });

  useEffect(() => {
    api.getSettings().then(setSettings).catch(e => setError(e.message));
    api.nextcloudStatus().then(setNextcloud).catch(e => setError(e.message));
    const unsubscribe = api.onEvent(event => {
      if (event.type === 'nextcloud') setNextcloud(event.status);
      if (event.type === 'progress') setOverview(previous => ({ ...previous, scanning: event.scanning, progress: event.progress }));
      if (event.type === 'changed') setReload(value => value + 1);
      if (event.type === 'error') { setError(event.message); setReload(value => value + 1); }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    let alive = true;
    api.overview().then(data => { if (alive) setOverview(data); }).catch(e => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [reload]);

  useEffect(() => {
    let alive = true;
    if (view !== 'course' || !courseId) { setCourse(null); return () => { alive = false; }; }
    api.course(courseId).then(detail => {
      if (!alive) return;
      setCourse(detail);
      setChapterPath(current => current !== null && detail.chapters.some(ch => ch.path === current) ? current : (detail.chapters[0]?.path ?? ''));
    }).catch(e => { if (alive) { setError(e.message); setView('home'); } });
    return () => { alive = false; };
  }, [view, courseId, reload]);

  useEffect(() => {
    if (!course || course.id !== courseId || chapterPath === null) return;
    setNote(course.chapters.find(ch => ch.path === chapterPath)?.state?.note || '');
  }, [course?.id, courseId, chapterPath]);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(searchInput.trim()), 220);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => { setPage(0); setItems([]); setTotal(0); }, [view, courseId, chapterPath, filter, query]);

  useEffect(() => {
    let alive = true;
    const searching = query.length > 0;
    if (!overview.root || (!searching && view === 'home') || (!searching && view === 'course' && (!courseId || chapterPath === null))) return () => { alive = false; };
    setLoading(true);
    let promise;
    if (searching) promise = api.search({ query, kind: filter, page });
    else if (view === 'favorites') promise = api.favorites({ kind: filter, page });
    else promise = api.listFiles({ courseId, chapterPath, kind: filter, page });
    promise.then(result => {
      if (!alive) return;
      setTotal(result.total);
      setItems(current => page === 0 ? result.items : [...current, ...result.items.filter(next => !current.some(old => old.id === next.id))]);
    }).catch(e => { if (alive) setError(e.message); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [overview.root, view, courseId, chapterPath, filter, query, page, reload]);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.style.setProperty('--font-scale', String(settings.fontScale));
  }, [settings]);

  const shownCourses = useMemo(() => overview.courses.filter(item => normalize(item.name).includes(normalize(query))), [overview.courses, query]);
  const chapter = course?.chapters.find(ch => ch.path === chapterPath);
  const isSearching = query.length > 0;
  const openCourse = id => { setCourseId(id); setChapterPath(null); setView('course'); setSelectedFile(null); setSidebarOpen(false); setSearchInput(''); };
  const handleError = action => Promise.resolve().then(action).catch(e => setError(e.message));
  const pickRoot = () => handleError(async () => {
    const result = await api.chooseRoot();
    if (result) { setView('home'); setCourseId(null); setSelectedFile(null); setSearchInput(''); setReload(value => value + 1); }
  });
  const saveFileState = async (file, patch) => {
    const state = await api.setFileState(file.id, patch);
    setItems(current => current.map(item => item.id === file.id ? { ...item, state } : item));
    setSelectedFile(current => current?.id === file.id ? { ...current, state } : current);
  };
  const updateFile = (file, field) => handleError(() => saveFileState(file, { [field]: !file.state?.[field] }));
  const markVideoWatched = file => file.state?.read ? Promise.resolve() : saveFileState(file, { read: true });
  const playNextVideo = useCallback(file => {
    setAutoPlayVideoId(file.id);
    setSelectedFile(file);
    setCourseId(file.courseId);
    setChapterPath(file.chapterPath);
    setView('course');
    setSearchInput('');
    setFilter('all');
  }, []);
  const updateChapter = patch => handleError(async () => {
    const state = await api.setChapterState(courseId, chapterPath, patch);
    setCourse(current => current ? { ...current, chapters: current.chapters.map(ch => ch.path === chapterPath ? { ...ch, state } : ch) } : current);
  });
  const updateSetting = (key, value) => handleError(async () => setSettings(await api.setSetting(key, value)));
  const openFile = file => { setAutoPlayVideoId(null); setSelectedFile(file); setSidebarOpen(false); };
  const action = (method, file) => handleError(() => api[method](file.id));

  return <div className={`app-shell ${selectedFile && selectedFile.kind !== 'video' ? 'reader-visible' : ''}`}>
    <aside className={`sidebar ${sidebarOpen ? 'mobile-open' : ''}`}>
      <div className="sidebar-header"><img className="brand-icon" src={`${import.meta.env.BASE_URL}kursraum-icon.svg`} alt="" /><div><strong>Kursraum</strong><small>DEINE LERNBIBLIOTHEK</small></div><button className="icon-button mobile-close" aria-label="Menü schließen" onClick={() => setSidebarOpen(false)}><X size={19} /></button></div>
      <div className="sidebar-scroll">
        <div className="nav-label">BIBLIOTHEK</div>
        <button type="button" className={`nav-item ${view === 'home' ? 'selected' : ''}`} onClick={() => { setView('home'); setSearchInput(''); setSidebarOpen(false); }}><LayoutGrid size={18} /> Alle Kurse <span>{overview.courses.length}</span></button>
        <button type="button" className={`nav-item ${view === 'favorites' ? 'selected' : ''}`} onClick={() => { setView('favorites'); setSearchInput(''); setSidebarOpen(false); }}><Star size={18} /> Favoriten</button>
        <div className="sidebar-divider" />
        <div className="nav-label nav-label-row"><span>MEINE KURSE</span><span>{overview.courses.length}</span></div>
        {overview.courses.map((item, index) => <button type="button" className={`course-nav ${view === 'course' && item.id === courseId ? 'selected' : ''}`} key={item.id} onClick={() => openCourse(item.id)}>
          <span className={`course-nav-badge tone-${index % 5}`}>{item.name.slice(0, 1).toUpperCase()}</span><span title={item.name}>{item.name}</span>
        </button>)}
        {!overview.courses.length && <p className="sidebar-hint">Hier erscheinen deine Kurse nach der Ordnerauswahl.</p>}
      </div>
      <div className="sidebar-bottom"><div className="local-badge"><span className="local-dot" /> {nextcloud.configured ? 'Nextcloud verbunden' : 'Lokal auf deinem Gerät'}</div><button type="button" className="sidebar-cloud" onClick={() => setNextcloudOpen(true)}><Cloud size={18} /><span>{nextcloud.running ? 'Wird synchronisiert …' : 'Nextcloud'}</span><ChevronRight size={16} /></button><button className="sidebar-folder" onClick={pickRoot}><FolderOpen size={17} /><span title={overview.root || ''}>{overview.root ? 'Ordner wechseln' : 'Ordner auswählen'}</span><ChevronRight size={16} /></button></div>
    </aside>

    {sidebarOpen && <button className="mobile-scrim" aria-label="Menü schließen" onClick={() => setSidebarOpen(false)} />}
    <div className="app-main">
      <header className="topbar"><div className="topbar-leading"><button className="icon-button menu-toggle" aria-label="Menü öffnen" onClick={() => setSidebarOpen(true)}><Menu size={21} /></button><span className="breadcrumb"><button onClick={() => { setView('home'); setSearchInput(''); }}>Bibliothek</button>{view === 'course' && <><ChevronRight size={15} /><span title={course?.name}>{course?.name || 'Kurs'}</span></>}{view === 'favorites' && <><ChevronRight size={15} /><span>Favoriten</span></>}</span></div>
        <div className="topbar-actions"><label className="search-box"><Search size={18} /><input type="search" placeholder="Kurse & Dateien suchen …" aria-label="Kurse und Dateien suchen" value={searchInput} onChange={e => setSearchInput(e.target.value)} />{searchInput && <button aria-label="Suche leeren" onClick={() => setSearchInput('')}><X size={15} /></button>}</label>
          <button className={`icon-button refresh-button ${overview.scanning ? 'spinning' : ''}`} title="Ordner neu scannen" aria-label="Ordner neu scannen" disabled={!overview.root || overview.scanning} onClick={() => handleError(() => api.rescan())}><RotateCw size={18} /></button>
          <button className="icon-button" title="Einstellungen" aria-label="Einstellungen" onClick={() => setSettingsOpen(true)}><Settings2 size={19} /></button>
        </div></header>

      {overview.scanning && <div className="scan-status"><span className="scan-spinner" /><span>Ordner wird indexiert · {number.format(overview.progress?.files || 0)} Dateien · {number.format(overview.progress?.folders || 0)} Ordner</span></div>}
      {error && <div className="error-bar" role="alert"><span>{error}</span><button onClick={() => setError('')} aria-label="Fehler schließen"><X size={17} /></button></div>}
      <div className="workspace"><main className="content-area">
        {!overview.root && <div className="welcome"><div className="welcome-art"><BookOpen size={64} strokeWidth={1.2} /><span className="welcome-art-ring" /></div><span className="eyebrow">DEIN WISSEN. DEIN ORT.</span><h1>Alle deine Kurse.<br /><span>An einem Ort.</span></h1><p>Wähle einmal deinen Ordner „Kurse“. Wir machen aus deiner vorhandenen Ordnerstruktur eine übersichtliche Lernplattform. Optional verbindest du deine Kurse direkt mit Nextcloud.</p><button className="primary-button" onClick={pickRoot}><FolderOpen size={18} /> Kursordner auswählen <ChevronRight size={17} /></button><button type="button" className="cloud-welcome-button" onClick={() => setNextcloudOpen(true)}><Cloud size={18} /> Mit Nextcloud verbinden</button><div className="welcome-foot">Offline lernen · Nextcloud optional · Jederzeit wechselbar</div></div>}
        {overview.root && isSearching && <><div className="page-heading compact"><span className="eyebrow">BIBLIOTHEK DURCHSUCHEN</span><h1>Suchergebnisse</h1><p>„{query}“ in Kursen, Kapiteln und Dateinamen</p></div><FileFilters value={filter} onChange={setFilter} /><MaterialList title="Passende Materialien" subtitle={`${number.format(shownCourses.length)} passende Kurse · Dateinamen und Kapitelpfade`} items={items} total={total} loading={loading} onOpen={openFile} onToggleFavorite={file => updateFile(file, 'favorite')} onMore={() => setPage(n => n + 1)} />{shownCourses.length > 0 && <section className="search-courses"><h2>Passende Kurse</h2><div className="course-grid">{shownCourses.map((item, i) => <CourseCard key={item.id} course={item} index={i} onClick={() => openCourse(item.id)} />)}</div></section>}</>}
        {overview.root && !isSearching && view === 'home' && <><div className="hero"><div className="hero-copy"><span className="hero-kicker"><span className="hero-kicker-dot" /> DEINE LERNBIBLIOTHEK</span><h1>Was möchtest du<br /><em>heute lernen?</em></h1><p>Deine Materialien. Dein Tempo. Alles an einem Ort.</p><div className="hero-stats"><span><BookOpen size={16} /> {overview.courses.length} Kurse</span><span><FileText size={16} /> {number.format(overview.courses.reduce((a, c) => a + c.fileCount, 0))} Materialien</span></div></div><div className="hero-visual"><div className="hero-circle hero-circle-one" /><div className="hero-circle hero-circle-two" /><div className="hero-tile"><GraduationCap size={48} strokeWidth={1.1} /><span>LEARN AT YOUR PACE</span></div></div></div>
          <div className="section-top overview-section-top"><div><span className="eyebrow">DEINE SAMMLUNG</span><h2>Alle Kurse</h2><p>Direkt aus deinem Kursordner importiert</p></div><button className="secondary-button" onClick={pickRoot}><FolderOpen size={16} /> Ordner wechseln</button></div>
          {overview.courses.length ? <div className="course-grid">{overview.courses.map((item, index) => <CourseCard key={item.id} course={item} index={index} onClick={() => openCourse(item.id)} />)}</div> : <div className="empty-section"><FolderOpen size={30} /><h3>{overview.scanning ? 'Kurse werden eingelesen …' : 'Noch keine Kurse gefunden'}</h3><p>Jeder direkte Unterordner von „Kurse“ wird hier als Kurs angezeigt.</p></div>}</>}
        {overview.root && !isSearching && view === 'favorites' && <><div className="page-heading"><span className="eyebrow">DEINE AUSWAHL</span><h1>Favoriten <Star size={28} /></h1><p>Deine wichtigsten Unterlagen auf einen Blick.</p></div><FileFilters value={filter} onChange={setFilter} /><MaterialList title="Gespeicherte Materialien" subtitle="Kursübergreifend gesammelt" items={items} total={total} loading={loading} onOpen={openFile} onToggleFavorite={file => updateFile(file, 'favorite')} onMore={() => setPage(n => n + 1)} /></>}
        {overview.root && !isSearching && view === 'course' && course && <><div className="course-header"><button className="back-link" onClick={() => setView('home')}><ArrowLeft size={16} /> Alle Kurse</button><div className="course-header-main"><div><span className="eyebrow">DEIN KURS · {course.chapterCount} KAPITEL</span><h1>{course.name}</h1><p>{course.description || 'Alle Inhalte dieses Kurses, direkt aus deinem Ordner.'}</p></div>{course.coverId && <img className="course-header-cover" src={api.mediaUrl(course.coverId)} alt="" />}</div><div className="course-meta"><span><Layers3 size={16} /> {number.format(course.chapterCount)} Kapitel</span><span><FileText size={16} /> {number.format(course.fileCount)} Materialien</span><span><CheckCircle2 size={16} /> {progress(course)} % gelesen</span></div><div className="progress-track course-track"><div style={{ width: `${progress(course)}%` }} /></div></div>
          <div className="course-layout"><nav className="chapter-panel" aria-label="Kapitelverzeichnis"><div className="chapter-panel-title"><span>INHALTSVERZEICHNIS</span><span>{course.chapters.length}</span></div>{course.chapters.map((ch, index) => <button key={ch.path} className={`chapter-link ${chapterPath === ch.path ? 'selected' : ''}`} style={{ paddingLeft: `${14 + ch.depth * 16}px` }} onClick={() => { setChapterPath(ch.path); setSelectedFile(null); }}><span className="chapter-index">{String(index + 1).padStart(2, '0')}</span><span className="chapter-name" title={ch.path}>{ch.name}</span>{ch.state?.complete ? <CheckCircle2 size={15} className="chapter-complete" /> : <span className="chapter-count">{ch.fileCount}</span>}</button>)}</nav>
            <div className="course-materials"><div className="chapter-heading"><span className="eyebrow">KAPITEL {Math.max(1, course.chapters.findIndex(ch => ch.path === chapterPath) + 1)} / {course.chapters.length}</span><h2>{chapter?.name || 'Materialien'}</h2><p>{chapterPath ? `${course.name} / ${chapterPath.split('/').join(' / ')}` : 'Materialien im Kursordner'}</p></div>
              <div className="chapter-actions"><button className={`completion-button ${chapter?.state?.complete ? 'complete' : ''}`} onClick={() => updateChapter({ complete: !chapter?.state?.complete })}><CheckCircle2 size={17} /> {chapter?.state?.complete ? 'Kapitel abgeschlossen' : 'Als abgeschlossen markieren'}</button><span>{number.format(chapter?.fileCount || 0)} Materialien</span></div>
              <FileFilters value={filter} onChange={setFilter} />
              <MaterialList title="Lernmaterialien" subtitle="Öffne eine Datei für die Vorschau oder zum Herunterladen." items={items} total={total} loading={loading} onOpen={openFile} onToggleFavorite={file => updateFile(file, 'favorite')} onMore={() => setPage(n => n + 1)} />
              <section className="notes-section"><div><h3>Deine Notizen</h3><p>Privat gespeichert, nur auf diesem Gerät.</p></div><textarea value={note} placeholder="Notizen zu diesem Kapitel …" maxLength={8000} onChange={e => setNote(e.target.value)} onBlur={() => { if (chapter && note !== (chapter.state?.note || '')) updateChapter({ note }); }} /><small>Speichert beim Verlassen des Feldes.</small></section>
            </div></div></>}
      </main>
      {selectedFile && <Reader video={selectedFile.kind === 'video'} onClose={() => setSelectedFile(null)}><div className="reader-top"><span className="eyebrow">{selectedFile.kind === 'video' ? 'VIDEO ANSEHEN' : 'MATERIAL ANSEHEN'}</span><button className="icon-button" onClick={() => setSelectedFile(null)} aria-label="Vorschau schließen"><X size={20} /></button></div><div className="reader-heading"><div className={`material-icon kind-${selectedFile.kind}`}>{React.createElement(kindIcons[selectedFile.kind] || FileIcon, { size: 22 })}</div><div><h2 id="reader-title" title={selectedFile.name}>{selectedFile.name}</h2><p>{kindNames[selectedFile.kind]} · {formatBytes(selectedFile.size)} · {date.format(new Date(selectedFile.modified))}</p></div></div><div className="reader-actions"><button className={selectedFile.state?.read ? 'active' : ''} onClick={() => updateFile(selectedFile, 'read')} title="Als gelesen markieren"><CheckCircle2 size={17} /> {selectedFile.state?.read ? 'Gelesen' : 'Als gelesen'}</button><button className={selectedFile.state?.favorite ? 'active' : ''} onClick={() => updateFile(selectedFile, 'favorite')} title="Favorit"><Star size={17} fill={selectedFile.state?.favorite ? 'currentColor' : 'none'} /></button><button onClick={() => action('download', selectedFile)} title="Herunterladen / Kopie speichern"><Download size={17} /></button><button onClick={() => action('open', selectedFile)} title="In Standard-App öffnen"><ExternalLink size={17} /></button></div><div className="reader-body"><Preview file={selectedFile} autoPlay={autoPlayVideoId === selectedFile.id} onWatched={markVideoWatched} onNext={playNextVideo} /></div><div className="reader-footer"><button onClick={() => action('reveal', selectedFile)}><Folder size={16} /> Im Ordner anzeigen</button><span>Lokale Datei</span></div></Reader>}
      </div>
    </div>
    {nextcloudOpen && <NextcloudDialog status={nextcloud} localRoot={overview.root} onStatus={setNextcloud}
      onConfigured={() => { setView('home'); setCourseId(null); setSelectedFile(null); setSearchInput(''); setReload(value => value + 1); }} onClose={() => setNextcloudOpen(false)} />}
    {settingsOpen && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setSettingsOpen(false); }}><div className="settings-modal" role="dialog" aria-modal="true" aria-label="Einstellungen"><div className="modal-heading"><div><span className="eyebrow">DEIN KURSRAUM</span><h2>Einstellungen</h2></div><button className="icon-button" onClick={() => setSettingsOpen(false)} aria-label="Schließen"><X size={20} /></button></div><div className="setting-block"><h3>Darstellung</h3><p>Wähle ein angenehmes Erscheinungsbild.</p><div className="theme-options"><button className={settings.theme === 'dark' ? 'selected' : ''} onClick={() => updateSetting('theme', 'dark')}><Moon size={20} /> Dunkel</button><button className={settings.theme === 'light' ? 'selected' : ''} onClick={() => updateSetting('theme', 'light')}><Sun size={20} /> Hell</button></div></div><div className="setting-block"><h3>Schriftgröße</h3><p>Gilt für die Benutzeroberfläche.</p><input aria-label="Schriftgröße" type="range" min="0.85" max="1.3" step="0.05" value={settings.fontScale} onChange={e => updateSetting('fontScale', Number(e.target.value))} /><span>{Math.round(settings.fontScale * 100)} %</span></div><div className="setting-block"><h3>Nextcloud</h3><p>Kursdateien direkt mit deiner Nextcloud synchronisieren.</p><button type="button" className="cloud-secondary" onClick={() => { setSettingsOpen(false); setNextcloudOpen(true); }}><Cloud size={18} /> Nextcloud einrichten</button></div><div className="setting-block"><h3>Sprache</h3><p>Deutsch · weitere Sprachen sind derzeit nicht verfügbar.</p></div><div className="setting-local"><HardDrive size={18} /> Offline verfügbar · Notizen bleiben auf diesem Gerät.</div></div></div>}
  </div>;
}
