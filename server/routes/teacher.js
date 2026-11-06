import { Router } from 'express';
import { z } from 'zod';
import db, { now, uid , runTx } from '../db.js';
import { requireAuth, requireRole } from '../auth.js';
import { asyncHandler, fail, parseJSON, notify, notifyAdmins, audit, generateRoomCode, teacherConflict, teacherRating, getSettings, toFloat, toInt } from '../helpers.js';

const router = Router();
router.use(requireAuth);

const applicationSchema = z.object({
  name: z.string().trim().min(2).max(80), headline: z.string().trim().min(4).max(140), bio: z.string().trim().min(20).max(4000),
  city: z.string().trim().min(2).max(80), phone: z.string().trim().min(8).max(30), price: z.number().min(0).max(100000),
  subjects: z.array(z.string()).min(1), levels: z.array(z.string()).min(1),
  documents: z.array(z.object({ kind: z.enum(['id','diploma','certificate','other']), fileId: z.string().min(1) })).max(10).default([])
});

router.get('/application', (req, res) => {
  const app = db.prepare('SELECT * FROM teacher_applications WHERE user_id = ?').get(req.user.id);
  if (!app) return res.json({ application: null });
  const docs = db.prepare('SELECT id,kind,file_id,filename,created_at FROM teacher_documents WHERE application_id = ?').all(app.id);
  res.json({ application: { ...app, subjects: parseJSON(app.subjects), levels: parseJSON(app.levels), documents: docs } });
});

router.post('/application', asyncHandler(async (req, res) => {
  if (req.user.role === 'teacher') return fail(res, 409, 'Já és professor aprovado na EDUCA.');
  if (!req.user.email_verified) return fail(res, 403, 'Confirma o teu email antes de submeter a candidatura.');
  const data = applicationSchema.parse(req.body);
  const existing = db.prepare('SELECT * FROM teacher_applications WHERE user_id = ?').get(req.user.id);
  if (existing?.status === 'pending') return fail(res, 409, 'A tua candidatura já está em análise.');
  if (existing?.status === 'approved') return fail(res, 409, 'A tua candidatura já foi aprovada.');
  const subjectIds = db.prepare(`SELECT id FROM subjects WHERE id IN (${data.subjects.map(()=>'?').join(',')})`).all(...data.subjects).map(r => r.id);
  const levelIds = db.prepare(`SELECT id FROM education_levels WHERE id IN (${data.levels.map(()=>'?').join(',')})`).all(...data.levels).map(r => r.id);
  if (!subjectIds.length || !levelIds.length) return fail(res, 400, 'Selecciona disciplinas e níveis válidos.');
  const docs = [];
  for (const d of data.documents) {
    const file = db.prepare('SELECT * FROM files WHERE id = ? AND owner_id = ?').get(d.fileId, req.user.id);
    if (!file) return fail(res, 400, 'Documento inválido. Carrega novamente o ficheiro.');
    docs.push({ ...d, file });
  }
  const appId = existing?.id || uid('app_');
  runTx(() => {
    if (existing) {
      db.prepare(`UPDATE teacher_applications SET name=?,headline=?,bio=?,city=?,phone=?,price=?,subjects=?,levels=?,status='pending',rejection_reason=NULL,reviewed_by=NULL,reviewed_at=NULL,updated_at=? WHERE id=?`)
        .run(data.name, data.headline, data.bio, data.city, data.phone, data.price, JSON.stringify(subjectIds), JSON.stringify(levelIds), now(), appId);
      db.prepare('DELETE FROM teacher_documents WHERE application_id = ?').run(appId);
    } else {
      db.prepare(`INSERT INTO teacher_applications (id,user_id,name,headline,bio,city,phone,price,subjects,levels,status,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,'pending',?,?)`).run(appId, req.user.id, data.name, data.headline, data.bio, data.city, data.phone, data.price, JSON.stringify(subjectIds), JSON.stringify(levelIds), now(), now());
    }
    const insDoc = db.prepare('INSERT INTO teacher_documents (id,application_id,user_id,kind,file_id,filename,created_at) VALUES (?,?,?,?,?,?,?)');
    for (const d of docs) insDoc.run(uid('doc_'), appId, req.user.id, d.kind, d.fileId, d.file.filename, now());
  });
  notifyAdmins('Nova candidatura de professor', `${data.name} submeteu uma candidatura para professor.`, '/admin');
  audit(req.user, 'teacher.apply', 'application', appId, { name: data.name });
  res.status(201).json({ ok: true, applicationId: appId });
}));

