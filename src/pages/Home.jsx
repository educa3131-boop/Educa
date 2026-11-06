import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, ArrowRight, ShieldCheck, Video, Wallet, Star, Users, BookOpen, CheckCircle2, CreditCard, Sparkles, GraduationCap, ChevronRight } from 'lucide-react';
import { api } from '../lib/api.js';
import { LessonCard, TeacherCard } from '../components/cards.jsx';
import { SectionHead, SubjectIcon, EmptyState, LoadingRow, Stars, Badge } from '../components/ui.jsx';
import { formatMT, formatNumber } from '../lib/format.js';

export default function Home() {
  const [lessons, setLessons] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [subject, setSubject] = useState('');
  const navigate = useNavigate();
  useEffect(() => {
    Promise.all([api('/lessons'), api('/teachers'), api('/subjects')]).then(([l, t, s]) => { setLessons(l.lessons || []); setTeachers(t.teachers || []); setSubjects(s || []); }).catch(() => {}).finally(() => setLoading(false));
  }, []);
  const avgRating = teachers.length ? teachers.reduce((s, t) => s + (t.rating?.average || 0), 0) / teachers.length : 0;
  const search = (e) => { e.preventDefault(); navigate(`/aulas${q || subject ? `?${new URLSearchParams({ ...(q ? { q } : {}), ...(subject ? { subject } : {}) }).toString()}` : ''}`); };
  return (
    <div>
      <section className="hero">
        <div className="container hero-grid">
          <div className="hero-copy">
            <div className="eyebrow">Aulas ao vivo em Moçambique</div>
            <h1>Aprende com os <em>melhores professores</em> de Moçambique.</h1>
            <p className="lead">Encontra explicações por disciplina, nível e preço. Reserva a tua aula, paga com M-Pesa ou e-Mola e entra na sala ao vivo depois da confirmação da equipa EDUCA.</p>
            <form className="search-box" onSubmit={search}>
              <div className="search-field"><Search size={17} style={{ color: 'var(--muted)' }} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="O que queres aprender? Ex.: Matemática" aria-label="Pesquisar aulas" /></div>
              <div className="divider" />
              <select value={subject} onChange={e => setSubject(e.target.value)} aria-label="Disciplina">
                <option value="">Todas as disciplinas</option>
                {subjects.map(s => <option key={s.id} value={s.slug}>{s.name}</option>)}
              </select>
              <button className="btn btn-primary" type="submit"><Search size={15} /> Pesquisar</button>
            </form>
            <div className="hero-stats">
              <div className="hero-stat"><strong>{formatNumber(teachers.length)}</strong><span>professores aprovados</span></div>
              <div className="hero-stat"><strong>{formatNumber(lessons.length)}</strong><span>aulas disponíveis</span></div>
              <div className="hero-stat"><strong>{avgRating ? avgRating.toFixed(1) : '—'} <Star size={14} fill="currentColor" style={{ color: 'var(--orange)', display: 'inline' }} /></strong><span>avaliação média</span></div>
            </div>
          </div>
          <div className="hero-visual">
            <div className="hero-photo"><img src="/hero.jpg" alt="Professora EDUCA durante uma aula online" /></div>
            <div className="hero-float"><div className="rating">4.9 <Star size={12} fill="currentColor" style={{ color: 'var(--orange)', display: 'inline' }} /></div><div><span>Avaliação</span><strong style={{ fontSize: '.72rem' }}>de estudantes reais</strong></div></div>
            <div className="hero-live"><span className="live-dot" /><div><strong>Aula ao vivo</strong><span>Áudio, vídeo e chat na sala</span></div></div>
            <div className="hero-badge"><ShieldCheck size={12} style={{ display: 'inline', marginRight: 3 }} /> Pagamento protegido</div>
          </div>
        </div>
      </section>

      <section className="section-sm" style={{ paddingTop: 0 }}>
        <div className="container">
          <SectionHead eyebrow="Disciplinas" title="O que queres aprender hoje?" description="Do primário à universidade, encontra apoio para as disciplinas que mais importam." action={<Link to="/aulas" className="link-arrow">Ver todas as aulas <ArrowRight size={15} /></Link>} />
          <div className="subject-grid">
            {subjects.map(s => <Link key={s.id} to={`/aulas?subject=${s.slug}`} className="subject-chip"><SubjectIcon name={s.icon} />{s.name}</Link>)}
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 24 }}>
        <div className="container">
          <SectionHead eyebrow="Próximas aulas" title="Aulas com lugares disponíveis" description={loading ? undefined : `${lessons.length} aulas publicadas por professores aprovados.`} action={<Link to="/aulas" className="link-arrow">Explorar todas <ArrowRight size={15} /></Link>} />
          {loading ? <LoadingRow /> : lessons.length ? <div className="grid grid-3">{lessons.slice(0, 6).map(l => <LessonCard key={l.id} lesson={l} />)}</div> : <EmptyState icon={BookOpen} title="Ainda não há aulas publicadas" description="Os professores aprovados podem publicar a primeira aula. Se és professor, submete a tua candidatura." action={<Link to="/ensinar" className="btn btn-primary">Quero ensinar</Link>} />}
        </div>
      </section>

      <section className="section" style={{ background: 'var(--paper)', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
        <div className="container">
          <SectionHead eyebrow="Professores em destaque" title="Quem está a ensinar" description="Perfis verificados pela equipa EDUCA, com avaliações reais de estudantes." action={<Link to="/professores" className="link-arrow">Ver todos <ArrowRight size={15} /></Link>} />
          {loading ? <LoadingRow /> : teachers.length ? <div className="grid grid-4">{teachers.slice(0, 4).map(t => <TeacherCard key={t.id} teacher={t} />)}</div> : <EmptyState icon={Users} title="Ainda não há professores aprovados" description="A plataforma está a começar. A candidatura de professor é analisada pela equipa EDUCA." action={<Link to="/ensinar" className="btn btn-primary">Candidatar-me</Link>} />}
        </div>
      </section>

      <section className="section">
        <div className="container">
          <SectionHead eyebrow="Como funciona" title="Três passos até à tua próxima nota" description="Um processo simples, com pagamento confirmado por pessoas reais." />
          <div className="grid grid-3">
            {[
              { n: '01', icon: Search, title: 'Encontra o professor', text: 'Pesquisa por disciplina, nível de ensino e preço. Consulta o perfil, a disponibilidade e as avaliações.' },
              { n: '02', icon: CreditCard, title: 'Reserva e paga', text: 'Escolhe a aula e o método M-Pesa ou e-Mola. Introduz a referência da transacção e aguarda a confirmação.' },
              { n: '03', icon: Video, title: 'Entra na aula ao vivo', text: 'Depois da confirmação, a sala é autorizada. Aprende em tempo real e avalia o professor no fim.' }
            ].map((s, i) => <div key={s.n} className="card card-pad" style={{ position: 'relative' }}><div className="flex between align-center"><div style={{ width: 42, height: 42, borderRadius: 12, background: 'var(--green-soft)', color: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><s.icon size={20} /></div><span style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--line-strong)' }}>{s.n}</span></div><h3 style={{ margin: '16px 0 6px' }}>{s.title}</h3><p className="muted" style={{ fontSize: '.86rem' }}>{s.text}</p></div>)}
          </div>
        </div>
      </section>

      <section className="section-sm">
        <div className="container">
          <div className="card" style={{ background: 'var(--green)', color: '#fff', border: 0, padding: '38px', display: 'grid', gridTemplateColumns: '1.3fr .7fr', gap: 28, alignItems: 'center', overflow: 'hidden', position: 'relative' }}>
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div className="eyebrow" style={{ color: '#f6c98b' }}>Para professores</div>
              <h2 style={{ color: '#fff', margin: '10px 0 10px' }}>Ensina. Ganha. Cresce com a EDUCA.</h2>
              <p style={{ color: '#c7ddd2', fontSize: '.9rem', maxWidth: '54ch' }}>Submete a tua candidatura, publica aulas ao vivo e recebe os teus ganhos na carteira EDUCA. A aprovação é feita pela nossa equipa.</p>
              <div className="flex gap-8 wrap" style={{ marginTop: 18 }}><Link to="/ensinar" className="btn btn-orange">Quero ensinar <ArrowRight size={15} /></Link><Link to="/professor" className="btn btn-outline" style={{ borderColor: 'rgba(255,255,255,.3)', color: '#fff' }}>Já sou professor</Link></div>
            </div>
            <div style={{ position: 'relative', zIndex: 1, display: 'grid', gap: 10 }}>
              {[{ icon: Wallet, t: 'Carteira transparente', s: 'Ganhos calculados a partir de pagamentos confirmados.' }, { icon: ShieldCheck, t: 'Pagamentos protegidos', s: 'A equipa confirma cada transacção antes de autorizar a sala.' }, { icon: Star, t: 'Avaliações reais', s: 'Só estudantes com aulas concluídas podem avaliar.' }].map(x => <div key={x.t} className="flex gap-12 align-center" style={{ background: 'rgba(255,255,255,.07)', borderRadius: 12, padding: '11px 13px' }}><x.icon size={18} style={{ color: '#f6c98b', flex: 'none' }} /><div><strong style={{ fontSize: '.8rem', display: 'block' }}>{x.t}</strong><span style={{ fontSize: '.7rem', color: '#b9d3c6' }}>{x.s}</span></div></div>)}
            </div>
          </div>
        </div>
      </section>

      <section className="section-sm" style={{ paddingBottom: 80 }}>
        <div className="container">
          <div className="grid grid-3">
            {[{ icon: ShieldCheck, title: 'Pagamento confirmado por humanos', text: 'A referência que introduzes é verificada no extracto M-Pesa ou e-Mola pela equipa antes de qualquer acesso.' }, { icon: Video, title: 'Salas de aula ao vivo', text: 'Aulas em vídeo com áudio, chat e partilha de ecrã. O acesso é reservado ao professor e aos estudantes com pagamento confirmado.' }, { icon: CheckCircle2, title: 'Avaliações verificadas', text: 'Só pode avaliar quem tem uma reserva confirmada e uma aula concluída. Sem avaliações inventadas.' }].map(x => <div key={x.title} className="flex gap-12"><div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--green-soft)', color: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}><x.icon size={18} /></div><div><h4>{x.title}</h4><p className="muted small" style={{ marginTop: 3 }}>{x.text}</p></div></div>)}
          </div>
        </div>
      </section>
    </div>
  );
}
