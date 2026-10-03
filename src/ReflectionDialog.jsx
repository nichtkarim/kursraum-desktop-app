import React, { useEffect, useRef, useState } from 'react';
import { BookOpen, CheckCircle2, Lightbulb, Plus, Trash2, X } from 'lucide-react';

export default function ReflectionDialog({ target, completing, onSave, onClose }) {
  const dialog = useRef(null);
  const isVideo = target.kind === 'video';
  const [points, setPoints] = useState(() => target.state?.learningPoints?.length ? [...target.state.learningPoints] : ['', '']);
  const [serviceIdea, setServiceIdea] = useState(target.state?.serviceIdea || '');
  const [serviceAudience, setServiceAudience] = useState(target.state?.serviceAudience || '');
  const [serviceNextStep, setServiceNextStep] = useState(target.state?.serviceNextStep || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const cleaned = points.map(point => point.trim()).filter(Boolean);
  const duplicates = new Set(cleaned.map(point => point.normalize('NFKC').toLocaleLowerCase('de'))).size !== cleaned.length;
  const pointsValid = cleaned.length >= 2 && !duplicates;
  const ideaValid = Boolean(serviceIdea.trim());
  const valid = pointsValid && (!isVideo || ideaValid);

  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement;
    element.showModal();
    return () => { element.close(); if (previous?.isConnected) previous.focus(); };
  }, []);

  const submit = async event => {
    event.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    setError('');
    try {
      await onSave({ learningPoints: cleaned, ...(isVideo ? { serviceIdea: serviceIdea.trim(), serviceAudience: serviceAudience.trim(), serviceNextStep: serviceNextStep.trim() } : {}) });
    } catch (e) { setError(e.message); setSaving(false); }
  };

  return <dialog ref={dialog} className="reflection-dialog" aria-labelledby="reflection-title" aria-describedby="reflection-description"
    onCancel={event => { event.preventDefault(); if (!saving) onClose(); }}>
    <form onSubmit={submit}>
      <div className="modal-heading"><div><span className="eyebrow"><BookOpen size={14} /> {isVideo ? 'DEINE VIDEOREFLEXION' : 'DEINE REFLEXION'}</span><h2 id="reflection-title">{isVideo ? 'Vom Lernen zur eigenen Idee' : 'Was hast du gelernt?'}</h2></div>
        <button type="button" className="icon-button" aria-label="Reflexion schließen" disabled={saving} onClick={onClose}><X size={20} /></button></div>
      <p className="reflection-context">{target.courseName && <span>{target.courseName} · </span>}{target.name}</p>
      <p id="reflection-description">{isVideo ? 'Halte mindestens zwei Erkenntnisse aus dem Video fest und überlege, welche Dienstleistung du damit theoretisch anbieten könntest.' : 'Hier kannst du deine gespeicherten Lernpunkte wieder ansehen und ergänzen.'}</p>
      <div className="reflection-checklist" aria-label="Stand der Reflexion">
        <span className={pointsValid ? 'fulfilled' : ''}><CheckCircle2 size={16} /> Mindestens 2 Lernpunkte</span>
        {isVideo && <span className={ideaValid ? 'fulfilled' : ''}><Lightbulb size={16} /> Eine Dienstleistungsidee</span>}
      </div>
      <fieldset disabled={saving} className="reflection-fields">
        <legend>{isVideo ? '1. Was nehme ich aus dem Video mit?' : 'Meine Lernpunkte'}</legend>
        <p className="reflection-section-hint">Beschreibe in eigenen Worten, was du verstanden hast oder jetzt anwenden kannst.</p>
        {points.map((point, index) => <div className="reflection-field" key={index}>
          <div><label htmlFor={`learning-point-${index}`}>Lernpunkt {index + 1}</label><textarea id={`learning-point-${index}`} value={point} maxLength={2000} rows={2}
            placeholder={index === 0 ? 'Ich habe gelernt, dass …' : index === 1 ? 'Außerdem kann ich jetzt …' : 'Ein weiterer Lernpunkt …'}
            onChange={event => setPoints(current => current.map((value, i) => i === index ? event.target.value : value))} /></div>
          {points.length > 2 && <button type="button" className="icon-button" aria-label={`Lernpunkt ${index + 1} entfernen`} onClick={() => setPoints(current => current.filter((_, i) => i !== index))}><Trash2 size={17} /></button>}
        </div>)}
        <button type="button" className="secondary-button" disabled={points.length >= 100} onClick={() => setPoints(current => [...current, ''])}><Plus size={16} /> Weiteren Lernpunkt hinzufügen</button>
      </fieldset>
      <p className="reflection-validation" role="status">{duplicates ? 'Bitte unterschiedliche Lernpunkte eintragen.' : `${cleaned.length} Lernpunkte · mindestens 2 erforderlich`}</p>
      {isVideo && <fieldset disabled={saving} className="reflection-fields reflection-idea-fields">
        <legend>2. Welche Dienstleistung könnte daraus entstehen?</legend>
        <p className="reflection-section-hint">Eine erste, theoretische Idee genügt. Welches Problem könntest du für andere lösen?</p>
        <div className="reflection-field"><div><label htmlFor="service-idea">Dienstleistungsidee (Pflichtfeld)</label><textarea id="service-idea" required value={serviceIdea} maxLength={4000} rows={3}
          placeholder="Mit diesem Wissen könnte ich anbieten, …" onChange={event => setServiceIdea(event.target.value)} /></div></div>
        <div className="reflection-optional-grid">
          <div className="reflection-field"><div><label htmlFor="service-audience">Für wen? (optional)</label><textarea id="service-audience" value={serviceAudience} maxLength={1000} rows={2}
            placeholder="Wer könnte davon profitieren?" onChange={event => setServiceAudience(event.target.value)} /></div></div>
          <div className="reflection-field"><div><label htmlFor="service-next-step">Erster Umsetzungsschritt (optional)</label><textarea id="service-next-step" value={serviceNextStep} maxLength={2000} rows={2}
            placeholder="Wie könnte ich die Idee ausprobieren?" onChange={event => setServiceNextStep(event.target.value)} /></div></div>
        </div>
      </fieldset>}
      {error && <p className="reflection-error" role="alert">{error}</p>}
      <p className="reflection-privacy">Lokal gespeichert. Unter „Reflexion & Ideen“ jederzeit nachlesen, durchsuchen und weiterentwickeln.</p>
      <div className="reflection-actions"><button type="button" className="secondary-button" disabled={saving} onClick={onClose}>{completing ? 'Noch nicht abschließen' : 'Schließen'}</button>
        <button type="submit" className="primary-button" disabled={!valid || saving}>{saving ? 'Wird gespeichert …' : completing ? 'Speichern & abschließen' : 'Änderungen speichern'}</button></div>
    </form>
  </dialog>;
}
