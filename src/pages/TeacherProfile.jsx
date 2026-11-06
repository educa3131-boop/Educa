import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { MapPin, Star, CalendarDays, Clock, Users, Video, MessageSquare, Flag, ArrowLeft, CheckCircle2, Wallet } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Avatar, Badge, EmptyState, Field, LoadingRow, Modal, Stars, StatusBadge, useToast, SubjectIcon } from '../components/ui.jsx';
import { formatDate, formatTime, formatMT, formatDuration, WEEKDAYS_SHORT, PHASE_LABELS } from '../lib/format.js';

export default function TeacherProfile() {
  const { id } = useParams(); const navigate = useNavigate(); const { user } = useAuth(); const toast = useToast();
  const [data, setData] = useState(null); const [loading, setLoading] = useState(true); const [reportOpen, setReportOpen] = useState(false); const [report, setReport] = useState({ reason: 'Conteúdo impróprio', details: '' }); const [busy, setBusy] = useState(false);
  useEffect(() => { api(`/teachers/${id}`).then(setData).catch(() => setData(null)).finally(() => setLoading(false)); }, [id]);
  const message = async () => {
    if (!user) return navigate(`/login?next=/professor/${id}`);
    try { const d = await api('/messages/conversations', { method: 'POST', body: { teacherId: id } }); navigate(`/mensagens?c=${d.conversation.id}`); } catch (e) { toast(e.message, 'error'); }
  };
  const sendReport = async () => {
    setBusy(true);
    try { await api('/student/reports', { method: 'POST', body: { targetType: 'teacher', targetId: id, ...report } }); toast('Denúncia enviada à equipa EDUCA.', 'success'); setReportOpen(false); setReport({ reason: 'Conteúdo impróprio', details: '' }); } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  if (loading) return <div className="container"><LoadingRow /></div>;
  if (!data) return <div className="container" style={{ padding: '40px 0' }}><EmptyState title="Professor não encontrado" description="Este perfil pode ter sido despublicado." action={<Link to="/professores" className="btn btn-primary">Ver professores</Link>} /></div>;
  const t = data.teacher;
  return (
    <div className="container" style={{ padding: '24px 0 64px' }}>
      <div className="breadcrumb"><Link to="/">Início</Link><span>/</span><Link to="/professores">Professores</Link><span>/</span><span style={{ color: 'var(--ink)', fontWeight: 700 }}>{t.name}</span></div>
      <div className="card card-pad" style={{ marginTop: 16, background: 'linear-gradient(135deg, var(--green) 0%, #14563f 100%)', color: '#fff', border: 0 }}>
        <div className="flex between align-center wrap gap-24">
          <div className="flex gap-16 align-center">
            <Avatar name={t.name} src={t.photoFileId ? `/api/files/${t.photoFileId}` : null} size="xl" />
            <div><div className="flex gap-8 align-center wrap"><h1 style={{ color: '#fff', fontSize: 'clamp(1.6rem,3.5vw,2.4rem)' }}>{t.name}</h1><Badge tone="orange" dot>Professor aprovado</Badge>{t.isDemo && <Badge tone="gray">Conta de demonstração</Badge>}</div><p style={{ color: '#c7ddd2', fontSize: '.9rem' }}>{t.headline}</p><div className="flex gap-16 wrap" style={{ marginTop: 8 }}><span className="flex align-center gap-6" style={{ fontSize: '.78rem' }}><MapPin size={14} />{t.city}</span><span className="flex align-center gap-6" style={{ fontSize: '.78rem' }}><Star size={14} fill="currentColor" style={{ color: 'var(--orange)' }} />{t.rating?.average || 0} ({t.rating?.count || 0} avaliações)</span><span className="flex align-center gap-6" style={{ fontSize: '.78rem' }}><Wallet size={14} />{formatMT(t.price)}/aula</span></div></div>
          </div>
          <div className="flex gap-8 wrap">
            <button className="btn btn-orange" onClick={message}><MessageSquare size={15} /> Enviar mensagem</button>
            <button className="btn btn-outline" style={{ borderColor: 'rgba(255,255,255,.3)', color: '#fff' }} onClick={() => setReportOpen(true)}><Flag size={15} /> Denunciar</button>
          </div>
        </div>
      </div>
      <div className="two-col" style={{ marginTop: 24 }}>
        <div className="detail-main">
          <div className="card detail-card"><h2>Sobre o professor</h2><p>{t.bio}</p><div className="flex gap-6 wrap" style={{ marginTop: 14 }}>{t.subjectNames?.map(s => <Badge key={s} tone="green">{s}</Badge>)}{t.levelNames?.map(l => <Badge key={l} tone="gray">{l}</Badge>)}</div></div>
          <div className="card detail-card"><div className="flex between align-center"><h2>Aulas disponíveis</h2><span className="badge badge-green">{data.lessons.length}</span></div>{data.lessons.length ? <div className="detail-list" style={{ marginTop: 14 }}>{data.lessons.map(l => <Link key={l.id} to={`/aula/${l.id}`} className="detail-list-item" style={{ color: 'inherit' }}><div className="grow"><strong>{l.title}</strong><span>{formatDate(l.start_at, { weekday: 'short', day: '2-digit', month: 'short' })} · {formatTime(l.start_at)} · {formatDuration(l.duration)} · {l.mode === 'individual' ? 'Individual' : `${l.seats} lugares`}</span></div><div style={{ textAlign: 'right' }}><div className="price">{formatMT(l.price)}</div><span className="tiny muted">{l.seatsLeft} lugar(es) livre(s)</span></div></Link>)}</div> : <EmptyState icon={CalendarDays} title="Sem aulas publicadas" description="Este professor ainda não publicou novas aulas. Segue o perfil para voltares mais tarde." />}</div>
          <div className="card detail-card"><div className="flex between align-center"><h2>Avaliações</h2><Stars value={t.rating?.average || 0} count={t.rating?.count} /></div>{data.reviews.length ? <div>{data.reviews.map((r, i) => <div className="review-item" key={i}><div className="review-head"><strong>{r.student_name}</strong><Stars value={r.rating} /></div><p>{r.comment || 'Sem comentário.'}</p><span className="tiny muted">{formatDate(r.created_at)} · {r.lesson_title}</span></div>)}</div> : <p className="muted small" style={{ marginTop: 12 }}>Ainda não há avaliações visíveis. As avaliações só são possíveis depois de uma aula concluída.</p>}</div>
        </div>
        <aside style={{ display: 'grid', gap: 16, position: 'sticky', top: 'calc(var(--header-h) + 16px)' }}>
          <div className="card card-pad"><h3>Disponibilidade semanal</h3><div className="availability-grid" style={{ marginTop: 12 }}>{WEEKDAYS_SHORT.map((d, i) => { const s = data.schedules.find(x => x.weekday === i); return <div key={d} className={`day-chip ${s ? 'active' : ''}`}><strong>{d}</strong>{s ? `${s.start_time}–${s.end_time}` : '—'}</div>; })}</div><p className="help" style={{ marginTop: 10 }}>A disponibilidade é indicativa. A aula é reservada no horário publicado.</p></div>
          <div className="card card-pad" style={{ background: 'var(--green-soft)', border: 0 }}><h3 style={{ fontSize: '.95rem' }}>Reservar com segurança</h3><p className="small muted" style={{ marginTop: 4 }}>Pagamento por M-Pesa ou e-Mola. A sala é autorizada depois da confirmação da equipa.</p><Link to={`/aulas?teacher=${t.id}`} className="btn btn-primary btn-block" style={{ marginTop: 12 }}>Ver aulas</Link></div>
          <div className="card card-pad"><h3 style={{ fontSize: '.95rem' }}>Denunciar perfil</h3><p className="small muted" style={{ marginTop: 4 }}>Se algo estiver errado, a nossa equipa analisa a denúncia.</p><button className="btn btn-outline btn-block" style={{ marginTop: 10 }} onClick={() => setReportOpen(true)}><Flag size={14} /> Denunciar</button></div>
        </aside>
      </div>
      <Modal open={reportOpen} onClose={() => setReportOpen(false)} title="Denunciar professor" subtitle="A denúncia é enviada à administração EDUCA." footer={<><button className="btn btn-ghost" onClick={() => setReportOpen(false)}>Cancelar</button><button className="btn btn-danger" onClick={sendReport} disabled={busy}>{busy ? 'A enviar…' : 'Enviar denúncia'}</button></>}>
        <Field label="Motivo"><select className="select" value={report.reason} onChange={e => setReport(r => ({ ...r, reason: e.target.value }))}><option>Conteúdo impróprio</option><option>Comportamento inadequado</option><option>Informação falsa</option><option>Outro</option></select></Field>
        <Field label="Detalhes"><textarea className="textarea" value={report.details} onChange={e => setReport(r => ({ ...r, details: e.target.value }))} placeholder="Descreve o que aconteceu…" /></Field>
      </Modal>
    </div>
  );
}