router.get('/dashboard', requireRole('teacher'), asyncHandler(async (req, res) => {
  const lessons = db.prepare(`SELECT l.*, s.name subject_name, e.name level_name,
    (SELECT COUNT(*) FROM bookings b WHERE b.lesson_id=l.id AND b.status IN ('pending','paid','completed')) taken
    FROM lessons l JOIN subjects s ON s.id=l.subject_id JOIN education_levels e ON e.id=l.level_id
    WHERE l.teacher_id = ? ORDER BY l.start_at DESC`).all(req.user.id);
  const bookings = db.prepare(`SELECT b.*, l.title lesson_title, l.start_at, l.duration, u.name student_name, u.email student_email
    FROM bookings b JOIN lessons l ON l.id=b.lesson_id JOIN users u ON u.id=b.student_id
    WHERE l.teacher_id = ? ORDER BY b.created_at DESC`).all(req.user.id);
  const wallet = db.prepare('SELECT * FROM teacher_wallets WHERE teacher_id = ?').get(req.user.id);
  const transactions = db.prepare('SELECT * FROM wallet_transactions WHERE teacher_id = ? ORDER BY created_at DESC LIMIT 50').all(req.user.id);
  const withdrawals = db.prepare('SELECT * FROM withdrawal_requests WHERE teacher_id = ? ORDER BY requested_at DESC').all(req.user.id);
  const reviews = db.prepare(`SELECT r.*, u.name student_name, l.title lesson_title FROM reviews r JOIN users u ON u.id=r.student_id JOIN lessons l ON l.id=r.lesson_id WHERE r.teacher_id = ? ORDER BY r.created_at DESC`).all(req.user.id);
  const pendingWithdrawals = db.prepare("SELECT COALESCE(SUM(amount),0) total FROM withdrawal_requests WHERE teacher_id = ? AND status='pending'").get(req.user.id).total;
  const earned = db.prepare("SELECT COALESCE(SUM(amount),0) total FROM wallet_transactions WHERE teacher_id = ?").get(req.user.id).total;
  res.json({
    lessons, bookings, wallet: wallet || { balance: 0, total_earned: 0, total_withdrawn: 0 },
    summary: { earned, balance: earned, pendingWithdrawals, available: Math.max(0, earned - pendingWithdrawals), rating: teacherRating(req.user.id) },
    transactions, withdrawals, reviews
  });
}));

const lessonSchema = z.object({
  title: z.string().trim().min(4).max(120), description: z.string().trim().min(10).max(4000),
  subject: z.string().min(1), level: z.string().min(1), mode: z.enum(['individual','grupo']),
  price: z.number().min(0).max(100000), duration: z.number().int().min(15).max(480), startAt: z.string().min(10),
  seats: z.number().int().min(1).max(200), publish: z.boolean().default(true)
});

router.get('/lessons', requireRole('teacher'), (req, res) => {
  res.json({ lessons: db.prepare(`SELECT l.*, s.name subject_name, e.name level_name FROM lessons l JOIN subjects s ON s.id=l.subject_id JOIN education_levels e ON e.id=l.level_id WHERE l.teacher_id = ? ORDER BY l.start_at DESC`).all(req.user.id) });
});

