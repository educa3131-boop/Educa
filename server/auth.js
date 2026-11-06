import db, { now, uid, hashToken } from './db.js';
import { randomBytes } from 'node:crypto';

export const SESSION_COOKIE = 'educa_session';
const SESSION_DAYS = 7;

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000
  };
}
export function setSessionCookie(res, token) { res.cookie(SESSION_COOKIE, token, sessionCookieOptions()); }
export function clearSessionCookie(res) { res.clearCookie(SESSION_COOKIE, { ...sessionCookieOptions(), maxAge: undefined }); }

export function createSession(userId, userAgent = '') {
  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  db.prepare('INSERT INTO sessions (id,user_id,expires_at,user_agent,created_at) VALUES (?,?,?,?,?)')
    .run(hashToken(token), userId, expires, userAgent.slice(0, 300), now());
  return token;
}

export function destroySession(req) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) db.prepare('DELETE FROM sessions WHERE id = ?').run(hashToken(token));
}

export function getSessionUser(req) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return null;
  const row = db.prepare(`SELECT u.*, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`).get(hashToken(token));
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(hashToken(token));
    return null;
  }
  if (row.status !== 'active') return null;
  return row;
}

export function authState(user) {
  if (!user) return null;
  const application = db.prepare('SELECT id,status,headline,city,price,subjects,levels,rejection_reason,created_at FROM teacher_applications WHERE user_id = ?').get(user.id);
  const profile = db.prepare('SELECT id,published,headline,city,price,subjects,levels FROM profiles WHERE user_id = ?').get(user.id);
  return {
    id: user.id, name: user.name, email: user.email, phone: user.phone, city: user.city, bio: user.bio,
    role: user.role, status: user.status, isOwner: !!user.is_owner, emailVerified: !!user.email_verified,
    avatarFileId: user.avatar_file_id, isDemo: !!user.demo, createdAt: user.created_at,
    application: application ? { ...application, subjects: JSON.parse(application.subjects), levels: JSON.parse(application.levels) } : null,
    profile: profile ? { ...profile, published: !!profile.published, subjects: JSON.parse(profile.subjects), levels: JSON.parse(profile.levels) } : null
  };
}

export function requireAuth(req, res, next) {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'Sessão necessária. Inicia sessão para continuar.' });
  req.user = user;
  next();
}
export function requireVerified(req, res, next) {
  if (!req.user?.email_verified) return res.status(403).json({ error: 'Confirma o teu email antes de continuar.' });
  next();
}
export function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Sessão necessária.' });
    if (req.user.role !== role) return res.status(403).json({ error: 'Não tens permissão para esta operação.' });
    next();
  };
}
export function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Sessão necessária.' });
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Área reservada à equipa EDUCA.' });
  next();
}
export function requireOwner(req, res, next) {
  if (!req.user?.is_owner) return res.status(403).json({ error: 'Apenas o proprietário da plataforma pode executar esta ação.' });
  next();
}
