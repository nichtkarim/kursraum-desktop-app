import { useEffect, useState } from 'react';

const api = window.kursraum;

export default function useVideoProgress(video, id, loadAttempt) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const element = video.current;
    let alive = true, loaded = false, restored = false, restoring = false;
    let position = 0, lastSent = null, lastWrite = 0;
    let pending = Promise.resolve(true);
    setReady(false);

    const persist = () => {
      if (!restored || position === lastSent) return pending;
      const value = position;
      lastSent = value;
      lastWrite = Date.now();
      pending = api.setVideoProgress(id, value).then(() => {
        if (alive) setError('');
        return true;
      }).catch(() => {
        if (lastSent === value) lastSent = null;
        if (alive) setError('Die Videoposition konnte nicht gespeichert werden. Bitte prüfe den verfügbaren Speicherplatz.');
        return false;
      });
      return pending;
    };
    const capture = () => {
      if (!restored || restoring || element.readyState < 1 || element.error || !Number.isFinite(element.currentTime)) return;
      position = element.ended ? 0 : Math.max(0, element.currentTime);
    };
    const save = () => { capture(); void persist(); };
    const tick = () => {
      capture();
      if (Date.now() - lastWrite >= 5000) void persist();
    };
    const restore = () => {
      if (!alive || !loaded || restored || element.readyState < 1) return;
      // Replaced/shortened files must not jump straight to their end.
      if (Number.isFinite(element.duration) && position >= element.duration) position = 0;
      try {
        if (position > 0) { restoring = true; element.currentTime = position; }
        restored = true;
        lastSent = position;
        lastWrite = Date.now();
        setReady(true);
      } catch {
        restoring = false; // Retry when the media becomes seekable.
      }
    };
    const seeked = () => { restoring = false; save(); };
    const ended = () => { restoring = false; position = 0; void persist(); };
    const emptied = () => { restoring = true; };
    const listeners = { loadedmetadata: restore, durationchange: restore, canplay: restore,
      timeupdate: tick, pause: save, seeked, ended, emptied };
    for (const [name, listener] of Object.entries(listeners)) element.addEventListener(name, listener);
    const unsubscribeFlush = api.onVideoProgressFlush(() => { capture(); return persist(); });
    api.videoProgress(id).then(value => {
      if (!alive) return;
      position = value; loaded = true; restore();
    }).catch(() => {
      if (alive) { setError('Die gespeicherte Videoposition konnte nicht geladen werden.'); setReady(true); }
    });
    return () => {
      // React may already have detached or reloaded the media element here.
      // Use the last observed position, never a reset currentTime of zero.
      void persist();
      alive = false;
      for (const [name, listener] of Object.entries(listeners)) element.removeEventListener(name, listener);
      unsubscribeFlush();
    };
  }, [video, id, loadAttempt]);

  return { ready, error };
}