router.post('/lessons', requireRole('teacher'), asyncHandler(async (req, res) => {
  const data = lessonSchema.parse(req.body);
  if (data.mode === 'individual') data.seats = 1;
  const start = new Date(data.startAt);
  if (Number.isNaN(start.getTime())) return fail(res, 400, 'Data/hora inválida.');
  if (start.getTime() < Date.now() - 60000) return fail(res, 400, 'A aula tem de começar no futuro.');
  if (teacherConflict(req.user.id, data.startAt, data.duration)) return fail(res, 409, 'Já tens outra aula publicada que coincide com este horário.');
  const subject = db.prepare('SELECT id FROM subjects WHERE id = ?').get(data.subject);
  const level = db.prepare('SELECT id FROM education_levels WHERE id = ?').get(data.level);
  if (!subject || !level) return fail(res, 400, 'Disciplina ou nível inválido.');
  const id = uid('ls_');
  db.prepare(`INSERT INTO lessons (id,teacher_id,title,description,subject_id,level_id,mode,price,duration,start_at,seats,status,room_code,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, req.user.id, data.title, data.description, data.subject, data.level, data.mode, data.price, data.duration, start.toISOString(), data.seats, data.publish ? 'published' : 'draft', generateRoomCode(), now(), now());
  audit(req.user, 'lesson.create', 'lesson', id, { title: data.title, price: data.price });
  res.status(201).json({ ok: true, id });
}));

router.patch('/lessons/:id', requireRole('teacher'), asyncHandler(async (req, res) => {
  const lesson = db.prepare('SELECT * FROM lessons WHERE id = ? AND teacher_id = ?').get(req.params.id, req.user.id);
  if (!lesson) return fail(res, 404, 'Aula não encontrada.');
  if (lesson.status === 'cancelled' || lesson.status === 'completed') return fail(res, 400, 'Aulas canceladas ou concluídas não podem ser editadas.');
  const paid = db.prepare("SELECT COUNT(*) c FROM bookings WHERE lesson_id = ? AND status IN ('paid','completed')").get(lesson.id).c;
  const schema = lessonSchema.partial().extend({ publish: z.boolean().optional() });
  const data = schema.parse(req.body);
  if (paid && (data.startAt || data.price !== undefined || data.seats !== undefined || data.mode || data.subject || data.level)) {
    return fail(res, 409, 'Esta aula já tem pagamentos confirmados. Só o título e a descrição podem ser alterados.');
  }
  const fields = []; const values = [];
  const map = { title: 'title', description: 'description', subject: 'subject_id', level: 'level_id', mode: 'mode', price: 'price', duration: 'duration', seats: 'seats' };
  for (const [k, col] of Object.entries(map)) if (data[k] !== undefined) { fields.push(`${col} = ?`); values.push(data[k]); }
  if (data.startAt) { const d = new Date(data.startAt); if (Number.isNaN(d.getTime())) return fail(res, 400, 'Data inválida.'); fields.push('start_at = ?'); values.push(d.toISOString()); }
  if (data.publish !== undefined) { fields.push('status = ?'); values.push(data.publish ? 'published' : 'draft'); }
  if (!fields.length) return fail(res, 400, 'Nada para actualizar.');
  fields.push('updated_at = ?'); values.push(now(), lesson.id);
  db.prepare(`UPDATE lessons SET ${fields.join(',')} WHERE id = ?`).run(...values);
  audit(req.user, 'lesson.update', 'lesson', lesson.id, data);
  res.json({ ok: true });
}));

router.post('/lessons/:id/cancel', requireRole('teacher'), asyncHandler(async (req, res) => {
  const lesson = db.prepare('SELECT * FROM lessons WHERE id = ? AND teacher_id = ?').get(req.params.id, req.user.id);
  if (!lesson) return fail(res, 404, 'Aula não encontrada.');
  if (['cancelled','completed'].includes(lesson.status)) return fail(res, 400, 'Esta aula já está fechada.');
  const reason = String(req.body?.reason || 'Cancelada pelo professor.').slice(0, 300);
  runTx(() => {
    db.prepare("UPDATE lessons SET status='cancelled', updated_at=? WHERE id=?").run(now(), lesson.id);
    const pending = db.prepare("SELECT * FROM bookings WHERE lesson_id = ? AND status='pending'").all(lesson.id);
    for (const b of pending) {
      db.prepare("UPDATE bookings SET status='cancelled', cancelled_at=?, cancellation_reason=? WHERE id=?").run(now(), reason, b.id);
      notify(b.student_id, 'booking', 'Reserva cancelada', `A aula "${lesson.title}" foi cancelada. O lugar foi libertado.`, '/painel');
    }
    const paid = db.prepare("SELECT * FROM bookings WHERE lesson_id = ? AND status IN ('paid','completed')").all(lesson.id);
    for (const b of paid) notify(b.student_id, 'booking', 'Aula cancelada — reembolso a processar', `A aula "${lesson.title}" foi cancelada. A equipa EDUCA vai processar o reembolso.`, '/painel');
  });
  audit(req.user, 'lesson.cancel', 'lesson', lesson.id, { reason });
  res.json({ ok: true });
}));

router.post('/lessons/:id/complete', requireRole('teacher'), asyncHandler(async (req, res) => {
  const lesson = db.prepare('SELECT * FROM lessons WHERE id = ? AND teacher_id = ?').get(req.params.id, req.user.id);
  if (!lesson) return fail(res, 404, 'Aula não encontrada.');
  if (new Date(lesson.start_at).getTime() > Date.now()) return fail(res, 400, 'A aula ainda não começou.');
  runTx(() => {
    db.prepare("UPDATE lessons SET status='completed', updated_at=? WHERE id=?").run(now(), lesson.id);
    const paid = db.prepare("SELECT * FROM bookings WHERE lesson_id = ? AND status='paid'").all(lesson.id);
    for (const b of paid) {
      db.prepare("UPDATE bookings SET status='completed' WHERE id=?").run(b.id);
      notify(b.student_id, 'lesson', 'Aula concluída', `A aula "${lesson.title}" foi concluída. Já podes avaliar o professor.`, '/painel');
    }
  });
  audit(req.user, 'lesson.complete', 'lesson', lesson.id, null);
  res.json({ ok: true });
}));

router.get('/students', requireRole('teacher'), (req, res) => {
  res.json({ students: db.prepare(`SELECT b.id, b.student_name, b.student_phone, b.status, b.amount, b.net, b.created_at, l.title lesson_title, l.start_at, u.email student_email
    FROM bookings b JOIN lessons l ON l.id=b.lesson_id JOIN users u ON u.id=b.student_id
    WHERE l.teacher_id = ? ORDER BY b.created_at DESC`).all(req.user.id) });
});

const scheduleSchema = z.object({ schedules: z.array(z.object({ weekday: z.number().int().min(0).max(6), start: z.string().regex(/^\d{2}:\d{2}$/), end: z.string().regex(/^\d{2}:\d{2}$/) })).max(40) });
router.get('/schedules', requireRole('teacher'), (req, res) => {
  res.json({ schedules: db.prepare('SELECT * FROM schedules WHERE teacher_id = ? ORDER BY weekday,start_time').all(req.user.id) });
});
router.put('/schedules', requireRole('teacher'), asyncHandler(async (req, res) => {
  const { schedules } = scheduleSchema.parse(req.body);
  runTx(() => {
    db.prepare('DELETE FROM schedules WHERE teacher_id = ?').run(req.user.id);
    const ins = db.prepare('INSERT INTO schedules (id,teacher_id,weekday,start_time,end_time,active) VALUES (?,?,?,?,?,1)');
    for (const s of schedules) if (s.start < s.end) ins.run(uid('sch_'), req.user.id, s.weekday, s.start, s.end);
  });
  res.json({ ok: true });
}));

const profileSchema = z.object({ headline: z.string().trim().min(4).max(140).optional(), bio: z.string().trim().min(20).max(4000).optional(), city: z.string().trim().min(2).max(80).optional(), price: z.number().min(0).max(100000).optional(), subjects: z.array(z.string()).min(1).optional(), levels: z.array(z.string()).min(1).optional(), photoFileId: z.string().optional() });
router.patch('/profile', requireRole('teacher'), asyncHandler(async (req, res) => {
  const data = profileSchema.parse(req.body);
  const profile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(req.user.id);
  if (!profile) return fail(res, 404, 'Perfil de professor não encontrado.');
  if (data.photoFileId) {
    const file = db.prepare('SELECT * FROM files WHERE id = ? AND owner_id = ?').get(data.photoFileId, req.user.id);
    if (!file) return fail(res, 400, 'Fotografia inválida.');
    db.prepare('UPDATE files SET visibility = ? WHERE id = ?').run('public', data.photoFileId);
  }
  const fields = []; const values = [];
  for (const k of ['headline','bio','city','price']) if (data[k] !== undefined) { fields.push(`${k} = ?`); values.push(data[k]); }
  if (data.photoFileId) { fields.push('photo_file_id = ?'); values.push(data.photoFileId); }
  if (data.subjects) { fields.push('subjects = ?'); values.push(JSON.stringify(data.subjects)); }
  if (data.levels) { fields.push('levels = ?'); values.push(JSON.stringify(data.levels)); }
  if (!fields.length) return fail(res, 400, 'Nada para actualizar.');
  fields.push('updated_at = ?'); values.push(now(), req.user.id);
  db.prepare(`UPDATE profiles SET ${fields.join(',')} WHERE user_id = ?`).run(...values);
  if (data.subjects) {
    db.prepare('DELETE FROM teacher_subjects WHERE teacher_id = ?').run(req.user.id);
    const ins = db.prepare('INSERT OR IGNORE INTO teacher_subjects (id,teacher_id,subject_id) VALUES (?,?,?)');
    data.subjects.forEach(s => ins.run(uid('ts_'), req.user.id, s));
  }
  if (data.levels) {
    db.prepare('DELETE FROM teacher_levels WHERE teacher_id = ?').run(req.user.id);
    const ins = db.prepare('INSERT OR IGNORE INTO teacher_levels (id,teacher_id,level_id) VALUES (?,?,?)');
    data.levels.forEach(l => ins.run(uid('tl_'), req.user.id, l));
  }
  res.json({ ok: true });
}));

router.get('/wallet', requireRole('teacher'), (req, res) => {
  const transactions = db.prepare('SELECT * FROM wallet_transactions WHERE teacher_id = ? ORDER BY created_at DESC').all(req.user.id);
  const withdrawals = db.prepare('SELECT * FROM withdrawal_requests WHERE teacher_id = ? ORDER BY requested_at DESC').all(req.user.id);
  const earned = transactions.filter(t => t.type === 'earning').reduce((s,t) => s + t.amount, 0);
  const refunded = transactions.filter(t => t.type === 'refund').reduce((s,t) => s + t.amount, 0);
  const withdrawn = transactions.filter(t => t.type === 'withdrawal').reduce((s,t) => s + t.amount, 0);
  const balance = earned + refunded + withdrawn;
  const pending = withdrawals.filter(w => w.status === 'pending').reduce((s,w) => s + w.amount, 0);
  res.json({ transactions, withdrawals, summary: { earned, refunded, withdrawn, balance, pending, available: Math.max(0, balance - pending) } });
});

const withdrawalSchema = z.object({ amount: z.number().min(1).max(1000000), method: z.enum(['M-Pesa','e-Mola']), number: z.string().trim().min(8).max(30) });
router.post('/wallet/withdrawals', requireRole('teacher'), asyncHandler(async (req, res) => {
  const data = withdrawalSchema.parse(req.body);
  const transactions = db.prepare('SELECT * FROM wallet_transactions WHERE teacher_id = ?').all(req.user.id);
  const balance = transactions.reduce((s,t) => s + t.amount, 0);
  const pending = db.prepare("SELECT COALESCE(SUM(amount),0) total FROM withdrawal_requests WHERE teacher_id = ? AND status='pending'").get(req.user.id).total;
  if (data.amount > balance - pending) return fail(res, 400, 'Valor superior ao saldo disponível.');
  const id = uid('wd_');
  db.prepare("INSERT INTO withdrawal_requests (id,teacher_id,amount,method,number,status,requested_at) VALUES (?,?,?,?,?,'pending',?)").run(id, req.user.id, data.amount, data.method, data.number, now());
  notifyAdmins('Novo pedido de levantamento', `${req.user.name} pediu um levantamento de ${data.amount} MT via ${data.method}.`, '/admin');
  audit(req.user, 'wallet.withdrawal.request', 'withdrawal', id, data);
  res.status(201).json({ ok: true, id });
}));

router.get('/reviews', requireRole('teacher'), (req, res) => {
  res.json({ reviews: db.prepare(`SELECT r.*, u.name student_name, l.title lesson_title FROM reviews r JOIN users u ON u.id=r.student_id JOIN lessons l ON l.id=r.lesson_id WHERE r.teacher_id = ? ORDER BY r.created_at DESC`).all(req.user.id), rating: teacherRating(req.user.id) });
});

export default router;
