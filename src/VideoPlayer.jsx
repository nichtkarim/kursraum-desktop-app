import React, { useEffect, useRef, useState } from 'react';
import useVideoProgress from './useVideoProgress.js';
import { Maximize, Play, SkipForward } from 'lucide-react';

const api = window.kursraum;

export default function VideoPlayer({ file, autoPlay, onWatched, onNext, reflectionOpen }) {
  const video = useRef(null);
  const mounted = useRef(true);
  const finishing = useRef(false);
  const finishVersion = useRef(0);
  const [awaitingReflection, setAwaitingReflection] = useState(false);
  const [needsReflection, setNeedsReflection] = useState(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; finishVersion.current++; }; }, []);
  const [ended, setEnded] = useState(false);
  const [next, setNext] = useState({ loading: false, file: null, error: '' });
  const [countdown, setCountdown] = useState(null);
  const [playError, setPlayError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saveError, setSaveError] = useState('');
  const [fullscreenError, setFullscreenError] = useState('');
  const progress = useVideoProgress(video, file.id, loadAttempt);

  useEffect(() => {
    if (!autoPlay || !progress.ready) return;
    let alive = true;
    video.current.play().catch(error => {
      if (alive && error.name !== 'AbortError') {
        setPlayError('Automatischer Start nicht möglich. Starte das Video über die Wiedergabetaste.');
      }
    });
    return () => { alive = false; };
  }, [autoPlay, progress.ready]);

  useEffect(() => {
    if (!ended) return;
    let alive = true;
    setNext({ loading: true, file: null, error: '' });
    api.nextVideo(file.id).then(nextFile => {
      if (!alive) return;
      setNext({ loading: false, file: nextFile, error: '' });
      setCountdown(nextFile ? 10 : null);
    }).catch(error => {
      if (alive) setNext({ loading: false, file: null, error: `Nächstes Video konnte nicht geladen werden: ${error.message}` });
    });
    return () => { alive = false; };
  }, [ended, file.id]);

  useEffect(() => {
    if (reflectionOpen) { video.current.pause(); setCountdown(null); }
  }, [reflectionOpen]);

  useEffect(() => {
    if (reflectionOpen || countdown === null || !next.file) return;
    if (countdown === 0) {
      setCountdown(null);
      onNext(next.file);
      return;
    }
    const timer = setTimeout(() => setCountdown(value => value === null ? null : value - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown, next.file, onNext, reflectionOpen]);

  const toggleFullscreen = async () => {
    setFullscreenError('');
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await video.current.requestFullscreen();
    } catch {
      setFullscreenError('Vollbild konnte nicht geöffnet werden. Bitte erneut versuchen.');
    }
  };

  const stopCountdown = () => {
    finishVersion.current++;
    setCountdown(null);
    setEnded(false);
  };
  const finish = async () => {
    if (finishing.current) return;
    finishing.current = true;
    const version = ++finishVersion.current;
    setCountdown(null);
    setEnded(false);
    setAwaitingReflection(true);
    setSaveError('');
    try {
      // The reflection must be visible even when playback ended in native fullscreen.
      if (document.fullscreenElement) await document.exitFullscreen();
      if (!mounted.current) return;
      const completed = await onWatched(file);
      if (!mounted.current || version !== finishVersion.current) return;
      setNeedsReflection(!completed);
      setEnded(Boolean(completed));
    } catch (error) {
      if (mounted.current) {
        setNeedsReflection(true);
        setSaveError(`Lektion konnte nicht abgeschlossen werden: ${error.message}`);
      }
    } finally {
      finishing.current = false;
      if (mounted.current) setAwaitingReflection(false);
    }
  };

  return <div className={`media-preview video-preview ${ended ? 'is-ended' : ''}`}>
    <video ref={video} controls playsInline preload="metadata" src={`${api.mediaUrl(file.id)}${loadAttempt ? `?retry=${loadAttempt}` : ''}`}
      aria-label={file.name} onEnded={finish} onDoubleClick={toggleFullscreen}
      onPlay={() => { stopCountdown(); setPlayError(''); }} onSeeking={stopCountdown}
      onError={() => { stopCountdown(); setPlayError(file.source === 'nextcloud' ? 'Das Cloud-Video konnte nicht geladen werden. Prüfe deine Internetverbindung und die Nextcloud-Anmeldung. Schließe bei Bedarf die Vorschau und öffne Nextcloud in der Seitenleiste.' : 'Dieses Video konnte nicht abgespielt werden. Öffne es bei Bedarf mit der Standard-App.'); }}>
      Dieses Videoformat wird von der Browser-Engine nicht unterstützt.
    </video>
    <div className="video-view-actions"><button type="button" className="video-fullscreen-button" onClick={toggleFullscreen}><Maximize size={17} /> Vollbild</button><span>Auch per Doppelklick · Esc beendet Vollbild</span></div>
    {progress.error && <p className="video-message" role="alert">{progress.error}</p>}
    {fullscreenError && <p className="video-message" role="alert">{fullscreenError}</p>}
    {playError && <p className="video-message" role="alert">{playError}</p>}
    {playError && file.source === 'nextcloud' && <button type="button" className="video-fullscreen-button" onClick={() => { setPlayError(''); setLoadAttempt(value => value + 1); }}>Cloud-Video erneut laden</button>}
    {saveError && <p className="video-message" role="alert">{saveError}</p>}
    {(awaitingReflection || needsReflection) && !ended && <div className="video-reflection-prompt"><p>{awaitingReflection ? 'Halte deine Lernpunkte und eine mögliche Dienstleistungsidee fest, um das Video abzuschließen.' : 'Noch offen: mindestens zwei Lernpunkte und eine Dienstleistungsidee. Erst nach dem Speichern geht es automatisch weiter.'}</p><button type="button" className="primary-button" disabled={awaitingReflection} onClick={finish}>Video abschließen</button></div>}
    {ended && <div className="video-up-next">
      {next.loading ? <p role="status">Nächstes Video wird gesucht …</p>
        : next.error ? <p role="alert">{next.error}</p>
        : next.file ? <>
          <span className="video-countdown" aria-hidden="true">{countdown ?? <SkipForward size={24} />}</span>
          <div className="video-next-details">
            <p role="status">{countdown === null ? 'Automatische Wiedergabe angehalten' : `Nächstes Video in ${countdown} Sekunden`}</p>
            <strong>{next.file.name}</strong>
            <small>{next.file.chapterPath.split('/').join(' / ') || 'Kursstart'}</small>
          </div>
          <div className="video-next-actions">
            <button type="button" className="primary-button" onClick={() => { setCountdown(null); onNext(next.file); }}><Play size={16} /> Jetzt abspielen</button>
            {countdown !== null && <button type="button" className="video-cancel" onClick={() => setCountdown(null)}>Abbrechen</button>}
          </div>
        </> : <p role="status">Du hast das letzte Video dieses Kurses erreicht.</p>}
    </div>}
    {!ended && !playError && <p>Nach dem Ansehen mindestens zwei Lernpunkte und eine Dienstleistungsidee festhalten · Danach nächstes Video nach 10 Sekunden</p>}
  </div>;
}
