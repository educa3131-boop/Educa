import { Router } from 'express';
import { z } from 'zod';
import db, { now, uid, hashToken, verifyPassword, hashPassword , runTx } from '../db.js';
import { authState, createSession, setSessionCookie, clearSessionCookie, destroySession, requireAuth, getSessionUser } from '../auth.js';
import { asyncHandler, fail, notify, audit } from '../helpers.js';
import { sendMail, exposeDevLinks } from '../mailer.js';

const router = Router();
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const registerSchema = z.object({
  name: z.string().trim().min(2).max(80), email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(128), phone: z.string().trim().max(30).optional().or(z.literal(''))
});
const loginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) });
const profileSchema = z.object({ name: z.string().trim().min(2).max(80).optional(), phone: z.string().trim().max(30).optional(), city: z.string().trim().max(80).optional(), bio: z.string().trim().max(1200).optional(), avatarFileId: z.string().optional() });

function issueVerification(user) {
  const token = uid('ev_') + uid('');
  const expires = new Date(Date.now() + 48 * 3600e3).toISOString();
  db.prepare('INSERT INTO email_verifications (id,user_id,token_hash,expires_at,created_at) VALUES (?,?,?,?,?)')
    .run(uid('evr_'), user.id, hashToken(token), expires, now());
  const url = `${process.env.APP_URL || 'http://localhost:3000'}/verificar-email?token=${token}`;
  sendMail({ to: user.email, subject: 'Confirma o teu email na EDUCA', text: `Confirma o teu email: ${url}`, html: `<p>Olá ${user.name},</p><p>Confirma o teu email na EDUCA:</p><p><a href="${url}">${url}</a></p>` });
  return { token, url };
}

router.post('/register', asyncHandler(async (req, res) => {
  const data = registerSchema.parse(req.body);
  if (!emailRe.test(data.email)) return fail(res, 400, 'Email inválido.');
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(data.email)) return fail(res, 409, 'Já existe uma conta com este email.');
  const id = uid('usr_');
  db.prepare(`INSERT INTO users (id,email,password_hash,name,phone,role,status,email_verified,created_at,updated_at)
    VALUES (?,?,?,?,?,'student','active',0,?,?)`).run(id, data.email, hashPassword(data.password), data.name, data.phone || null, now(), now());
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  const mail = issueVerification(user);
  const token = createSession(id, req.get('user-agent'));
  setSessionCookie(res, token);
  audit(user, 'auth.register', 'user', id, { email: data.email });
  res.status(201).json({ user: authState(user), verification: exposeDevLinks() ? { url: mail.url } : { sent: true } });
}));

router.post('/login', asyncHandler(async (req, res) => {
  const data = loginSchema.parse(req.body);
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(data.email);
  if (!user || !verifyPassword(data.password, user.password_hash)) return fail(res, 401, 'Email ou palavra-passe incorrectos.');
  if (user.status !== 'active') return fail(res, 403, 'Esta conta está suspensa. Contacta o suporte da EDUCA.');
  const token = createSession(user.id, req.get('user-agent'));
  setSessionCookie(res, token);
  audit(user, 'auth.login', 'user', user.id, null);
  res.json({ user: authState(user) });
}));

router.post('/logout', (req, res) => { destroySession(req); clearSessionCookie(res); res.json({ ok: true }); });
router.get('/me', (req, res) => {
  const token = req.cookies?.educa_session;
  if (!token) return res.json({ user: null });
  res.json({ user: authState(getSessionUser(req)) });
});

router.post('/forgot-password', asyncHandler(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  let devUrl = null;
  if (user) {
    const token = uid('pr_') + uid('');
    db.prepare('INSERT INTO password_resets (id,user_id,token_hash,expires_at,created_at) VALUES (?,?,?,?,?)')
      .run(uid('prr_'), user.id, hashToken(token), new Date(Date.now() + 3600e3).toISOString(), now());
    const url = `${process.env.APP_URL || 'http://localhost:3000'}/repor-palavra-passe?token=${token}`;
    await sendMail({ to: user.email, subject: 'Repõe a tua palavra-passe EDUCA', text: `Repõe a palavra-passe: ${url}`, html: `<p><a href="${url}">${url}</a></p>` });
    devUrl = url;
  }
  res.json({ ok: true, ...(exposeDevLinks() && devUrl ? { devUrl } : {}) });
}));

router.post('/reset-password', asyncHandler(async (req, res) => {
  const schema = z.object({ token: z.string().min(10), password: z.string().min(8).max(128) });
  const { token, password } = schema.parse(req.body);
  const row = db.prepare('SELECT * FROM password_resets WHERE token_hash = ? AND used_at IS NULL').get(hashToken(token));
  if (!row || new Date(row.expires_at) < new Date()) return fail(res, 400, 'Link inválido ou expirado.');
  runTx(() => {
    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(hashPassword(password), now(), row.user_id);
    db.prepare('UPDATE password_resets SET used_at = ? WHERE id = ?').run(now(), row.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(row.user_id);
  });
  res.json({ ok: true });
}));

router.post('/verify-email', asyncHandler(async (req, res) => {
  const token = String(req.body?.token || '');
  const row = db.prepare('SELECT * FROM email_verifications WHERE token_hash = ? AND used_at IS NULL').get(hashToken(token));
  if (!row || new Date(row.expires_at) < new Date()) return fail(res, 400, 'Link de verificação inválido ou expirado.');
  db.prepare('UPDATE users SET email_verified = 1, updated_at = ? WHERE id = ?').run(now(), row.user_id);
  db.prepare('UPDATE email_verifications SET used_at = ? WHERE id = ?').run(now(), row.id);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id);
  notify(user.id, 'account', 'Email confirmado', 'O teu email foi confirmado com sucesso.', '/painel');
  res.json({ ok: true, user: authState(user) });
}));

router.post('/resend-verification', requireAuth, asyncHandler(async (req, res) => {
  if (req.user.email_verified) return res.json({ ok: true });
  const mail = issueVerification(req.user);
  res.json({ ok: true, ...(exposeDevLinks() ? { url: mail.url } : {}) });
}));

router.patch('/profile', requireAuth, asyncHandler(async (req, res) => {
  const data = profileSchema.parse(req.body);
  const fields = []; const values = [];
  for (const [k, v] of Object.entries(data)) { if (v !== undefined) { fields.push(`${k === 'avatarFileId' ? 'avatar_file_id' : k} = ?`); values.push(v); } }
  if (!fields.length) return fail(res, 400, 'Nada para actualizar.');
  fields.push('updated_at = ?'); values.push(now(), req.user.id);
  db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  res.json({ user: authState(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)) });
}));

router.post('/change-password', requireAuth, asyncHandler(async (req, res) => {
  const schema = z.object({ current: z.string().min(1), next: z.string().min(8).max(128) });
  const { current, next } = schema.parse(req.body);
  if (!verifyPassword(current, req.user.password_hash)) return fail(res, 400, 'Palavra-passe actual incorrecta.');
  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(hashPassword(next), now(), req.user.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND id <> ?').run(req.user.id, hashToken(req.cookies.educa_session || ''));
  res.json({ ok: true });
}));

export default router;
