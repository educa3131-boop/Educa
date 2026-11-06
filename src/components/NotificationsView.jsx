import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, CreditCard, MessageSquare, UserCheck, CalendarDays, Wallet, Flag, ShieldCheck, BookOpen, Star } from 'lucide-react';
import { api } from '../lib/api.js';
import { EmptyState, LoadingRow } from './ui.jsx';
import { formatDateTime } from '../lib/format.js';
const icons = { booking: CalendarDays, payment: CreditCard, message: MessageSquare, teacher: UserCheck, lesson: BookOpen, wallet: Wallet, report: Flag, account: ShieldCheck, review: Star, admin: ShieldCheck };
export default function NotificationsView() {
  const navigate = useNavigate(); const [items, setItems] = useState([]); const [unread, setUnread] = useState(0); const [loading, setLoading] = useState(true);
  const load = async () => { try { const d = await api('/notifications?limit=100'); setItems(d.notifications || []); setUnread(d.unread || 0); } catch {} finally { setLoading(false); } };
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, []);
  const open = async (n) => { try { await api(`/notifications/${n.id}/read`, { method: 'POST' }); } catch {} setItems(is => is.map(x => x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)); setUnread(u => Math.max(0, u - 1)); if (n.link) navigate(n.link); };
  const readAll = async () => { try { await api('/notifications/read-all', { method: 'POST' }); setItems(is => is.map(x => ({ ...x, read_at: x.read_at || new Date().toISOString() }))); setUnread(0); } catch {} };
  if (loading) return <LoadingRow />;
  return (
    <div>
      <div className="flex between align-center wrap gap-8" style={{ marginBottom: 14 }}><span className="small muted">{unread ? `${unread} não lida${unread === 1 ? '' : 's'}` : 'Tudo lido'}</span><button className="btn btn-outline btn-sm" onClick={readAll} disabled={!unread}><CheckCheck size={14} /> Marcar todas como lidas</button></div>
      {items.length ? <div className="card" style={{ overflow: 'hidden' }}>{items.map(n => { const Icon = icons[n.type] || Bell; return <button key={n.id} onClick={() => open(n)} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', width: '100%', textAlign: 'left', padding: '13px 16px', border: 0, borderBottom: '1px solid var(--line)', background: n.read_at ? 'var(--paper)' : 'var(--green-soft)' }}><div style={{ width: 34, height: 34, borderRadius: 10, background: n.read_at ? 'var(--cream-2)' : 'var(--paper)', color: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}><Icon size={16} /></div><div style={{ flex: 1, minWidth: 0 }}><div className="flex between gap-8"><strong style={{ fontSize: '.82rem' }}>{n.title}</strong>{!n.read_at && <span className="dot" style={{ color: 'var(--orange)', flex: 'none' }} />}</div><p className="small muted" style={{ marginTop: 2 }}>{n.body}</p><span className="tiny muted">{formatDateTime(n.created_at)}</span></div></button>; })}</div> : <EmptyState icon={Bell} title="Sem notificações" description="Avisamos-te aqui sobre reservas, pagamentos, mensagens e atualizações da plataforma." />}
    </div>
  );
}
