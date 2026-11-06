import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Star, UploadCloud, FileText, CheckCircle2, AlertCircle, Info, Calculator, Atom, FlaskConical, Dna, BookOpen, Languages, Landmark, Globe2, Monitor, Receipt, BarChart3, Palette, GraduationCap, Inbox } from 'lucide-react';
import { uploadFile } from '../lib/api.js';
import { initials } from '../lib/format.js';

export const subjectIcons = { Calculator, Atom, FlaskConical, Dna, BookOpen, Languages, Landmark, Globe2, Monitor, Receipt, BarChart3, Palette };
export function SubjectIcon({ name, size = 16 }) { const Icon = subjectIcons[name] || GraduationCap; return <Icon size={size} />; }

export function Logo({ light = false, small = false }) {
  return (
    <span className="brand" style={light ? { color: '#fff' } : undefined}>
      <span className="brand-mark" style={light ? { background: '#fff', color: 'var(--green)' } : undefined}>E</span>
      <span>EDUCA{small ? <small>APRENDER · MOÇAMBIQUE</small> : <small>APRENDER · MOÇAMBIQUE</small>}</span>
    </span>
  );
}
export function Avatar({ name, src, size = '', tone = '', alt }) {
  return <span className={`avatar ${size} ${tone}`}>{src ? <img src={src} alt={alt || name || 'Avatar'} /> : initials(name)}</span>;
}
export function Stars({ value = 0, count, size = 13 }) {
  const v = Number(value) || 0;
  return (
    <span className="stars" aria-label={`${v} de 5 estrelas`}>
      {[1,2,3,4,5].map(i => <Star key={i} size={size} className={i <= Math.round(v) ? '' : 'off'} fill={i <= Math.round(v) ? 'currentColor' : 'none'} />)}
      {count !== undefined && <span className="tiny muted" style={{ marginLeft: 4, fontWeight: 700 }}>{count} avaliação{count === 1 ? '' : 'ões'}</span>}
    </span>
  );
}
export function StarsInput({ value, onChange }) {
  return <div className="stars" style={{ gap: 4 }}>{[1,2,3,4,5].map(i => (
    <button type="button" key={i} onClick={() => onChange(i)} aria-label={`${i} estrelas`} style={{ border: 0, background: 'transparent', padding: 0, color: i <= value ? 'var(--orange)' : '#d9d3c8' }}>
      <Star size={26} fill={i <= value ? 'currentColor' : 'none'} />
    </button>
  ))}</div>;
}
const statusMap = {
  pending: ['badge-orange', 'Pendente'], paid: ['badge-green', 'Pago'], completed: ['badge-blue', 'Concluída'], cancelled: ['badge-red', 'Cancelada'], refunded: ['badge-purple', 'Reembolsada'],
  confirmed: ['badge-green', 'Confirmado'], rejected: ['badge-red', 'Rejeitado'], published: ['badge-green', 'Publicada'], draft: ['badge-gray', 'Rascunho'],
  approved: ['badge-green', 'Aprovado'], open: ['badge-orange', 'Aberto'], resolved: ['badge-green', 'Resolvido'], active: ['badge-green', 'Activo'], suspended: ['badge-red', 'Suspenso'],
  awaiting_payment: ['badge-orange', 'Aguardando pagamento'], in_progress: ['badge-blue', 'Em andamento'], booked: ['badge-purple', 'Reservada'], visible: ['badge-green', 'Visível'], hidden: ['badge-gray', 'Oculta']
};
export function StatusBadge({ status, label }) {
  const [tone, text] = statusMap[status] || ['badge-gray', status || '—'];
  return <span className={`badge ${tone}`}><span className="dot" />{label || text}</span>;
}
export function Badge({ children, tone = 'gray', dot = false }) { return <span className={`badge badge-${tone}`}>{dot && <span className="dot" />}{children}</span>; }
export function Spinner({ large = false }) { return <span className={`spinner ${large ? 'lg' : ''}`} aria-label="A carregar" />; }
export function LoadingRow({ label = 'A carregar…' }) { return <div className="loading-row"><Spinner /> {label}</div>; }
export function Field({ label, children, help, error, htmlFor }) {
  return <div className="field"><label className="label" htmlFor={htmlFor}>{label}</label>{children}{help && !error && <span className="help">{help}</span>}{error && <span className="error-text">{error}</span>}</div>;
}
export function EmptyState({ icon: Icon = Inbox, title, description, action }) {
  return <div className="empty"><div className="icon-wrap"><Icon size={22} /></div><h3>{title}</h3>{description && <p>{description}</p>}{action}</div>;
}
export function StatCard({ label, value, note, tone = '', icon: Icon }) {
  return <div className={`stat-card ${tone}`}><div className="stat-label">{Icon && <Icon size={13} />}{label}</div><div className="stat-value">{value}</div>{note && <div className="stat-note">{note}</div>}</div>;
}
export function SectionHead({ eyebrow, title, description, action }) {
  return <div className="section-head"><div>{eyebrow && <div className="eyebrow" style={{ marginBottom: 8 }}>{eyebrow}</div>}<h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</div>;
}
export function InfoRow({ label, children }) { return <div className="info-row"><span>{label}</span><span>{children}</span></div>; }
export function Tabs({ tabs, active, onChange }) {
  return <div className="tabs">{tabs.map(t => <button key={t.id} type="button" className={`tab ${active === t.id ? 'active' : ''}`} onClick={() => onChange(t.id)}>{t.label}{t.count !== undefined ? ` (${t.count})` : ''}</button>)}</div>;
}
export function Modal({ open, onClose, title, subtitle, children, footer, wide = false }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('modal-open');
    return () => { document.removeEventListener('keydown', onKey); document.body.classList.remove('modal-open'); };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head"><div><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</div><button className="icon-btn sm" onClick={onClose} aria-label="Fechar"><X size={16} /></button></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>, document.body);
}
export function ConfirmModal({ open, onClose, onConfirm, title, description, confirmLabel = 'Confirmar', danger = false, children, busy = false }) {
  return <Modal open={open} onClose={onClose} title={title} subtitle={description} footer={<><button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancelar</button><button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm} disabled={busy}>{busy ? <Spinner /> : null}{confirmLabel}</button></>}>{children}</Modal>;
}
export function FileUpload({ label = 'Carregar ficheiro', file, onChange, accept = 'image/*,.pdf,.doc,.docx', help = 'JPG, PNG, WEBP, PDF ou DOC/DOCX até 5 MB.', visibility = 'private' }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const handle = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    setError(''); setUploading(true);
    try { const data = await uploadFile(f, visibility); onChange?.(data); } catch (err) { setError(err.message); } finally { setUploading(false); }
  };
  return (
    <div className="field">
      <span className="label">{label}</span>
      <input ref={inputRef} type="file" accept={accept} onChange={handle} style={{ display: 'none' }} />
      <button type="button" className="btn btn-outline" onClick={() => inputRef.current?.click()} disabled={uploading} style={{ justifyContent: 'flex-start' }}>
        {uploading ? <Spinner /> : <UploadCloud size={16} />} {uploading ? 'A carregar…' : file ? 'Substituir ficheiro' : 'Escolher ficheiro'}
      </button>
      {file && <div className="flex gap-8 align-center tiny muted"><FileText size={14} /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.filename}</span><a href={file.url} target="_blank" rel="noreferrer" className="link-arrow" style={{ fontSize: '.72rem' }}>abrir</a></div>}
      {error && <span className="error-text">{error}</span>}
      {!error && <span className="help">{help}</span>}
    </div>
  );
}
const ToastContext = createContext(null);
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const toast = useCallback((message, type = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4200);
  }, []);
  return <ToastContext.Provider value={toast}>{children}<div className="toast-wrap">{toasts.map(t => <div key={t.id} className={`toast ${t.type}`}>{t.type === 'success' ? <CheckCircle2 size={16} /> : t.type === 'error' ? <AlertCircle size={16} /> : <Info size={16} />}<span>{t.message}</span></div>)}</div></ToastContext.Provider>;
}
export const useToast = () => useContext(ToastContext);
