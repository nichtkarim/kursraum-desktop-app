import React, { useEffect, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import mammoth from 'mammoth/mammoth.browser';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { ChevronLeft, ChevronRight, FileWarning } from 'lucide-react';

GlobalWorkerOptions.workerSrc = pdfWorker;
const api = window.kursraum;

function DocumentPreview({ file }) {
  const [state, setState] = useState({ loading: true, error: null, html: '', text: '' });
  useEffect(() => {
    const abort = new AbortController();
    let alive = true;
    setState({ loading: true, error: null, html: '', text: '' });
    const max = file.kind === 'docx' ? 12 * 1024 * 1024 : 8 * 1024 * 1024;
    if (file.size > max) {
      setState({ loading: false, error: `Vorschau auf ${Math.round(max / 1024 / 1024)} MB begrenzt. Bitte extern öffnen.`, html: '', text: '' });
      return () => abort.abort();
    }
    (async () => {
      const response = await fetch(api.mediaUrl(file.id), { signal: abort.signal });
      if (!response.ok) throw new Error('Datei konnte nicht gelesen werden.');
      if (file.kind === 'docx') {
        const result = await mammoth.convertToHtml({ arrayBuffer: await response.arrayBuffer() });
        if (alive) setState({ loading: false, error: null,
          html: DOMPurify.sanitize(result.value, { FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form'] }), text: '' });
      } else {
        const text = await response.text();
        if (alive) setState({ loading: false, error: null,
          html: file.kind === 'markdown' ? DOMPurify.sanitize(marked.parse(text), { FORBID_TAGS: ['img', 'iframe', 'form', 'object'] }) : '',
          text: file.kind === 'text' ? text : '' });
      }
    })().catch(error => {
      if (alive && error.name !== 'AbortError') setState({ loading: false, error: error.message, html: '', text: '' });
    });
    return () => { alive = false; abort.abort(); };
  }, [file.id, file.kind, file.size]);
  if (state.loading) return <div className="preview-placeholder">Dokument wird geladen …</div>;
  if (state.error) return <PreviewError message={state.error} />;
  if (file.kind === 'text') return <pre className="plaintext-preview">{state.text}</pre>;
  return <div className="document-html" onClick={event => {
    if (event.target.closest('a')) event.preventDefault();
  }} dangerouslySetInnerHTML={{ __html: state.html }} />;
}

function PdfPreview({ file }) {
  const canvas = useRef(null);
  const host = useRef(null);
  const pdfRef = useRef(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const task = getDocument({ url: api.mediaUrl(file.id) });
    task.promise.then(pdf => {
      if (!alive) return;
      pdfRef.current = pdf;
      setTotal(pdf.numPages);
    }).catch(err => { if (alive) { setError(err.message || 'PDF konnte nicht geöffnet werden.'); setLoading(false); } });
    return () => { alive = false; pdfRef.current = null; void task.destroy(); };
  }, [file.id]);

  useEffect(() => {
    if (!total || !pdfRef.current) return;
    let alive = true;
    let renderTask;
    setLoading(true);
    (async () => {
      const pdfPage = await pdfRef.current.getPage(page);
      if (!alive || !canvas.current) return;
      const natural = pdfPage.getViewport({ scale: 1 });
      const available = Math.max(280, (host.current?.clientWidth || 640) - 28);
      const scale = Math.min(2, available / natural.width);
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const view = pdfPage.getViewport({ scale: scale * ratio });
      const element = canvas.current;
      element.width = Math.floor(view.width);
      element.height = Math.floor(view.height);
      element.style.width = `${Math.floor(view.width / ratio)}px`;
      element.style.height = `${Math.floor(view.height / ratio)}px`;
      renderTask = pdfPage.render({ canvasContext: element.getContext('2d'), viewport: view });
      await renderTask.promise;
      if (alive) setLoading(false);
    })().catch(err => {
      if (alive && err.name !== 'RenderingCancelledException') { setError(err.message || 'PDF konnte nicht angezeigt werden.'); setLoading(false); }
    });
    return () => { alive = false; if (renderTask) renderTask.cancel(); };
  }, [file.id, page, total]);

  return <div className="pdf-preview" ref={host}>
    <div className="pdf-controls">
      <button type="button" aria-label="Vorherige Seite" disabled={page <= 1} onClick={() => setPage(n => n - 1)}><ChevronLeft size={18} /></button>
      <span>Seite {page} {total ? `von ${total}` : ''}</span>
      <button type="button" aria-label="Nächste Seite" disabled={!total || page >= total} onClick={() => setPage(n => n + 1)}><ChevronRight size={18} /></button>
    </div>
    {error ? <PreviewError message={error} /> : <div className="pdf-canvas-wrap">{loading && <div className="preview-placeholder">PDF-Seite wird geladen …</div>}<canvas ref={canvas} /></div>}
  </div>;
}

function PreviewError({ message }) {
  return <div className="preview-placeholder"><FileWarning size={26} /><span>{message}</span></div>;
}

export default function Preview({ file }) {
  if (!file) return null;
  if (file.kind === 'image') return <div className="media-preview"><img src={api.mediaUrl(file.id)} alt={file.name} /></div>;
  if (file.kind === 'video') return <div className="media-preview"><video key={file.id} controls preload="metadata" src={api.mediaUrl(file.id)}>Dieses Videoformat wird von der Browser-Engine nicht unterstützt.</video><p>Falls das Video nicht startet, öffne es mit der Standard-App.</p></div>;
  if (file.kind === 'pdf') return <PdfPreview key={file.id} file={file} />;
  if (['text', 'markdown', 'docx'].includes(file.kind)) return <DocumentPreview key={file.id} file={file} />;
  return <PreviewError message="Für diesen Dateityp gibt es keine integrierte Vorschau. Du kannst die Datei öffnen oder herunterladen." />;
}
