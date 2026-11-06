import { Router } from 'express';
import db from '../db.js';
import { asyncHandler, fail, parseJSON, teacherRating, lessonPhase, seatsTaken, getSettings, publicTeacher } from '../helpers.js';

const router = Router();

router.get('/settings', (req, res) => {
  const s = getSettings();
  res.json({ commission: s.commission, mpesaNumber: s.mpesa_number, emolaNumber: s.emola_number, supportEmail: s.support_email, supportPhone: s.support_phone, announcement: s.announcement, emailConfigured: !!process.env.RESEND_API_KEY, provider: process.env.JITSI_JAAS_DOMAIN ? 'jaas' : 'public' });
});
router.get('/subjects', (req, res) => {
  res.json(db.prepare('SELECT id,name,slug,icon FROM subjects WHERE active = 1 ORDER BY sort_order').all());
});
router.get('/levels', (req, res) => {
  res.json(db.prepare('SELECT id,name,slug FROM education_levels WHERE active = 1 ORDER BY sort_order').all());
});

router.get('/teachers', asyncHandler(async (req, res) => {
  const rows = db.prepare(`SELECT p.*, u.status AS user_status, u.city AS user_city, u.demo FROM profiles p JOIN users u ON u.id = p.user_id
    WHERE p.published = 1 AND u.status = 'active' ORDER BY p.name`).all();
  const subjects = db.prepare('SELECT id,name,slug FROM subjects').all();
  const levels = db.prepare('SELECT id,name,slug FROM education_levels').all();
  const subMap = Object.fromEntries(subjects.map(s => [s.id, s.name]));
  const lvlMap = Object.fromEntries(levels.map(l => [l.id, l.name]));
  let list = rows.map(r => {
    const rating = teacherRating(r.user_id);
    return { ...publicTeacher(r), subjectNames: parseJSON(r.subjects).map(id => subMap[id]).filter(Boolean), levelNames: parseJSON(r.levels).map(id => lvlMap[id]).filter(Boolean), rating };
  });
  const q = String(req.query.q || '').trim().toLowerCase();
  if (q) list = list.filter(t => [t.name, t.headline, t.city, ...t.subjectNames, ...t.levelNames].join(' ').toLowerCase().includes(q));
  if (req.query.subject) list = list.filter(t => parseJSON(rows.find(r => r.user_id === t.id)?.subjects || []).includes(req.query.subject));
  if (req.query.level) list = list.filter(t => parseJSON(rows.find(r => r.user_id === t.id)?.levels || []).includes(req.query.level));
  if (req.query.maxPrice) list = list.filter(t => Number(t.price) <= Number(req.query.maxPrice));
  if (req.query.minRating) list = list.filter(t => t.rating.average >= Number(req.query.minRating));
  if (req.query.city) list = list.filter(t => (t.city || '').toLowerCase().includes(String(req.query.city).toLowerCase()));
  list.sort((a, b) => b.rating.average - a.rating.average || b.rating.count - a.rating.count || a.name.localeCompare(b.name));
  res.json({ teachers: list, total: list.length });
}));

router.get('/teachers/:id', asyncHandler(async (req, res) => {
  const row = db.prepare(`SELECT p.*, u.status AS user_status, u.demo FROM profiles p JOIN users u ON u.id = p.user_id WHERE p.user_id = ?`).get(req.params.id);
  if (!row || !row.published || row.user_status !== 'active') return fail(res, 404, 'Professor não encontrado.');
  const subjects = db.prepare('SELECT id,name,slug FROM subjects').all();
  const levels = db.prepare('SELECT id,name,slug FROM education_levels').all();
  const subMap = Object.fromEntries(subjects.map(s => [s.id, s.name]));
  const lvlMap = Object.fromEntries(levels.map(l => [l.id, l.name]));
  const lessons = db.prepare(`SELECT l.*, s.name subject_name, e.name level_name,
      (SELECT COUNT(*) FROM bookings b WHERE b.lesson_id=l.id AND b.status IN ('pending','paid','completed')) taken
    FROM lessons l JOIN subjects s ON s.id=l.subject_id JOIN education_levels e ON e.id=l.level_id
    WHERE l.teacher_id = ? AND l.status = 'published' AND l.start_at >= ? ORDER BY l.start_at LIMIT 30`).all(req.params.id, new Date().toISOString());
  const schedules = db.prepare('SELECT weekday,start_time,end_time FROM schedules WHERE teacher_id = ? AND active = 1 ORDER BY weekday').all(req.params.id);
  const reviews = db.prepare(`SELECT r.rating, r.comment, r.created_at, u.name student_name, l.title lesson_title
    FROM reviews r JOIN users u ON u.id=r.student_id JOIN lessons l ON l.id=r.lesson_id
    WHERE r.teacher_id = ? AND r.status='visible' AND r.rating IS NOT NULL ORDER BY r.created_at DESC LIMIT 50`).all(req.params.id);
  res.json({
    teacher: { ...publicTeacher(row), subjectNames: parseJSON(row.subjects).map(id => subMap[id]).filter(Boolean), levelNames: parseJSON(row.levels).map(id => lvlMap[id]).filter(Boolean) },
    lessons: lessons.map(l => ({ ...l, seatsLeft: l.seats - l.taken, phase: lessonPhase(l, []) })),
    schedules, reviews, rating: teacherRating(req.params.id)
  });
}));

