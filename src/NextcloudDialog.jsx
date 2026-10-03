import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, ChevronRight, Cloud, Folder, FolderOpen, RefreshCw, X } from 'lucide-react';
const api = window.kursraum;
const phaseNames = { scanning: 'Ordner werden verglichen …', syncing: 'Dateien werden abgeglichen …', uploading: 'Datei wird hochgeladen …', downloading: 'Datei wird heruntergeladen …', done: 'Abgleich abgeschlossen', conflicts: 'Abgleich mit Dateikonflikten beendet', cancelled: 'Synchronisierung angehalten', error: 'Synchronisierung fehlgeschlagen' };

function VideoModePicker({ value, onChange, disabled }) {
  return <fieldset className="cloud-video-mode" disabled={disabled}><legend>Wie möchtest du Videos nutzen?</legend>
    <label><input type="radio" name="cloud-video-mode" value="download" checked={value === 'download'} onChange={() => onChange('download')} /><span><strong>Videos lokal synchronisieren</strong><small>Videos herunterladen und auch offline ansehen.</small></span></label>
    <label><input type="radio" name="cloud-video-mode" value="stream" checked={value === 'stream'} onChange={() => onChange('stream')} /><span><strong>Videos direkt aus der Cloud streamen</strong><small>Beim Ansehen abrufen, ohne neue Videodateien auf diesem Gerät zu speichern.</small></span></label>
    {value === 'stream' && <p className="cloud-help">Für die Wiedergabe ist eine Internetverbindung nötig. Begleitmaterial wird weiterhin synchronisiert. Bereits vorhandene lokale Videos bleiben erhalten.</p>}
  </fieldset>;
}

