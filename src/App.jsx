import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { ToastProvider, Spinner } from './components/ui.jsx';
import Layout from './components/Layout.jsx';
import Home from './pages/Home.jsx';
import Lessons from './pages/Lessons.jsx';
import LessonDetail from './pages/LessonDetail.jsx';
import Teachers from './pages/Teachers.jsx';
import TeacherProfile from './pages/TeacherProfile.jsx';
import TeacherLanding from './pages/TeacherLanding.jsx';
import StudentPanel from './pages/StudentPanel.jsx';
import TeacherPanel from './pages/TeacherPanel.jsx';
import AdminPanel from './pages/AdminPanel.jsx';
import LiveRoom from './pages/LiveRoom.jsx';
import MessagesPage from './pages/MessagesPage.jsx';
import NotificationsPage from './pages/NotificationsPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import NotFound from './pages/NotFound.jsx';
import { Login, Register, ForgotPassword, ResetPassword, VerifyEmail } from './pages/AuthPages.jsx';

function Protected({ children, roles }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="loading-row" style={{ minHeight: '60vh' }}><Spinner large /> A validar a tua sessão…</div>;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={user.role === 'admin' ? '/admin' : user.role === 'teacher' ? '/professor' : '/painel'} replace />;
  return children;
}
function RoleRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-row" style={{ minHeight: '60vh' }}><Spinner large /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === 'admin' ? '/admin' : user.role === 'teacher' ? '/professor' : '/painel'} replace />;
}
export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Home />} />
            <Route path="/aulas" element={<Lessons />} />
            <Route path="/aula/:id" element={<LessonDetail />} />
            <Route path="/professores" element={<Teachers />} />
            <Route path="/professor/:id" element={<TeacherProfile />} />
            <Route path="/ensinar" element={<TeacherLanding />} />
            <Route path="/entrar" element={<Navigate to="/login" replace />} />
            <Route path="/painel" element={<Protected roles={['student']}><StudentPanel /></Protected>} />
            <Route path="/professor" element={<Protected><TeacherPanel /></Protected>} />
            <Route path="/admin" element={<Protected roles={['admin']}><AdminPanel /></Protected>} />
            <Route path="/sala/:lessonId" element={<Protected><LiveRoom /></Protected>} />
            <Route path="/mensagens" element={<Protected><MessagesPage /></Protected>} />
            <Route path="/notificacoes" element={<Protected><NotificationsPage /></Protected>} />
            <Route path="/perfil" element={<Protected><ProfilePage /></Protected>} />
            <Route path="*" element={<NotFound />} />
          </Route>
          <Route path="/login" element={<Login />} />
          <Route path="/registo" element={<Register />} />
          <Route path="/esqueci-palavra-passe" element={<ForgotPassword />} />
          <Route path="/repor-palavra-passe" element={<ResetPassword />} />
          <Route path="/verificar-email" element={<VerifyEmail />} />
          <Route path="/painel" element={<RoleRedirect />} />
        </Routes>
      </ToastProvider>
    </AuthProvider>
  );
}
