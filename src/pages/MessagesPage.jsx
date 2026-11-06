import React from 'react';
import { MessageSquare } from 'lucide-react';
import MessagesView from '../components/MessagesView.jsx';
export default function MessagesPage() {
  return <div className="container" style={{ padding: '28px 0 64px' }}><div className="breadcrumb"><span>Início</span><span>/</span><span style={{ color: 'var(--ink)', fontWeight: 700 }}>Mensagens</span></div><div className="flex between align-center wrap gap-12" style={{ margin: '16px 0 18px' }}><div><div className="eyebrow">Comunicação</div><h1 style={{ fontSize: 'clamp(1.7rem,3.5vw,2.4rem)', marginTop: 6 }}>Mensagens</h1><p className="muted small" style={{ marginTop: 4 }}>Conversas individuais com professores e estudantes. O acesso é restrito aos participantes.</p></div><span className="badge badge-green"><MessageSquare size={12} /> {new Date().getFullYear()}</span></div><div className="card card-pad"><MessagesView /></div></div>;
}
