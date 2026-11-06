import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Send, MessageSquare, ArrowLeft } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Avatar, EmptyState, LoadingRow, useToast } from './ui.jsx';
import { formatDateTime, formatTime } from '../lib/format.js';

export default function MessagesView() {
  const { user } = useAuth(); const toast = useToast(); const [params] = useSearchParams();
  const [conversations, setConversations] = useState([]); const [selected, setSelected] = useState(params.get('c') || null); const [messages, setMessages] = useState([]); const [loading, setLoading] = useState(true); const [sending, setSending] = useState(false); const [body, setBody] = useState(''); const endRef = useRef(null);
  const loadConversations = async (silent = false) => { try { const d = await api('/messages/conversations'); setConversations(d.conversations || []); if (!silent) setLoading(false); if (!selected && d.conversations?.length) setSelected(d.conversations[0].id); } catch { if (!silent) setLoading(false); } };
  useEffect(() => { loadConversations(); const t = setInterval(() => loadConversations(true), 15000); return () => clearInterval(t); }, []);
  useEffect(() => { if (!selected) return; let alive = true; const load = async () => { try { const d = await api(`/messages/conversations/${selected}`); if (!alive) return; setMessages(d.messages || []); setConversations(cs => cs.map(c => c.id === selected ? { ...c, unread: 0 } : c)); await api(`/messages/conversations/${selected}/read`, { method: 'POST' }).catch(() => {}); } catch {} }; load(); const t = setInterval(load, 10000); return () => { alive = false; clearInterval(t); }; }, [selected]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  const conversation = conversations.find(c => c.id === selected);
  const send = async (e) => { e.preventDefault(); if (!body.trim() || !selected) return; setSending(true); try { await api(`/messages/conversations/${selected}/messages`, { method: 'POST', body: { body } }); setBody(''); const d = await api(`/messages/conversations/${selected}`); setMessages(d.messages || []); loadConversations(true); } catch (err) { toast(err.message, 'error'); } finally { setSending(false); } };
  if (loading) return <LoadingRow />;
  if (!conversations.length) return <EmptyState icon={MessageSquare} title="Ainda não tens conversas" description="Fala com um professor a partir do perfil dele ou depois de fazeres uma reserva." action={<Link to="/professores" className="btn btn-primary">Encontrar professor</Link>} />;
  return (
    <div className="chat-layout">
      <div className="chat-list">
        <div className="chat-list-head"><span>Conversas</span><span className="badge badge-gray">{conversations.length}</span></div>
        {conversations.map(c => <button key={c.id} className={`chat-item ${selected === c.id ? 'active' : ''}`} onClick={() => setSelected(c.id)}><Avatar name={c.other?.name} src={c.other?.avatar_file_id ? `/api/files/${c.other.avatar_file_id}` : null} size="sm" tone={c.other?.role === 'teacher' ? 'purple' : ''} /><div className="chat-info"><strong>{c.other?.name || 'Utilizador'}</strong><span>{c.lastMessage?.body || 'Sem mensagens'}</span></div>{c.unread > 0 && <span className="badge badge-orange">{c.unread}</span>}</button>)}
      </div>
      <div className="chat-main">
        {conversation ? <>
          <div className="chat-head"><div className="flex gap-8 align-center"><Avatar name={conversation.other?.name} src={conversation.other?.avatar_file_id ? `/api/files/${conversation.other.avatar_file_id}` : null} size="sm" tone={conversation.other?.role === 'teacher' ? 'purple' : ''} /><div><strong style={{ fontSize: '.82rem', display: 'block' }}>{conversation.other?.name}</strong><span className="tiny muted">{conversation.other?.role === 'teacher' ? 'Professor' : 'Estudante'}{conversation.lesson ? ` · ${conversation.lesson.title}` : ''}</span></div></div>{conversation.other?.role === 'teacher' && <Link to={`/professor/${conversation.other.id}`} className="tiny link-arrow">Ver perfil</Link>}</div>
          <div className="chat-messages">{messages.map(m => <div key={m.id} className={`msg ${m.sender_id === user?.id ? 'mine' : ''}`}>{m.body}<time>{formatDateTime(m.created_at)}</time></div>)}<div ref={endRef} /></div>
          <form className="chat-form" onSubmit={send}><textarea className="textarea" style={{ minHeight: 42 }} value={body} onChange={e => setBody(e.target.value)} placeholder="Escreve uma mensagem…" maxLength={4000} /><button className="btn btn-primary" disabled={sending || !body.trim()} aria-label="Enviar"><Send size={15} /></button></form>
        </> : <div className="loading-row">Selecciona uma conversa</div>}
      </div>
    </div>
  );
}
