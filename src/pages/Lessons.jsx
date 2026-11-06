import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal, X, BookOpen } from 'lucide-react';
import { api, getQuery } from '../lib/api.js';
import { LessonCard } from '../components/cards.jsx';
import { EmptyState, LoadingRow, Field } from '../components/ui.jsx';
import { formatMT } from '../lib/format.js';

export default function Lessons() {
  const [params] = useSearchParams();
  const [subjects, setSubjects] = useState([]);
  const [levels, setLevels] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({ q: params.get('q') || '', subject: params.get('subject') || '', level: params.get('level') || '', mode: '', maxPrice: '', sort: 'date' });
  useEffect(() => { Promise.all([api('/subjects'), api('/levels')]).then(([s, l]) => { setSubjects(s); setLevels(l); }).catch(() => {}); }, []);
  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => {
      api(`/lessons${getQuery(filters)}`).then(d => setLessons(d.lessons || [])).catch(() => setLessons([])).finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [filters]);
  const set = (key, value) => setFilters(f => ({ ...f, [key]: value }));
  const clear = () => setFilters({ q: '', subject: '', level: '', mode: '', maxPrice: '', sort: 'date' });
  const activeCount = [filters.subject, filters.level, filters.mode, filters.maxPrice].filter(Boolean).length;
  return (
    <div className="container" style={{ padding: '28px 0 64px' }}>
      <div className="breadcrumb"><span>Início</span><span>/</span><span style={{ color: 'var(--ink)', fontWeight: 700 }}>Aulas</span></div>
      <div className="flex between align-center wrap gap-16" style={{ margin: '18px 0 22px' }}>
        <div><div className="eyebrow">Explorar aulas</div><h1 style={{ fontSize: 'clamp(1.9rem,4vw,2.8rem)', marginTop: 6 }}>Encontra a tua próxima aula</h1><p className="muted small" style={{ marginTop: 4 }}>Aulas ao vivo, individuais ou em grupo, com professores aprovados pela EDUCA.</p></div>
        <div className="filter-bar"><div className="input flex align-center gap-8" style={{ minWidth: 240 }}><Search size={15} style={{ color: 'var(--muted)' }} /><input value={filters.q} onChange={e => set('q', e.target.value)} placeholder="Pesquisar aula ou professor" style={{ border: 0, outline: 0, background: 'transparent', width: '100%', fontSize: '.84rem' }} /></div><button className="btn btn-outline mobile-filter-btn" onClick={() => setShowFilters(s => !s)}><SlidersHorizontal size={15} /> Filtros {activeCount ? `(${activeCount})` : ''}</button></div>
      </div>
      <div className="two-col">
        <div>
          <div className="flex between align-center wrap gap-8" style={{ marginBottom: 14 }}>
            <span className="small muted"><strong style={{ color: 'var(--ink)' }}>{lessons.length}</strong> aula{lessons.length === 1 ? '' : 's'} encontrada{lessons.length === 1 ? '' : 's'}</span>
            <div className="flex gap-8 align-center"><span className="tiny muted">Ordenar:</span><select className="select" style={{ width: 'auto', padding: '7px 30px 7px 10px', fontSize: '.78rem' }} value={filters.sort} onChange={e => set('sort', e.target.value)}><option value="date">Data mais próxima</option><option value="price_asc">Preço mais baixo</option><option value="price_desc">Preço mais alto</option><option value="rating">Melhor avaliados</option></select></div>
          </div>
          {loading ? <LoadingRow /> : lessons.length ? <div className="grid grid-3">{lessons.map(l => <LessonCard key={l.id} lesson={l} />)}</div> : <EmptyState icon={BookOpen} title="Nenhuma aula encontrada" description="Experimenta ajustar os filtros ou pesquisar por outra disciplina." action={<button className="btn btn-primary" onClick={clear}>Limpar filtros</button>} />}
        </div>
        <aside className={`card filter-panel ${showFilters ? '' : 'mobile-hidden'}`} style={{ position: 'sticky', top: 'calc(var(--header-h) + 16px)', display: showFilters ? 'block' : undefined }}>
          <div className="flex between align-center"><h3>Filtrar aulas</h3><button className="icon-btn sm" onClick={clear} aria-label="Limpar filtros"><X size={14} /></button></div>
          <div className="divider" />
          <Field label="Disciplina"><select className="select" value={filters.subject} onChange={e => set('subject', e.target.value)}><option value="">Todas</option>{subjects.map(s => <option key={s.id} value={s.slug}>{s.name}</option>)}</select></Field>
          <Field label="Nível de ensino"><select className="select" value={filters.level} onChange={e => set('level', e.target.value)}><option value="">Todos</option>{levels.map(l => <option key={l.id} value={l.slug}>{l.name}</option>)}</select></Field>
          <Field label="Formato"><select className="select" value={filters.mode} onChange={e => set('mode', e.target.value)}><option value="">Todos</option><option value="individual">Individual</option><option value="grupo">Grupo</option></select></Field>
          <Field label="Preço máximo"><input className="input" type="number" min="0" step="50" value={filters.maxPrice} onChange={e => set('maxPrice', e.target.value)} placeholder="Ex.: 500" /></Field>
          <div className="notice notice-info" style={{ marginTop: 6 }}><ShieldIcon /><span>O pagamento é confirmado manualmente pela equipa EDUCA antes de autorizarmos a sala.</span></div>
        </aside>
      </div>
    </div>
  );
}
function ShieldIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>; }
