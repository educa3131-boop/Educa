import db, { now, uid } from './db.js';
import jwt from 'jsonwebtoken';

export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
export function fail(res, status, message, extra = {}) { return res.status(status).json({ error: message, ...extra }); }
export function parseJSON(value, fallback = []) { try { return Array.isArray(value) ? value : JSON.parse(value || '[]'); } catch { return fallback; } }
export function toInt(value, fallback = null) { const n = Number(value); return Number.isFinite(n) ? Math.trunc(n) : fallback; }
export function toFloat(value, fallback = null) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
export function generateRoomCode() { return randomHex(16); }
import { randomBytes } from 'node:crypto';
export function randomHex(bytes = 12) { return randomBytes(bytes).toString('hex'); }
export function sanitizeRoomCode(code) { return String(code || '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 80); }

export function notify(userId, type, title, body, link = null) {
  if (!userId) return;
  db.prepare('INSERT INTO notifications (id,user_id,type,title,body,link,created_at) VALUES (?,?,?,?,?,?,?)')
    .run(uid('ntf_'), userId, type, title, body, link, now());
}
export function notifyAdmins(title, body, link = null) {
  db.prepare("SELECT id FROM users WHERE role = 'admin' AND status = 'active'").all().forEach(u => notify(u.id, 'admin', title, body, link));
}
export function audit(actor, action, entityType, entityId, details = null) {
  db.prepare('INSERT INTO audit_logs (id,actor_id,actor_name,action,entity_type,entity_id,details,created_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(uid('aud_'), actor?.id || null, actor?.name || 'Sistema', action, entityType, entityId || null, details ? JSON.stringify(details) : null, now());
}
export function getSettings() {
  const s = db.prepare('SELECT * FROM platform_settings WHERE id = 1').get();
  return s || { commission: 15, mpesa_number: '', emola_number: '', support_email: 'suporte@educa.mz', support_phone: '', announcement: '' };
}
export function teacherRating(teacherId) {
  const row = db.prepare(`SELECT AVG(rating) avg, COUNT(rating) count FROM reviews WHERE teacher_id = ? AND status = 'visible' AND rating IS NOT NULL`).get(teacherId);
  return { average: row.avg ? Math.round(Number(row.avg) * 10) / 10 : 0, count: row.count || 0 };
}
export function lessonEnd(lesson) { return new Date(new Date(lesson.start_at).getTime() + (lesson.duration || 60) * 60000).toISOString(); }
export function lessonPhase(lesson, bookings = []) {
  if (!lesson) return 'unknown';
  if (lesson.status === 'draft') return 'draft';
  if (lesson.status === 'cancelled') return 'cancelled';
  if (lesson.status === 'completed') return 'completed';
  const nowMs = Date.now();
  const start = new Date(lesson.start_at).getTime();
  const end = new Date(lesson.start_at).getTime() + (lesson.duration || 60) * 60000;
  if (nowMs >= end) return 'completed';
  if (nowMs >= start) return 'in_progress';
  if (bookings.some(b => b.status === 'paid' || b.status === 'completed')) return 'confirmed';
  if (bookings.some(b => b.status === 'pending')) return 'awaiting_payment';
  const taken = bookings.filter(b => ['pending','paid','completed'].includes(b.status)).length;
  if (taken >= lesson.seats) return 'booked';
  return 'published';
}
export const PHASE_LABELS = {
  draft: 'Rascunho', published: 'Publicada', booked: 'Reservada', awaiting_payment: 'Aguardando pagamento',
  confirmed: 'Confirmada', in_progress: 'Em andamento', completed: 'Concluída', cancelled: 'Cancelada', unknown: 'Desconhecido'
};
export function seatsTaken(lessonId) {
  return db.prepare(`SELECT COUNT(*) c FROM bookings WHERE lesson_id = ? AND status IN ('pending','paid','completed')`).get(lessonId).c;
}
export function bookingConflict(studentId, startAt, duration, excludeBookingId = null) {
  const start = new Date(startAt).getTime();
  const end = start + duration * 60000;
  const rows = db.prepare(`SELECT l.start_at, l.duration FROM bookings b JOIN lessons l ON l.id = b.lesson_id
    WHERE b.student_id = ? AND b.status IN ('pending','paid','completed') AND l.status = 'published' AND b.id <> ?`).all(studentId, excludeBookingId || '');
  return rows.some(r => {
    const s = new Date(r.start_at).getTime(); const e = s + (r.duration || 60) * 60000;
    return start < e && end > s;
  });
}
export function teacherConflict(teacherId, startAt, duration, excludeLessonId = null) {
  const start = new Date(startAt).getTime(); const end = start + duration * 60000;
  const rows = db.prepare(`SELECT start_at, duration FROM lessons WHERE teacher_id = ? AND status = 'published' AND id <> ?`).all(teacherId, excludeLessonId || '');
  return rows.some(r => { const s = new Date(r.start_at).getTime(); const e = s + (r.duration || 60) * 60000; return start < e && end > s; });
}
export function roomUrl(code) {
  const clean = sanitizeRoomCode(code);
  const jaas = process.env.JITSI_JAAS_DOMAIN;
  if (jaas) {
    const payload = { aud: 'jitsi', iss: process.env.JITSI_JAAS_ISS || 'educa', sub: process.env.JITSI_JAAS_SUB || '*', room: clean, exp: Math.floor(Date.now() / 1000) + 7200 };
    const privateKey = process.env.JITSI_JAAS_PRIVATE_KEY;
    if (privateKey) {
      const token = jwt.sign(payload, privateKey, { algorithm: 'RS256', header: { kid: process.env.JITSI_JAAS_KID, typ: 'JWT' } });
      return `https://${jaas}/${clean}#jwt=${token}&config.prejoinPageEnabled=false&config.startWithAudioMuted=false&config.disableDeepLinking=true`;
    }
  }
  return `https://meet.jit.si/educa-${clean}#config.prejoinPageEnabled=false&config.startWithAudioMuted=false&config.disableDeepLinking=true`;
}
export function pagination(query) {
  const page = Math.max(1, toInt(query.page, 1) || 1);
  const limit = Math.min(100, Math.max(1, toInt(query.limit, 20) || 20));
  return { page, limit, offset: (page - 1) * limit };
}
export function publicTeacher(row) {
  if (!row) return null;
  return {
    id: row.user_id, name: row.name, headline: row.headline, bio: row.bio, city: row.city, price: row.price,
    subjects: parseJSON(row.subjects), levels: parseJSON(row.levels), photoFileId: row.photo_file_id || null,
    rating: teacherRating(row.user_id), published: !!row.published, isDemo: !!row.demo
  };
}