router.get('/lessons', asyncHandler(async (req, res) => {
  const nowIso = new Date().toISOString();
  const rows = db.prepare(`SELECT l.*, s.name subject_name, s.slug subject_slug, e.name level_name, e.slug level_slug,
      p.name teacher_name, p.headline teacher_headline, p.city teacher_city, p.photo_file_id,
      (SELECT COUNT(*) FROM bookings b WHERE b.lesson_id=l.id AND b.status IN ('pending','paid','completed')) taken,
      (SELECT COUNT(*) FROM bookings b WHERE b.lesson_id=l.id AND b.status='pending') pending,
      (SELECT COUNT(*) FROM bookings b WHERE b.lesson_id=l.id AND b.status IN ('paid','completed')) paid
    FROM lessons l JOIN subjects s ON s.id=l.subject_id JOIN education_levels e ON e.id=l.level_id
    JOIN profiles p ON p.user_id=l.teacher_id
    WHERE l.status = 'published' AND l.start_at >= ? ORDER BY l.start_at LIMIT 200`).all(nowIso);
  let list = rows.map(l => ({ ...l, seatsLeft: Math.max(0, l.seats - l.taken), phase: lessonPhase(l, [{ status: l.pending ? 'pending' : null }, { status: l.paid ? 'paid' : null }]) }));
  const q = String(req.query.q || '').trim().toLowerCase();
  if (q) list = list.filter(l => [l.title, l.description, l.subject_name, l.level_name, l.teacher_name, l.teacher_city].join(' ').toLowerCase().includes(q));
  if (req.query.subject) list = list.filter(l => l.subject_slug === req.query.subject);
  if (req.query.level) list = list.filter(l => l.level_slug === req.query.level);
  if (req.query.mode) list = list.filter(l => l.mode === req.query.mode);
  if (req.query.maxPrice) list = list.filter(l => Number(l.price) <= Number(req.query.maxPrice));
  if (req.query.teacher) list = list.filter(l => l.teacher_id === req.query.teacher);
  const sort = req.query.sort || 'date';
  if (sort === 'price_asc') list.sort((a,b) => a.price - b.price);
  else if (sort === 'price_desc') list.sort((a,b) => b.price - a.price);
  else if (sort === 'rating') list.sort((a,b) => teacherRating(b.teacher_id).average - teacherRating(a.teacher_id).average);
  else list.sort((a,b) => new Date(a.start_at) - new Date(b.start_at));
  res.json({ lessons: list, total: list.length });
}));

router.get('/lessons/:id', asyncHandler(async (req, res) => {
  const l = db.prepare(`SELECT l.*, s.name subject_name, e.name level_name,
      p.name teacher_name, p.headline teacher_headline, p.bio teacher_bio, p.city teacher_city, p.price teacher_price, p.photo_file_id,
      (SELECT COUNT(*) FROM bookings b WHERE b.lesson_id=l.id AND b.status IN ('pending','paid','completed')) taken
    FROM lessons l JOIN subjects s ON s.id=l.subject_id JOIN education_levels e ON e.id=l.level_id
    JOIN profiles p ON p.user_id=l.teacher_id WHERE l.id = ?`).get(req.params.id);
  if (!l) return fail(res, 404, 'Aula não encontrada.');
  const bookings = db.prepare('SELECT status FROM bookings WHERE lesson_id = ?').all(l.id);
  const reviews = db.prepare(`SELECT r.rating, r.comment, r.created_at, u.name student_name FROM reviews r JOIN users u ON u.id=r.student_id
    WHERE r.teacher_id = ? AND r.status='visible' AND r.rating IS NOT NULL ORDER BY r.created_at DESC LIMIT 30`).all(l.teacher_id);
  const schedules = db.prepare('SELECT weekday,start_time,end_time FROM schedules WHERE teacher_id = ? AND active = 1 ORDER BY weekday').all(l.teacher_id);
  res.json({ lesson: { ...l, seatsLeft: Math.max(0, l.seats - l.taken), phase: lessonPhase(l, bookings) }, reviews, rating: teacherRating(l.teacher_id), schedules, settings: (() => { const s = getSettings(); return { mpesaNumber: s.mpesa_number, emolaNumber: s.emola_number, commission: s.commission }; })() });
}));

export default router;