export default function NextcloudDialog({ status, localRoot, onStatus, onConfigured, onClose }) {
  const dialog = useRef(null);
  const [serverUrl, setServerUrl] = useState(status.serverUrl || '');
  const [username, setUsername] = useState(status.username || '');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [videoMode, setVideoMode] = useState(status.videoMode || 'download');
  useEffect(() => setVideoMode(status.videoMode || 'download'), [status.videoMode]);
  const [autoSync, setAutoSync] = useState(status.autoSync ?? true);
  const [editing, setEditing] = useState(!status.configured || !status.authenticated);
  const [listing, setListing] = useState(null);
  const [localPath, setLocalPath] = useState(localRoot || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);
  const run = async action => {
    setBusy(true); setError('');
    try { await action(); } catch (err) { setError(err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')); }
    finally { setBusy(false); }
  };
  const browse = remotePath => run(async () => setListing(await api.nextcloudBrowse(remotePath)));
  const login = event => {
    event.preventDefault();
    void run(async () => {
      setListing(await api.nextcloudLogin({ serverUrl, username, password, remember: remember && status.canSavePassword }));
      setPassword('');
    });
  };
  const connect = () => run(async () => {
    const next = await api.nextcloudConfigure({ remotePath: listing.path, autoSync, videoMode });
    onStatus(next); onConfigured(); setEditing(false); setListing(null);
  });
  const chooseLocal = () => run(async () => { const selected = await api.nextcloudChooseLocal(); if (selected) setLocalPath(selected); });
  return <dialog ref={dialog} className="nextcloud-dialog" aria-labelledby="nextcloud-title"
    onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="modal-heading"><div><span className="eyebrow">DEINE KURSE. DEINE CLOUD.</span><h2 id="nextcloud-title"><Cloud size={26} /> Nextcloud</h2></div><button type="button" className="icon-button" aria-label="Nextcloud schließen" onClick={onClose}><X size={20} /></button></div>
    <p className="cloud-intro">Verbinde deine Kurse mit Nextcloud. Du entscheidest, ob Videos lokal verfügbar sein sollen oder direkt aus der Cloud abgespielt werden.</p>
    {error && <p className="cloud-error" role="alert">{error}</p>}
    {editing ? <>
      {!listing ? <form onSubmit={login} className="cloud-login">
        <label>Nextcloud-Adresse<input type="url" autoComplete="url" placeholder="https://cloud.example.de" required value={serverUrl} onChange={event => setServerUrl(event.target.value)} disabled={busy} /></label>
        <label>Benutzername<input autoComplete="username" required value={username} onChange={event => setUsername(event.target.value)} disabled={busy} /></label>
        <label>App-Passwort<input type="password" autoComplete="off" required value={password} onChange={event => setPassword(event.target.value)} disabled={busy} /></label>
        <p className="cloud-help">Erstelle das App-Passwort in Nextcloud unter „Persönliche Einstellungen → Sicherheit“.</p>
        {status.canSavePassword ? <label className="cloud-checkbox"><input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)} /> Anmeldung geschützt auf diesem Gerät speichern</label>
          : <p className="cloud-help">Das Passwort bleibt für diese Sitzung im Speicher. Nach einem Neustart meldest du dich erneut an.</p>}
        <button className="primary-button" type="submit" disabled={busy}>{busy ? 'Verbindung wird geprüft …' : 'Anmelden und Ordner auswählen'}<ChevronRight size={17} /></button>
      </form> : <div className="cloud-setup">
        <div className="cloud-account"><CheckCircle2 size={17} /><span>Angemeldet als {username || status.username}</span></div>
        <h3>Ordner in Nextcloud auswählen</h3>
        <div className="cloud-browser" aria-busy={busy}>
          <div className="cloud-browser-path"><button type="button" className="icon-button" aria-label="Übergeordneten Nextcloud-Ordner öffnen" disabled={busy || !listing.path} onClick={() => browse(listing.path.split('/').slice(0, -1).join('/'))}><ArrowLeft size={18} /></button><span title={`/${listing.path}`}>/{listing.path || 'Alle Dateien'}</span></div>
          <div className="cloud-folder-list">
            {listing.folders.map(folder => <button type="button" key={folder.path} disabled={busy} onClick={() => browse(folder.path)}><Folder size={19} /><span>{folder.name}</span><ChevronRight size={17} /></button>)}
            {!listing.folders.length && <p>Keine Unterordner. Du kannst diesen Ordner verwenden.</p>}
          </div>
        </div>
        <p className="cloud-selection">Ausgewählter Cloud-Ordner: <strong>/{listing.path || ''}</strong></p>
        <VideoModePicker value={videoMode} onChange={setVideoMode} disabled={busy} />
        <h3>{videoMode === 'stream' ? 'Ordner für Begleitmaterial' : 'Lokaler Kursordner'}</h3>
        <p className="cloud-path">{localPath || (videoMode === 'stream' ? 'Kursraum legt automatisch einen Ordner für Begleitmaterial an.' : 'Noch keinen lokalen Ordner ausgewählt')}</p>
        <button type="button" className="cloud-secondary" onClick={chooseLocal} disabled={busy}><FolderOpen size={17} /> Lokalen Ordner auswählen</button>
        <p className="cloud-help">Die direkten Unterordner werden zu Kursen. {videoMode === 'stream' ? 'Begleitmaterial wird in beide Richtungen übertragen; Videos bleiben vom Datei-Abgleich ausgenommen.' : 'Neue und geänderte Dateien werden in beide Richtungen übertragen.'} Löschungen werden nicht übertragen; fehlende Dateien werden wieder ergänzt.</p>
        <label className="cloud-checkbox"><input type="checkbox" checked={autoSync} onChange={event => setAutoSync(event.target.checked)} disabled={busy} /> Alle 5 Minuten abgleichen, solange Kursraum geöffnet ist</label>
        <button type="button" className="primary-button" disabled={busy || (videoMode === 'download' && !localPath)} onClick={connect}><RefreshCw size={17} /> {busy ? 'Ordner werden verbunden …' : videoMode === 'stream' ? 'Verbinden und Videos streamen' : 'Ordner verbinden und synchronisieren'}</button>
      </div>}
    </> : <div className="cloud-connected">
      <div className="cloud-account"><CheckCircle2 size={18} /><span>{status.username} · {status.serverUrl}</span></div>
      <dl className="cloud-locations"><div><dt>Nextcloud</dt><dd>/{status.remotePath}</dd></div><div><dt>Auf diesem Gerät</dt><dd>{status.localRoot}</dd></div></dl>
      <VideoModePicker value={videoMode} onChange={setVideoMode} disabled={busy || status.running} />
      {videoMode !== (status.videoMode || 'download') && <button type="button" className="primary-button" disabled={busy || status.running} onClick={() => run(async () => { onStatus(await api.nextcloudVideoMode(videoMode)); onConfigured(); })}>Videomodus speichern</button>}
      {status.videoMode === 'stream' && <p className="cloud-stream-summary"><Cloud size={16} /> {status.cloudVideoCount || 0} Videos zum direkten Streamen · keine automatischen Videodownloads</p>}
      <div className="cloud-sync-status" aria-live="polite">
        <strong>{phaseNames[status.phase] || 'Ordner verbunden'}</strong>
        {status.running && <><p className="cloud-current" title={status.current}>{status.current || 'Kursordner werden eingelesen.'}</p><progress aria-label="Synchronisierungsfortschritt" max={status.total || 1} {...(status.total ? { value: status.completed } : {})} /><p>{status.completed} / {status.total || '…'} Dateien{status.size > 0 ? ` · ${Math.min(100, Math.round(100 * status.bytes / status.size))} % der aktuellen Datei` : ''}</p></>}
        {status.result && <p>{status.result.uploaded} hochgeladen · {status.result.downloaded} heruntergeladen · {status.result.unchanged} unverändert</p>}
        {status.phase === 'cancelled' && <p>Bereits vollständig übertragene Dateien bleiben erhalten.</p>}
        {!status.running && status.lastSync && <p>Letzter Abgleich: {new Date(status.lastSync).toLocaleString('de-DE')}</p>}
      </div>
      {status.error && <p className="cloud-error" role="alert">{status.error}</p>}
      {status.result?.conflicts.length > 0 && <details className="cloud-conflicts" open><summary>{status.result.conflicts.length} Dateikonflikte</summary><p>Diese Dateien unterscheiden sich auf beiden Seiten. Beide Versionen bleiben erhalten. Benenne eine Version um und starte den Abgleich erneut.</p><ul>{status.result.conflicts.map(name => <li key={name}>{name}</li>)}</ul></details>}
      <p className="cloud-help">{status.autoSync ? 'Automatischer Abgleich alle 5 Minuten, solange dieser Kursordner geöffnet ist.' : 'Manueller Abgleich aktiviert.'} Lesestatus, Favoriten und Notizen bleiben auf diesem Gerät.</p>
      <div className="cloud-buttons">
        {status.running ? <button type="button" className="cloud-secondary" disabled={busy} onClick={() => run(async () => onStatus(await api.nextcloudCancel()))}>Synchronisierung stoppen</button>
          : <button type="button" className="primary-button" disabled={busy} onClick={() => run(async () => onStatus(await api.nextcloudSync()))}><RefreshCw size={17} /> Jetzt synchronisieren</button>}
        <button type="button" className="cloud-secondary" disabled={busy || status.running} onClick={() => run(async () => { setListing(await api.nextcloudBrowse(status.remotePath)); setEditing(true); setLocalPath(localRoot || ''); })}>Ordner ändern</button>
        <button type="button" className="cloud-disconnect" disabled={busy || status.running} onClick={() => run(async () => { onStatus(await api.nextcloudDisconnect()); setEditing(true); setListing(null); })}>Verbindung entfernen</button>
      </div>
    </div>}
  </dialog>;
}
