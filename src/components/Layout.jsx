import React, { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Home, Search, Users, LayoutDashboard, User as UserIcon, Bell, MessageSquare, LogOut, ChevronDown, Menu, X, GraduationCap, ShieldCheck, BookOpen, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';
import { Avatar, Logo } from './ui.jsx';

function ScrollToTop() { const { pathname } = useLocation(); useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [pathname]); return null; }

export default function Layout() {
  const { user, logout, loading } = useAuth();
  const [settings, setSettings] = useState(null);
  const [unread, setUnread] = useState(0);
  const [menu, setMenu] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => { api('/settings').then(d => setSettings(d)).catch(() => {}); }, []);
  useEffect(() => {
    if (!user) { setUnread(0); return; }
    let alive = true;
    const load = async () => { try { const d = await api('/notifications?limit=1'); if (alive) setUnread(d.unread || 0); } catch {} };
    load(); const t = setInterval(load, 20000); return () => { alive = false; clearInterval(t); };
  }, [user]);
  useEffect(() => { setMenu(false); setMobileOpen(false); }, [location.pathname]);
  const panel = user ? (user.role === 'admin' ? '/admin' : user.role === 'teacher' ? '/professor' : '/painel') : '/login';
  const panelLabel = user ? (user.role === 'admin' ? 'Administração' : user.role === 'teacher' ? 'Painel do professor' : 'Painel do estudante') : 'Entrar';
  const doLogout = async () => { await logout(); navigate('/'); };
  return (
    <div>
      <ScrollToTop />
      {settings?.announcement && <div className="announcement">{settings.announcement}</div>}
      <header className="site-header">
        <div className="container header-inner">
          <Link to="/" aria-label="EDUCA — página inicial"><Logo small /></Link>
          <nav className="main-nav" aria-label="Navegação principal">
            <NavLink to="/aulas" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>Aulas</NavLink>
            <NavLink to="/professores" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>Professores</NavLink>
            {!user && <NavLink to="/ensinar" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>Ensinar</NavLink>}
            {user && <NavLink to={panel} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>{panelLabel}</NavLink>}
          </nav>
          <div className="header-actions">
            {user ? (
              <>
                <Link to="/mensagens" className="icon-btn" aria-label="Mensagens" style={{ position: 'relative' }}><MessageSquare size={17} /></Link>
                <Link to="/notificacoes" className="icon-btn" aria-label="Notificações" style={{ position: 'relative' }}><Bell size={17} />{unread > 0 && <span style={{ position: 'absolute', top: 4, right: 4, minWidth: 15, height: 15, borderRadius: 999, background: 'var(--orange)', color: '#241503', fontSize: 9, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>{unread > 9 ? '9+' : unread}</span>}</Link>
                <div className="user-menu">
                  <button className="user-trigger" onClick={() => setMenu(m => !m)} aria-expanded={menu}><Avatar name={user.name} src={user.avatarFileId ? `/api/files/${user.avatarFileId}` : null} size="sm" /><span className="long">{user.name.split(' ')[0]}</span><ChevronDown size={13} /></button>
                  {menu && <div className="dropdown">
                    <div style={{ padding: '8px 10px' }}><strong style={{ fontSize: '.8rem', display: 'block' }}>{user.name} {user.isDemo && <span className="badge badge-orange" style={{ fontSize: '.58rem', padding: '1px 6px' }}>Demonstração</span>}</strong><span className="tiny muted">{user.email}</span></div>
                    <div className="sep" />
                    <Link to={panel}><LayoutDashboard size={15} />{panelLabel}</Link>
                    <Link to="/mensagens"><MessageSquare size={15} />Mensagens</Link>
                    <Link to="/notificacoes"><Bell size={15} />Notificações</Link>
                    <Link to="/perfil"><UserIcon size={15} />O meu perfil</Link>
                    <div className="sep" />
                    <button onClick={doLogout}><LogOut size={15} />Terminar sessão</button>
                  </div>}
                </div>
              </>
            ) : (
              <>
                <Link to="/login" className="btn btn-ghost btn-sm">Entrar</Link>
                <Link to="/registo" className="btn btn-primary btn-sm">Criar conta</Link>
              </>
            )}
            <button className="icon-btn" style={{ display: 'none' }} aria-label="Menu"><Menu size={18} /></button>
          </div>
        </div>
      </header>
      <main style={{ minHeight: '60vh' }}><Outlet /></main>
      {location.pathname !== '/sala' && !location.pathname.startsWith('/sala/') && (
        <footer className="site-footer">
          <div className="container">
            <div className="footer-grid">
              <div className="footer-brand">
                <Link to="/"><Logo light small /></Link>
                <p>A plataforma moçambicana que liga estudantes e professores em aulas ao vivo, com pagamento confirmado pela equipa EDUCA.</p>
                <div className="payment-badges" style={{ marginTop: 16 }}><span className="payment-badge">M-Pesa</span><span className="payment-badge">e-Mola</span><span className="payment-badge">Aulas ao vivo</span></div>
              </div>
              <div className="footer-col"><h4>Aprender</h4><Link to="/aulas">Explorar aulas</Link><Link to="/professores">Professores</Link><Link to="/registo">Criar conta de estudante</Link><Link to="/painel">As minhas reservas</Link></div>
              <div className="footer-col"><h4>Ensinar</h4><Link to="/ensinar">Candidatura a professor</Link><Link to="/professor">Painel do professor</Link><Link to="/professor">Carteira e levantamentos</Link></div>
              <div className="footer-col"><h4>EDUCA</h4><Link to="/perfil">O meu perfil</Link><Link to="/notificacoes">Notificações</Link><Link to="/mensagens">Mensagens</Link><a href={`mailto:${settings?.supportEmail || 'suporte@educa.mz'}`}>Suporte</a></div>
            </div>
            <div className="footer-bottom"><span>© {new Date().getFullYear()} EDUCA · Maputo, Moçambique</span><span>Pagamentos confirmados manualmente pela equipa · M-Pesa e e-Mola</span></div>
          </div>
        </footer>
      )}
      <nav className="mobile-nav" aria-label="Navegação móvel">
        <NavLink to="/" className={({ isActive }) => isActive ? 'active' : ''}><Home size={19} /><span>Início</span></NavLink>
        <NavLink to="/aulas" className={({ isActive }) => isActive ? 'active' : ''}><Search size={19} /><span>Aulas</span></NavLink>
        <NavLink to="/professores" className={({ isActive }) => isActive ? 'active' : ''}><Users size={19} /><span>Professores</span></NavLink>
        <NavLink to={panel} className={({ isActive }) => isActive ? 'active' : ''}><LayoutDashboard size={19} /><span>{user ? 'Painel' : 'Entrar'}</span></NavLink>
        <NavLink to={user ? '/perfil' : '/registo'} className={({ isActive }) => isActive ? 'active' : ''}><UserIcon size={19} /><span>{user ? 'Perfil' : 'Conta'}</span></NavLink>
      </nav>
    </div>
  );
}
