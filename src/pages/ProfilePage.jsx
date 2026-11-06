import React from 'react';
import { User as UserIcon } from 'lucide-react';
import ProfileView from '../components/ProfileView.jsx';
export default function ProfilePage() {
  return <div className="container" style={{ padding: '28px 0 64px' }}><div className="breadcrumb"><span>Início</span><span>/</span><span style={{ color: 'var(--ink)', fontWeight: 700 }}>O meu perfil</span></div><div className="flex between align-center wrap gap-12" style={{ margin: '16px 0 18px' }}><div><div className="eyebrow">Conta</div><h1 style={{ fontSize: 'clamp(1.7rem,3.5vw,2.4rem)', marginTop: 6 }}>O meu perfil</h1><p className="muted small" style={{ marginTop: 4 }}>Atualiza os teus dados, fotografia e segurança.</p></div><span className="badge badge-green"><UserIcon size={12} /> Perfil</span></div><ProfileView /></div>;
}
