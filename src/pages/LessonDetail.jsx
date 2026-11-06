import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, Clock, Users, Video, MapPin, ShieldCheck, CheckCircle2, CreditCard, Flag, Star, MessageSquare, AlertCircle, Wallet, Lock } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Avatar, Badge, EmptyState, Field, FileUpload, LoadingRow, Modal, Stars, StarsInput, StatusBadge, useToast, SubjectIcon } from '../components/ui.jsx';
import { formatDate, formatDateTime, formatTime, formatMT, formatDuration, countdown, lessonEnd, PHASE_LABELS, WEEKDAYS_SHORT } from '../lib/format.js';

export default function LessonDetail() {
  const { id } = useParams(); const navigate = useNavigate(); const { user } = useAuth(); const toast = useToast();
  const [data, setData] = useState(null); const [loading, setLoading] = useState(true); const [myBooking, setMyBooking] = useState(null);
  const [bookingOpen, setBookingOpen] = useState(false); const [form, setForm] = useState({ studentName: '', studentPhone: '', method: 'M-Pesa' }); const [bookingBusy, setBookingBusy] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false); const [payment, setPayment] = useState({ reference: '', proofFileId: null }); const [paymentBusy, setPaymentBusy] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false); const [review, setReview] = useState({ rating: 0, comment: '' }); const [reviewBusy, setReviewBusy] = useState(false);
  const [reportOpen, setReportOpen] = useState(false); const [report, setReport] = useState({ reason: 'Conteúdo impróprio', details: '' }); const [reportBusy, setReportBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false); const [cancelBusy, setCancelBusy] = useState(false);
  const load = async () => { const d = await api(`/lessons/${id}`); setData(d); return d; };
  useEffect(() => { setLoading(true); load().catch(() => setData(null)).finally(() => setLoading(false)); }, [id]);
  useEffect(() => { if (user) { setForm(f => ({ ...f, studentName: f.studentName || user.name, studentPhone: f.studentPhone || user.phone || '' })); api('/student/bookings').then(d => setMyBooking((d.bookings || []).find(b => b.lesson_id === id) || null)).catch(() => {}); } else setMyBooking(null); }, [user, id]);
  if (loading) return <div className="container"><LoadingRow /></div>;
  if (!data) return <div className="container" style={{ padding: '40px 0' }}><EmptyState title="Aula não encontrada" description="Esta aula pode ter sido cancelada ou o link está incorrecto." action={<Link to="/aulas" className="btn btn-primary">Ver aulas</Link>} /></div>;
  const l = data.lesson; const settings = data.settings || {};
  const openBooking = () => { if (!user) return navigate(`/login?next=/aula/${id}`); if (user.role !== 'student') return toast('A reserva de aulas está disponível para contas de estudante.', 'info'); setBookingOpen(true); };
  const submitBooking = async (e) => {
    e.preventDefault(); setBookingBusy(true);
    try { const d = await api(`/student/lessons/${id}/bookings`, { method: 'POST', body: form }); const b = await api(`/student/bookings/${d.bookingId}`); setMyBooking(b.booking); setBookingOpen(false); setPaymentOpen(true); toast('Reserva criada. Introduz a referência do pagamento.', 'success'); }
    catch (err) { toast(err.message, 'error'); } finally { setBookingBusy(false); }
  };
  const submitPayment = async () => {
    if (!myBooking) return; setPaymentBusy(true);
    try { await api(`/student/bookings/${myBooking.id}/payment`, { method: 'POST', body: { reference: payment.reference, proofFileId: payment.proofFileId || undefined } }); const b = await api(`/student/bookings/${myBooking.id}`); setMyBooking(b.booking); setPaymentOpen(false); setPayment({ reference: '', proofFileId: null }); toast('Referência submetida. Aguarda a confirmação da equipa.', 'success'); }
    catch (err) { toast(err.message, 'error'); } finally { setPaymentBusy(false); }
  };
  const cancelBooking = async () => { if (!myBooking) return; setCancelBusy(true); try { await api(`/student/bookings/${myBooking.id}/cancel`, { method: 'POST', body: { reason: 'Cancelada pelo estudante.' } }); const b = await api(`/student/bookings/${myBooking.id}`); setMyBooking(b.booking); setCancelOpen(false); toast('Reserva cancelada.', 'success'); } catch (e) { toast(e.message, 'error'); } finally { setCancelBusy(false); } };
  const submitReview = async () => { if (!myBooking) return; setReviewBusy(true); try { await api(`/student/reviews/${myBooking.id}`, { method: 'POST', body: review }); const b = await api(`/student/bookings/${myBooking.id}`); setMyBooking(b.booking); setReviewOpen(false); setReview({ rating: 0, comment: '' }); toast('Avaliação enviada. Obrigado!', 'success'); } catch (e) { toast(e.message, 'error'); } finally { setReviewBusy(false); } };
  const submitReport = async () => { setReportBusy(true); try { await api('/student/reports', { method: 'POST', body: { targetType: 'teacher', targetId: l.teacher_id, ...report } }); setReportOpen(false); toast('Denúncia enviada à equipa EDUCA.', 'success'); } catch (e) { toast(e.message, 'error'); } finally { setReportBusy(false); } };
  const phase = l.phase; const available = phase === 'published' && l.seatsLeft > 0;
  return (
    <div className="container" style={{ padding: '20px 0 64px' }}>
      <div className="breadcrumb"><Link to="/">Início</Link><span>/</span><Link to="/aulas">Aulas</Link><span>/</span><span style={{ color: 'var(--ink)', fontWeight: 700 }}>{l.title}</span></div>
      <div className="flex between align-center wrap gap-12" style={{ margin: '16px 0 18px' }}>
        <div className="flex gap-6 wrap"><Badge tone="green">{l.subject_name}</Badge><Badge tone="gray">{l.level_name}</Badge><Badge tone="purple">{l.mode === 'individual' ? 'Individual' : 'Grupo'}</Badge><StatusBadge status={phase} label={PHASE_LABELS[phase]} /></div>
        <button className="btn btn-ghost btn-sm" onClick={() => setReportOpen(true)}><Flag size={14} /> Denunciar</button>
      </div>
      <div className="detail-grid">
        <div className="detail-main">
          <div className="card detail-card">
            <div className="eyebrow">Aula ao vivo</div>
            <h1 style={{ margin: '8px 0 10px', fontSize: 'clamp(1.7rem,3.5vw,2.5rem)' }}>{l.title}</h1>
            <div className="flex gap-16 wrap align-center" style={{ fontSize: '.8rem', color: 'var(--muted)' }}><span className="flex gap-6 align-center"><CalendarDays size={15} />{formatDate(l.start_at, { weekday: 'long', day: '2-digit', month: 'long' })}</span><span className="flex gap-6 align-center"><Clock size={15} />{formatTime(l.start_at)} · {formatDuration(l.duration)}</span><span className="flex gap-6 align-center"><Users size={15} />{l.seatsLeft} de {l.seats} lugares livres</span></div>
            <p style={{ marginTop: 16 }}>{l.description}</p>
            <div className="divider" />
            <div className="flex gap-12 align-center wrap">
              <Avatar name={l.teacher_name} src={l.photo_file_id ? `/api/files/${l.photo_file_id}` : null} size="lg" tone="purple" />
              <div style={{ flex: 1, minWidth: 180 }}><span className="tiny muted">Professor</span><Link to={`/professor/${l.teacher_id}`} style={{ fontWeight: 800, display: 'block' }}>{l.teacher_name}</Link><span className="tiny muted">{l.teacher_headline}</span></div>
              <div style={{ textAlign: 'right' }}><Stars value={data.rating?.average || 0} /><div className="tiny muted">{data.rating?.count || 0} avaliações</div></div>
            </div>
          </div>
          <div className="card detail-card"><h2>O que está incluído</h2><div className="grid grid-2" style={{ marginTop: 12 }}>{[{ icon: Video, t: 'Aula ao vivo', s: 'Sala de vídeo com áudio e chat.' }, { icon: MessageSquare, t: 'Dúvidas respondidas', s: 'Perguntas durante a sessão.' }, { icon: ShieldCheck, t: 'Pagamento confirmado', s: 'Acesso autorizado pela equipa EDUCA.' }, { icon: Star, t: 'Avaliação', s: 'Avalia o professor no fim da aula.' }].map(x => <div key={x.t} className="flex gap-8 align-center"><x.icon size={16} style={{ color: 'var(--green)', flex: 'none' }} /><div><strong style={{ fontSize: '.8rem', display: 'block' }}>{x.t}</strong><span className="tiny muted">{x.s}</span></div></div>)}</div></div>
          <div className="card detail-card"><h2>Detalhes da aula</h2><div className="info-list" style={{ marginTop: 8 }}><div className="info-row"><span>Data e hora</span><span>{formatDateTime(l.start_at)}</span></div><div className="info-row"><span>Duração</span><span>{formatDuration(l.duration)}</span></div><div className="info-row"><span>Formato</span><span>{l.mode === 'individual' ? 'Individual (1 lugar)' : `Grupo (${l.seats} lugares)`}</span></div><div className="info-row"><span>Nível</span><span>{l.level_name}</span></div><div className="info-row"><span>Preço</span><span>{formatMT(l.price)}</span></div><div className="info-row"><span>Pagamento</span><span>M-Pesa ou e-Mola · confirmação manual</span></div></div></div>
          <div className="card detail-card"><div className="flex between align-center"><h2>Avaliações do professor</h2><Stars value={data.rating?.average || 0} count={data.rating?.count} /></div>{data.reviews.length ? data.reviews.map((r, i) => <div className="review-item" key={i}><div className="review-head"><strong>{r.student_name}</strong><Stars value={r.rating} /></div><p>{r.comment || 'Sem comentário.'}</p><span className="tiny muted">{formatDate(r.created_at)}</span></div>) : <p className="muted small">Ainda não há avaliações. Só estudantes com aulas concluídas podem avaliar.</p>}</div>
        </div>
        <aside>
          <div className="card booking-card">
            <div className="flex between align-center"><span className="tiny muted">Preço da aula</span><Badge tone={available ? 'green' : 'gray'} dot>{available ? 'Lugares disponíveis' : PHASE_LABELS[phase]}</Badge></div>
            <div className="price" style={{ fontSize: '2rem', margin: '4px 0 2px' }}>{formatMT(l.price)}</div>
            <span className="tiny muted">Pagamento único · confirmação manual</span>
            <div className="divider" />
            <div className="info-list"><div className="info-row"><span>Data</span><span>{formatDate(l.start_at, { day: '2-digit', month: 'short' })}</span></div><div className="info-row"><span>Hora</span><span>{formatTime(l.start_at)}</span></div><div className="info-row"><span>Duração</span><span>{formatDuration(l.duration)}</span></div><div className="info-row"><span>Lugares</span><span>{l.seatsLeft} livres</span></div></div>
            {!myBooking ? (
              <button className="btn btn-primary btn-block btn-lg" style={{ marginTop: 16 }} onClick={openBooking} disabled={!available}>{available ? 'Reservar esta aula' : 'Aula indisponível'}</button>
            ) : (
              <div style={{ marginTop: 16, display: 'grid', gap: 8 }}>
                <div className="flex between align-center"><span className="tiny muted">A tua reserva</span><StatusBadge status={myBooking.status} /></div>
                {myBooking.status === 'pending' && <button className="btn btn-primary btn-block" onClick={() => setPaymentOpen(true)}><CreditCard size={15} /> Introduzir referência</button>}
                {myBooking.status === 'pending' && <button className="btn btn-ghost btn-sm btn-block" onClick={() => setCancelOpen(true)}>Cancelar reserva pendente</button>}
                {myBooking.canJoin && <button className="btn btn-primary btn-block" onClick={() => navigate(`/sala/${l.id}`)}><Video size={15} /> Entrar na sala</button>}
                {myBooking.canReview && <button className="btn btn-orange btn-block" onClick={() => setReviewOpen(true)}><Star size={15} /> Avaliar professor</button>}
                {myBooking.status === 'paid' && !myBooking.canJoin && <div className="notice notice-info"><Clock size={15} /><span>A sala abre 30 minutos antes do início da aula.</span></div>}
                {myBooking.review_rating && <div className="notice notice-success"><CheckCircle2 size={15} /><span>Avaliação enviada: {myBooking.review_rating} estrelas.</span></div>}
              </div>
            )}
            <div className="notice notice-info" style={{ marginTop: 12 }}><Lock size={15} /><span>A sala só é autorizada depois da confirmação do pagamento pela equipa EDUCA.</span></div>
            <div className="flex gap-6 wrap" style={{ marginTop: 12 }}><Badge tone="blue">M-Pesa</Badge><Badge tone="orange">e-Mola</Badge><span className="tiny muted">Pagamento manual</span></div>
          </div>
          <div className="card card-pad" style={{ marginTop: 16 }}><h3 style={{ fontSize: '.92rem' }}>Política de cancelamento</h3><p className="small muted" style={{ marginTop: 4 }}>Podes cancelar reservas com pagamento pendente. Para reservas pagas, contacta o suporte para avaliarmos o reembolso.</p><a href={`mailto:${'suporte@educa.mz'}`} className="link-arrow small" style={{ marginTop: 8, display: 'inline-block' }}>Falar com o suporte</a></div>
        </aside>
      </div>
      <Modal open={bookingOpen} onClose={() => setBookingOpen(false)} title="Reservar esta aula" subtitle={`${l.title} · ${formatDate(l.start_at)} às ${formatTime(l.start_at)}`} footer={<><button className="btn btn-ghost" onClick={() => setBookingOpen(false)}>Cancelar</button><button className="btn btn-primary" onClick={submitBooking} disabled={bookingBusy}>{bookingBusy ? <span className="spinner" /> : null}Confirmar reserva</button></>}>
        <div className="notice notice-info" style={{ marginBottom: 14 }}><CreditCard size={15} /><span>O pagamento é feito por M-Pesa ou e-Mola. A reserva fica pendente até a equipa confirmar a referência.</span></div>
        <div className="form-grid"><Field label="Nome do estudante"><input className="input" value={form.studentName} onChange={e => setForm(f => ({ ...f, studentName: e.target.value }))} required /></Field><Field label="Telefone"><input className="input" value={form.studentPhone} onChange={e => setForm(f => ({ ...f, studentPhone: e.target.value }))} placeholder="84 000 0000" required /></Field><div className="full"><span className="label">Método de pagamento</span><div className="radio-cards"><label className="radio-card"><input type="radio" name="method" checked={form.method === 'M-Pesa'} onChange={() => setForm(f => ({ ...f, method: 'M-Pesa' }))} /><div><strong>M-Pesa</strong><span>Vodafone</span></div></label><label className="radio-card"><input type="radio" name="method" checked={form.method === 'e-Mola'} onChange={() => setForm(f => ({ ...f, method: 'e-Mola' }))} /><div><strong>e-Mola</strong><span>Movitel</span></div></label></div></div></div>
      </Modal>
      <Modal open={paymentOpen} onClose={() => setPaymentOpen(false)} title="Pagamento da reserva" subtitle="Introduz a referência depois de efectuares a transferência." footer={<><button className="btn btn-ghost" onClick={() => setPaymentOpen(false)}>Fechar</button><button className="btn btn-primary" onClick={submitPayment} disabled={paymentBusy || !payment.reference || payment.reference.trim().length < 4}>{paymentBusy ? <span className="spinner" /> : null}Submeter referência</button></>}>
        {myBooking ? <>
          <div className="card card-pad" style={{ background: 'var(--cream)', marginBottom: 14 }}><div className="flex between align-center"><span className="small muted">Valor a pagar</span><strong style={{ fontSize: '1.2rem' }}>{formatMT(myBooking.amount)}</strong></div><div className="info-row" style={{ marginTop: 8 }}><span>Método</span><span>{myBooking.method}</span></div><div className="info-row"><span>Número {myBooking.method}</span><span style={{ fontWeight: 900 }}>{myBooking.method === 'M-Pesa' ? settings.mpesaNumber || 'Não configurado' : settings.emolaNumber || 'Não configurado'}</span></div><div className="info-row"><span>Reserva</span><span>{myBooking.id}</span></div></div>
          {(!settings.mpesaNumber || !settings.emolaNumber) && <div className="notice notice-warning" style={{ marginBottom: 12 }}><AlertCircle size={15} /><span>A equipa ainda não configurou os números de pagamento. Contacta o suporte antes de transferir.</span></div>}
          <Field label="Referência da transacção" help="Código que aparece no SMS ou no comprovativo M-Pesa/e-Mola."><input className="input" value={payment.reference} onChange={e => setPayment(p => ({ ...p, reference: e.target.value.toUpperCase() }))} placeholder="Ex.: MP2024ABC123" /></Field>
          <div style={{ marginTop: 12 }}><FileUpload label="Comprovativo (opcional)" file={payment.proofFileId ? { filename: 'Comprovativo carregado', url: `/api/files/${payment.proofFileId}` } : null} onChange={f => setPayment(p => ({ ...p, proofFileId: f?.id || null }))} /></div>
          <div className="notice notice-warning" style={{ marginTop: 12 }}><ShieldCheck size={15} /><span>Não é a introdução do código que confirma o pagamento. A equipa EDUCA verifica o extracto antes de autorizar a sala.</span></div>
        </> : <LoadingRow />}
      </Modal>
      <Modal open={reviewOpen} onClose={() => setReviewOpen(false)} title="Avaliar professor" subtitle="A tua avaliação é pública e ajuda outros estudantes." footer={<><button className="btn btn-ghost" onClick={() => setReviewOpen(false)}>Cancelar</button><button className="btn btn-primary" onClick={submitReview} disabled={reviewBusy || !review.rating}>{reviewBusy ? <span className="spinner" /> : null}Enviar avaliação</button></>}>
        <div className="center" style={{ padding: '8px 0 14px' }}><StarsInput value={review.rating} onChange={r => setReview(x => ({ ...x, rating: r }))} /><div className="small muted" style={{ marginTop: 6 }}>{review.rating ? `${review.rating} de 5 estrelas` : 'Selecciona uma classificação'}</div></div>
        <Field label="Comentário"><textarea className="textarea" value={review.comment} onChange={e => setReview(x => ({ ...x, comment: e.target.value }))} placeholder="Como foi a aula? O que o professor fez bem?" maxLength={2000} /></Field>
      </Modal>
      <Modal open={reportOpen} onClose={() => setReportOpen(false)} title="Denunciar professor" footer={<><button className="btn btn-ghost" onClick={() => setReportOpen(false)}>Cancelar</button><button className="btn btn-danger" onClick={submitReport} disabled={reportBusy}>Enviar denúncia</button></>}><Field label="Motivo"><select className="select" value={report.reason} onChange={e => setReport(r => ({ ...r, reason: e.target.value }))}><option>Conteúdo impróprio</option><option>Comportamento inadequado</option><option>Informação falsa</option><option>Outro</option></select></Field><Field label="Detalhes"><textarea className="textarea" value={report.details} onChange={e => setReport(r => ({ ...r, details: e.target.value }))} /></Field></Modal>
      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title="Cancelar reserva" subtitle="Esta reserva ainda está pendente de pagamento." footer={<><button className="btn btn-ghost" onClick={() => setCancelOpen(false)}>Manter reserva</button><button className="btn btn-danger" onClick={cancelBooking} disabled={cancelBusy}>Cancelar reserva</button></>}><p className="small muted">O lugar será libertado. Podes voltar a reservar mais tarde, se houver disponibilidade.</p></Modal>
    </div>
  );
}
