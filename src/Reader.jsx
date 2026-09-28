import React, { useEffect, useRef } from 'react';

export default function Reader({ video, onClose, children }) {
  const dialog = useRef(null);
  const fullscreenActive = useRef(false);
  const fullscreenExitedAt = useRef(-Infinity);

  useEffect(() => {
    if (!video) return;
    const element = dialog.current;
    const fullscreenChanged = () => {
      const active = Boolean(document.fullscreenElement);
      if (fullscreenActive.current && !active) fullscreenExitedAt.current = performance.now();
      fullscreenActive.current = active;
    };
    document.addEventListener('fullscreenchange', fullscreenChanged);
    element.showModal();
    return () => {
      document.removeEventListener('fullscreenchange', fullscreenChanged);
      element.close();
    };
  }, [video]);

  if (!video) return <aside className="reader" aria-label="Dateivorschau">{children}</aside>;
  return <dialog ref={dialog} className="reader video-reader" aria-labelledby="reader-title"
    onCancel={event => {
      event.preventDefault();
      // Chromium may send the dialog's cancel event together with fullscreen exit.
      if (document.fullscreenElement) {
        void document.exitFullscreen().catch(() => {});
        return;
      }
      if (fullscreenActive.current || performance.now() - fullscreenExitedAt.current < 300) return;
      onClose();
    }}>
    {children}
  </dialog>;
}
