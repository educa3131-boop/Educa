import React, { useEffect, useState } from 'react';
import { Search, Users, SlidersHorizontal, X } from 'lucide-react';
import { api, getQuery } from '../lib/api.js';
import { TeacherCard } from '../components/cards.jsx';
import { EmptyState, LoadingRow, Field } from '../components/ui.jsx';

export default function Teachers() {
  const [subjects, setSubjects] = useState([]); const [levels, setLevels] = useState([]); const [teachers, setTeachers] = useState([]); const [loading, setLoading] = useState(true); const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({ q: '', subject: '', level: '', maxPrice: '', minRating: '' });
  useEffect(() => { Promise.all([api('/subjects'), api('/levels')]).then(([s, l]) => { setSubjects(s); setLevels(l); }).catch(() => {}); }, []);
  useEffect(() => { setLoading(true); const t = setTimeout(() => { api(`/teachers${getQuery(filters)}`).then(d => setTeachers(d.teachers || [])).catch(() => setTeachers([])).finally(() => setLoading(false)); }, 250); return () => clearTimeout(t); }, [filters]);
  const set = (k, v) => setFilters(f => ({ ...f, [k]: v }));
  const clear = () => setFilters({ q: '', subject: '', level: '', maxPrice: '', minRating: '' });
  return (
    <div className="container" style={{ padding: '28px 0 64px' }}>
      <div className="breadcrumb"><span>Início</span><span>/</span><span style={{ color: 'var(--ink)', fontWeight: 700 }}>Professores</span></div>
      <div className="flex between align-center wrap gap-16" style={{ margin: '18px 0 22px' }}>
        <div><div className="eyebrow">Professores EDUCA</div><h1 style={{ fontSize: 'clamp(1.9rem,4vw,2.8rem)', marginTop: 6 }}>Aprende com quem sabe ensinar</h1><p className="muted small" style={{ marginTop: 4 }}>Todos os perfis são aprovados pela equipa EDUCA. As avaliações vêm de estudantes com aulas concluídas.</p></div>
        <div className="filter-bar"><div className="input flex align-center gap-8" style={{ minWidth: 240 }}><Search size={15} style={{ color: 'var(--muted)' }} /><input value={filters.q} onChange={e => set('q', e.target.value)} placeholder="Nome, disciplina ou cidade" style={{ border: 0, outline: 0, background: 'transparent', width: '100%', fontSize: '.84rem' }} /></div><button className="btn btn-outline mobile-filter-btn" onClick={() => setShowFilters(s => !s)}><SlidersHorizontal size={15} /> Filtros</button></div>
      </div>
      <div className="two-col">
        <div>
          <div className="small muted" style={{ marginBottom: 14 }}><strong style={{ color: 'var(--ink)' }}>{teachers.length}</strong> professor{teachers.length === 1 ? '' : 'es'} encontrado{teachers.length === 1 ? '' : 's'}</div>
          {loading ? <LoadingRow /> : teachers.length ? <div className="grid grid-3">{teachers.map(t => <TeacherCard key={t.id} teacher={t} />)}</div> : <EmptyState icon={Users} title="Nenhum professor encontrado" description="Ajusta os filtros ou tenta outra disciplina." action={<button className="btn btn-primary" onClick={clear}>Limpar filtros</button>} />}
        </div>
        <aside className="card filter-panel" style={{ position: 'sticky', top: 'calc(var(--header-h) + 16px)', display: showFilters ? 'block' : undefined }}>
          <div className="flex between align-center"><h3>Filtrar professores</h3><button className="icon-btn sm" onClick={clear} aria-label="Limpar"><X size={14} /></button></div><div className="divider" />
          <Field label="Disciplina"><select className="select" value={filters.subject} onChange={e => set('subject', e.target.value)}><option value="">Todas</option>{subjects.map(s => <option key={s.id} value={s.slug}>{s.name}</option>)}</select></Field>
          <Field label="Nível de ensino"><select className="select" value={filters.level} onChange={e => set('level', e.target.value)}><option value="">Todos</option>{levels.map(l => <option key={l.id} value={l.slug}>{l.name}</option>)}</select></Field>
          <Field label="Preço máximo por aula"><input className="input" type="number" min="0" step="50" value={filters.maxPrice} onChange={e => set('maxPrice', e.target.value)} placeholder="Ex.: 500" /></Field>
          <Field label="Avaliação mínima"><select className="select" value={filters.minRating} onChange={e => set('minRating', e.target.value)}><option value="">Qualquer</option><option value="3">3+ estrelas</option><option value="4">4+ estrelas</option><option value="4.5">4,5+ estrelas</option></select></Field>
          <div className="notice notice-info"><Users size={15} /><span>Os professores só aparecem aqui depois de aprovados pela administração.</span></div>
        </aside>
      </div>
    </div>
  );
}
