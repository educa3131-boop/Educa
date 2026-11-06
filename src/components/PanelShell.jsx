import React from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { Avatar } from './ui.jsx';

export default function PanelShell({ title, subtitle, tabs, active, onChange, actions, children }) {
  const { user } = useAuth();
  const current = tabs.find(t => t.id === active);
  return (
    <div className="container panel-layout">
      <aside className="panel-sidebar">
        <div className="side-head"><div className="flex gap-8 align-center"><Avatar name={user?.name} src={user?.avatarFileId ? `/api/files/${user.avatarFileId}` : null} size="sm" /><div style={{ minWidth: 0 }}><strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 130 }}>{user?.name}</strong><span>{user?.role === 'admin' ? 'Administrador' : user?.role === 'teacher' ? 'Professor' : 'Estudante'}</span></div></div></div>
        {tabs.map(t => <button key={t.id} className={`panel-tab ${active === t.id ? 'active' : ''}`} onClick={() => onChange(t.id)}>{t.icon && <t.icon size={15} />}<span>{t.label}</span>{t.count !== undefined && <span className="count">{t.count}</span>}</button>)}
      </aside>
      <div className="panel-main">
        <div className="panel-mobile-tabs">{tabs.map(t => <button key={t.id} className={`panel-tab ${active === t.id ? 'active' : ''}`} onClick={() => onChange(t.id)}>{t.icon && <t.icon size={14} />}{t.label}</button>)}</div>
        <div className="panel-header"><div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>{actions}</div>
        {children}
      </div>
    </div>
  );
}
