import React, { useEffect, useRef } from 'react';

export default function Reader({ video, onClose, children }) {
  const dialog = useRef(null);

  useEffect(() => {
    if (!video) return;
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, [video]);

  if (!video) return <aside className="reader" aria-label="Dateivorschau">{children}</aside>;
  return <dialog ref={dialog} className="reader video-reader" aria-labelledby="reader-title"
    onCancel={event => { event.preventDefault(); onClose(); }}>
    {children}
  </dialog>;
}
