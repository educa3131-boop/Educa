import React from 'react';
import { Bell } from 'lucide-react';
import NotificationsView from '../components/NotificationsView.jsx';
export default function NotificationsPage() {
  return <div className="container" style={{ padding: '28px 0 64px' }}><div className="breadcrumb"><span>Início</span><span>/</span><span style={{ color: 'var(--ink)', fontWeight: 700 }}>Notificações</span></div><div className="flex between align-center wrap gap-12" style={{ margin: '16px 0 18px' }}><div><div className="eyebrow">Avisos</div><h1 style={{ fontSize: 'clamp(1.7rem,3.5vw,2.4rem)', marginTop: 6 }}>Notificações</h1><p className="muted small" style={{ marginTop: 4 }}>Reservas, pagamentos, mensagens, candidaturas e atualizações da plataforma.</p></div><span className="badge badge-green"><Bell size={12} /> Actualização automática</span></div><div className="card card-pad"><NotificationsView /></div></div>;
}
