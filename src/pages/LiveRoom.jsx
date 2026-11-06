import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Video, Lock, ShieldCheck, Clock, CheckCircle2, AlertCircle, ExternalLink, LogOut, Star } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';
import { EmptyState, LoadingRow, Modal, useToast } from '../components/ui.jsx';
import { formatDateTime, formatTime, countdown, lessonEnd } from '../lib/format.js';

export default function LiveRoom() {
  const { lessonId } = useParams(); const { user } = useAuth(); const toast = useToast();
  const [access, setAccess] = useState(null); const [error, setError] = useState(''); const [loading, setLoading] = useState(true); const [now, setNow] = useState(Date.now()); const [completeOpen, setCompleteOpen] = useState(false); const [busy, setBusy] = useState(false);
  useEffect(() => { api(`/student/room-access/${lessonId}`).then(setAccess).catch(e => setError(e.message)).finally(() => setLoading(false)); }, [lessonId]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
  const markComplete = async () => { setBusy(true); try { if (user?.role === 'admin') await api(`/admin/lessons/${lessonId}/complete`, { method: 'POST' }); else await api(`/teacher/lessons/${lessonId}/complete`, { method: 'POST' }); toast('Aula marcada como concluída.', 'success'); setCompleteOpen(false); setAccess(a => a ? { ...a, lesson: { ...a.lesson, status: 'completed' } } : a); } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); } };
  if (loading) return <div className="live-page"><div className="live-shell"><LoadingRow large /></div></div>;
  if (error || !access) return <div className="live-page"><div className="live-shell"><div className="card card-pad" style={{ maxWidth: 620, margin: '40px auto', background: 'var(--paper)' }}><EmptyState icon={Lock} title="Sala indisponível" description={error || 'Não tens autorização para entrar nesta sala.'} action={<Link to={`/aula/${lessonId}`} className="btn btn-primary">Voltar à aula</Link>} /></div></div></div>;
  const lesson = access.lesson; const end = lessonEnd(lesson); const isTeacher = access.role === 'teacher'; const isAdmin = access.role === 'admin'; const canComplete = (isTeacher || isAdmin) && lesson.status === 'published';
  return (
    <div className="live-page">
      <div className="live-shell">
        <div className="live-top"><div><div className="flex gap-8 align-center"><span className="badge badge-red" style={{ background: 'rgba(231,76,60,.15)', color: '#ff8a7a' }}><span className="dot" /> AO VIVO</span><span className="badge" style={{ background: 'rgba(255,255,255,.1)', color: '#d9e8e1' }}>{isAdmin ? 'Administração' : isTeacher ? 'Professor' : 'Estudante'}</span></div><h1 style={{ marginTop: 6 }}>{lesson.title}</h1><p>{formatDateTime(lesson.startAt)} · {lesson.duration} min · {countdown(lesson.startAt)}</p></div><div className="flex gap-8 wrap"><Link to={`/aula/${lessonId}`} className="btn btn-outline" style={{ borderColor: 'rgba(255,255,255,.25)', color: '#fff' }}><ArrowLeft size={14} /> Voltar à aula</Link>{canComplete && <button className="btn btn-orange" onClick={() => setCompleteOpen(true)}><CheckCircle2 size={14} /> Marcar concluída</button>}</div></div>
        <div className="live-frame-wrap"><iframe className="live-frame" src={access.url} allow="camera; microphone; fullscreen; display-capture; autoplay; clipboard-write" allowFullScreen title={`Sala de aula: ${lesson.title}`} /></div>
        <div className="live-actions"><div className="live-note" style={{ flex: 1, marginTop: 0 }}><strong>Sala autorizada.</strong> O acesso foi verificado no servidor. {isTeacher || isAdmin ? 'Entra com o teu nome de professor para os estudantes te identificarem.' : 'Entra com o teu nome. Não partilhes este link com terceiros.'}</div></div>
        <div className="live-note"><ShieldCheck size={15} style={{ display: 'inline', marginRight: 5 }} />{access.provider === 'jaas' ? 'Sala com token assinado no servidor (JaaS).' : 'A sala usa o Jitsi público. O link só é entregue a utilizadores autorizados, mas quem receber o endereço pode entrar. Para salas com autenticação real, configura as credenciais JaaS.'}</div>
        <div className="live-note"><Clock size={15} style={{ display: 'inline', marginRight: 5 }} />A sala fecha no fim do horário da aula ({formatTime(end)}). {isTeacher || isAdmin ? 'Podes marcar a aula como concluída quando terminares.' : 'No fim, poderás avaliar o professor.'}</div>
      </div>
      <Modal open={completeOpen} onClose={() => setCompleteOpen(false)} title="Marcar aula como concluída" subtitle={lesson.title} footer={<><button className="btn btn-ghost" onClick={() => setCompleteOpen(false)}>Cancelar</button><button className="btn btn-primary" onClick={markComplete} disabled={busy}>Concluir aula</button></>}><p className="small muted">Os estudantes com pagamento confirmado poderão avaliar o professor. A sala deixa de aceitar novos acessos.</p></Modal>
    </div>
  );
}
