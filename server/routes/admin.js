import { Router } from 'express';
import { z } from 'zod';
import db, { now, uid , runTx } from '../db.js';
import { requireAdmin, requireOwner } from '../auth.js';
import { asyncHandler, fail, notify, notifyAdmins, audit, parseJSON, getSettings, teacherRating, seatsTaken } from '../helpers.js';
import { seedDemo } from '../demo.js';

const router = Router();
router.use(requireAdmin);

router.get('/stats', (req, res) => {
  const counts = db.prepare(`SELECT
    (SELECT COUNT(*) FROM users WHERE role='student') students,
    (SELECT COUNT(*) FROM users WHERE role='teacher') teachers,
    (SELECT COUNT(*) FROM teacher_applications WHERE status='pending') pendingApplications,
    (SELECT COUNT(*) FROM lessons WHERE status='published') publishedLessons,
    (SELECT COUNT(*) FROM payments WHERE status='pending') pendingPayments,
    (SELECT COUNT(*) FROM bookings WHERE status IN ('paid','completed')) paidBookings,
    (SELECT COALESCE(SUM(amount),0) FROM bookings WHERE status IN ('paid','completed')) revenue,
    (SELECT COALESCE(SUM(commission),0) FROM bookings WHERE status IN ('paid','completed')) commission,
    (SELECT COALESCE(SUM(amount),0) FROM withdrawal_requests WHERE status='pending') pendingPayouts,
    (SELECT COUNT(*) FROM reports WHERE status='open') openReports,
    (SELECT COUNT(*) FROM users WHERE status='suspended') suspended,
    (SELECT COUNT(*) FROM users) totalUsers
  `).get();
  const bySubject = db.prepare(`SELECT s.id, s.name, COALESCE(SUM(b.amount),0) revenue, COALESCE(SUM(b.commission),0) commission, COUNT(b.id) bookings
    FROM bookings b JOIN lessons l ON l.id=b.lesson_id JOIN subjects s ON s.id=l.subject_id
    WHERE b.status IN ('paid','completed') GROUP BY s.id ORDER BY revenue DESC`).all();
  const monthly = db.prepare(`SELECT substr(paid_at,1,7) month, SUM(amount) revenue, SUM(commission) commission FROM bookings
    WHERE status IN ('paid','completed') AND paid_at IS NOT NULL GROUP BY month ORDER BY month DESC LIMIT 6`).all().reverse();
  const recentPayments = db.prepare(`SELECT p.id,p.reference,p.method,p.amount,p.created_at,b.student_name,b.student_phone,l.title lesson_title,l.start_at,u.name teacher_name
    FROM payments p JOIN bookings b ON b.id=p.booking_id JOIN lessons l ON l.id=b.lesson_id JOIN users u ON u.id=l.teacher_id
    WHERE p.status='pending' ORDER BY p.created_at DESC LIMIT 8`).all();
  const recentApplications = db.prepare(`SELECT a.id,a.name,a.headline,a.city,a.price,a.created_at,u.email FROM teacher_applications a JOIN users u ON u.id=a.user_id WHERE a.status='pending' ORDER BY a.created_at DESC LIMIT 8`).all();
  res.json({ counts, bySubject, monthly, recentPayments, recentApplications, settings: getSettings() });
});

router.get('/applications', (req, res) => {
  const status = req.query.status || 'all';
  const rows = db.prepare(`SELECT a.*, u.email, u.phone user_phone, u.status user_status FROM teacher_applications a JOIN users u ON u.id=a.user_id
    ${status !== 'all' ? "WHERE a.status = ?" : ''} ORDER BY a.created_at DESC`).all(...(status !== 'all' ? [status] : []));
  const subjects = db.prepare('SELECT id,name FROM subjects').all();
  const levels = db.prepare('SELECT id,name FROM education_levels').all();
  const sm = Object.fromEntries(subjects.map(s => [s.id, s.name])); const lm = Object.fromEntries(levels.map(l => [l.id, l.name]));
  res.json({ applications: rows.map(a => ({ ...a, subjects: parseJSON(a.subjects), levels: parseJSON(a.levels), subjectNames: parseJSON(a.subjects).map(id => sm[id]).filter(Boolean), levelNames: parseJSON(a.levels).map(id => lm[id]).filter(Boolean), documents: db.prepare('SELECT id,kind,file_id,filename FROM teacher_documents WHERE application_id = ?').all(a.id) })) });
});

router.post('/applications/:id/approve', asyncHandler(async (req, res) => {
  const app = db.prepare('SELECT * FROM teacher_applications WHERE id = ?').get(req.params.id);
  if (!app) return fail(res, 404, 'Candidatura não encontrada.');
  if (app.status === 'approved') return fail(res, 409, 'Esta candidatura já foi aprovada.');
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(app.user_id);
  if (!user) return fail(res, 404, 'Utilizador não encontrado.');
  runTx(() => {
    db.prepare("UPDATE teacher_applications SET status='approved', reviewed_by=?, reviewed_at=?, updated_at=? WHERE id=?").run(req.user.id, now(), now(), app.id);
    db.prepare("UPDATE users SET role='teacher', status='active', updated_at=? WHERE id=?").run(now(), user.id);
    db.prepare(`INSERT INTO profiles (id,user_id,name,headline,bio,city,price,subjects,levels,published,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,1,?,?)
      ON CONFLICT(user_id) DO UPDATE SET name=excluded.name, headline=excluded.headline, bio=excluded.bio, city=excluded.city, price=excluded.price, subjects=excluded.subjects, levels=excluded.levels, published=1, updated_at=?`)
      .run(app.id, user.id, app.name, app.headline, app.bio, app.city, app.price, app.subjects, app.levels, now(), now(), now());
    db.prepare('DELETE FROM teacher_subjects WHERE teacher_id = ?').run(user.id);
    db.prepare('DELETE FROM teacher_levels WHERE teacher_id = ?').run(user.id);
    const insS = db.prepare('INSERT OR IGNORE INTO teacher_subjects (id,teacher_id,subject_id) VALUES (?,?,?)');
    parseJSON(app.subjects).forEach(s => insS.run(uid('ts_'), user.id, s));
    const insL = db.prepare('INSERT OR IGNORE INTO teacher_levels (id,teacher_id,level_id) VALUES (?,?,?)');
    parseJSON(app.levels).forEach(l => insL.run(uid('tl_'), user.id, l));
  });
  notify(user.id, 'teacher', 'Candidatura aprovada', 'A tua candidatura a professor foi aprovada. Já podes publicar aulas na EDUCA.', '/professor');
  audit(req.user, 'teacher.approve', 'application', app.id, { userId: user.id });
  res.json({ ok: true });
}));

router.post('/applications/:id/reject', asyncHandler(async (req, res) => {
  const reason = String(req.body?.reason || '').trim();
  if (reason.length < 5) return fail(res, 400, 'Indica o motivo da rejeição (mínimo 5 caracteres).');
  const app = db.prepare('SELECT * FROM teacher_applications WHERE id = ?').get(req.params.id);
  if (!app) return fail(res, 404, 'Candidatura não encontrada.');
  if (app.status === 'rejected') return fail(res, 409, 'Esta candidatura já foi rejeitada.');
  runTx(() => {
    db.prepare("UPDATE teacher_applications SET status='rejected', rejection_reason=?, reviewed_by=?, reviewed_at=?, updated_at=? WHERE id=?").run(reason, req.user.id, now(), now(), app.id);
    db.prepare('UPDATE profiles SET published=0, updated_at=? WHERE user_id=?').run(now(), app.user_id);
    db.prepare("UPDATE users SET role='student', updated_at=? WHERE id=? AND role='teacher'").run(now(), app.user_id);
    const future = db.prepare("SELECT * FROM lessons WHERE teacher_id=? AND status='published' AND start_at >= ?").all(app.user_id, now());
    for (const l of future) {
      db.prepare("UPDATE lessons SET status='cancelled', updated_at=? WHERE id=?").run(now(), l.id);
      const pending = db.prepare("SELECT * FROM bookings WHERE lesson_id=? AND status='pending'").all(l.id);
      for (const b of pending) {
        db.prepare("UPDATE bookings SET status='cancelled', cancelled_at=?, cancellation_reason='Professor rejeitado pela administração.' WHERE id=?").run(now(), b.id);
        notify(b.student_id, 'booking', 'Reserva cancelada', `A aula "${l.title}" foi cancelada.`, '/painel');
      }
    }
  });
  notify(app.user_id, 'teacher', 'Candidatura rejeitada', `A tua candidatura não foi aprovada. Motivo: ${reason}`, '/professor');
  audit(req.user, 'teacher.reject', 'application', app.id, { reason });
  res.json({ ok: true });
}));

router.get('/payments', (req, res) => {
  const status = req.query.status || 'pending';
  const rows = db.prepare(`SELECT p.*, b.student_name, b.student_phone, b.lesson_id, l.title lesson_title, l.start_at, l.price lesson_price, l.seats,
    u.name teacher_name, u.email teacher_email, t.id teacher_profile_id
    FROM payments p JOIN bookings b ON b.id=p.booking_id JOIN lessons l ON l.id=b.lesson_id JOIN users u ON u.id=l.teacher_id
    LEFT JOIN profiles t ON t.user_id=l.teacher_id
    ${status !== 'all' ? 'WHERE p.status = ?' : ''} ORDER BY p.created_at DESC`).all(...(status !== 'all' ? [status] : []));
  res.json({ payments: rows, settings: getSettings() });
});

router.post('/payments/:id/confirm', asyncHandler(async (req, res) => {
  const attested = req.body?.attested === true;
  if (!attested) return fail(res, 400, 'Confirma que verificaste a referência no extracto M-Pesa/e-Mola.');
  const note = String(req.body?.note || '').slice(0, 500);
  const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.id);
  if (!payment) return fail(res, 404, 'Pagamento não encontrado.');
  if (payment.status === 'confirmed') return fail(res, 409, 'Este pagamento já foi confirmado.');
  if (payment.status !== 'pending') return fail(res, 400, 'Este pagamento não está pendente.');
  if (!payment.reference) return fail(res, 400, 'Ainda não existe referência de pagamento submetida.');
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(payment.booking_id);
  if (!booking) return fail(res, 404, 'Reserva não encontrada.');
  if (booking.status !== 'pending') return fail(res, 409, 'A reserva já não está pendente.');
  const lesson = db.prepare('SELECT * FROM lessons WHERE id = ?').get(booking.lesson_id);
  if (!lesson) return fail(res, 404, 'Aula não encontrada.');
  if (lesson.status !== 'published') return fail(res, 400, 'A aula não está publicada. Não é possível confirmar.');
  if (seatsTaken(lesson.id) > lesson.seats) return fail(res, 409, 'A aula excede a capacidade. Rejeita ou cancela a reserva.');
  const settings = getSettings();
  const amount = Number(booking.amount);
  const commission = Math.round(amount * (Number(settings.commission) / 100) * 100) / 100;
  const net = Math.round((amount - commission) * 100) / 100;
  runTx(() => {
    const payRes = db.prepare("UPDATE payments SET status='confirmed', confirmed_by=?, confirmed_at=? WHERE id=? AND status='pending'").run(req.user.id, now(), payment.id);
    if (!payRes.changes) throw new Error('Este pagamento já foi confirmado.');
    const bookRes = db.prepare("UPDATE bookings SET status='paid', amount=?, commission=?, net=?, paid_at=?, confirmed_by=? WHERE id=? AND status='pending'").run(amount, commission, net, now(), req.user.id, booking.id);
    if (!bookRes.changes) throw new Error('A reserva já não está pendente.');
    db.prepare('INSERT INTO payment_confirmations (id,payment_id,admin_id,decision,note,created_at) VALUES (?,?,?,?,?,?)').run(uid('pc_'), payment.id, req.user.id, 'confirmed', note || null, now());
    db.prepare('INSERT OR IGNORE INTO room_access (id,lesson_id,student_id,granted_by,granted_at) VALUES (?,?,?,?,?)').run(uid('ra_'), lesson.id, booking.student_id, req.user.id, now());
    db.prepare(`INSERT OR IGNORE INTO reviews (id,booking_id,lesson_id,teacher_id,student_id,status,created_at,updated_at) VALUES (?,?,?,?,?,'visible',?,?)`).run(uid('rev_'), booking.id, lesson.id, lesson.teacher_id, booking.student_id, now(), now());
    const wallet = db.prepare('SELECT * FROM teacher_wallets WHERE teacher_id = ?').get(lesson.teacher_id);
    const balance = Math.round(((wallet?.balance || 0) + net) * 100) / 100;
    db.prepare(`INSERT INTO teacher_wallets (teacher_id,balance,total_earned,total_withdrawn,updated_at) VALUES (?,?,?,?,?)
      ON CONFLICT(teacher_id) DO UPDATE SET balance=excluded.balance, total_earned=excluded.total_earned, total_withdrawn=excluded.total_withdrawn, updated_at=?`)
      .run(lesson.teacher_id, balance, (wallet?.total_earned || 0) + net, wallet?.total_withdrawn || 0, now(), now());
    db.prepare('INSERT INTO wallet_transactions (id,teacher_id,type,amount,balance_after,booking_id,description,created_at) VALUES (?,?,?,?,?,?,?,?)')
      .run(uid('wt_'), lesson.teacher_id, 'earning', net, balance, booking.id, `Aula "${lesson.title}" — ${booking.student_name}`, now());
  });
  notify(booking.student_id, 'payment', 'Pagamento confirmado', `O pagamento da aula "${lesson.title}" foi confirmado. Já podes entrar na sala.`, '/painel');
  notify(lesson.teacher_id, 'payment', 'Pagamento confirmado', `Recebeste ${net} MT na carteira pela aula "${lesson.title}".`, '/professor');
  audit(req.user, 'payment.confirm', 'payment', payment.id, { bookingId: booking.id, amount, commission, net, reference: payment.reference });
  res.json({ ok: true });
}));

router.post('/payments/:id/reject', asyncHandler(async (req, res) => {
  const reason = String(req.body?.reason || '').trim();
  if (reason.length < 5) return fail(res, 400, 'Indica o motivo da rejeição.');
  const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.id);
  if (!payment) return fail(res, 404, 'Pagamento não encontrado.');
  if (payment.status !== 'pending') return fail(res, 409, 'Só é possível rejeitar pagamentos pendentes.');
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(payment.booking_id);
  const resUpdate = db.prepare("UPDATE payments SET status='rejected', rejection_reason=? WHERE id=? AND status='pending'").run(reason, payment.id);
  if (!resUpdate.changes) return fail(res, 409, 'Este pagamento já foi decidido.');
  const lessonTitle = db.prepare('SELECT l.title FROM lessons l JOIN bookings b ON b.lesson_id=l.id WHERE b.id = ?').get(payment.booking_id)?.title || 'aula';
  notify(payment.student_id, 'payment', 'Pagamento rejeitado', `O pagamento da reserva "${lessonTitle}" foi rejeitado. Motivo: ${reason}`, '/painel');
  audit(req.user, 'payment.reject', 'payment', payment.id, { reason });
  res.json({ ok: true });
}));

router.post('/payments/:id/refund', asyncHandler(async (req, res) => {
  const reason = String(req.body?.reason || '').trim();
  if (reason.length < 5) return fail(res, 400, 'Indica o motivo do reembolso.');
  const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.id);
  if (!payment) return fail(res, 404, 'Pagamento não encontrado.');
  if (payment.status !== 'confirmed') return fail(res, 409, 'Só é possível reembolsar pagamentos confirmados.');
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(payment.booking_id);
  if (!booking) return fail(res, 404, 'Reserva não encontrada.');
  if (!['paid','completed'].includes(booking.status)) return fail(res, 409, 'A reserva já não está paga.');
  const lesson = db.prepare('SELECT * FROM lessons WHERE id = ?').get(booking.lesson_id);
  runTx(() => {
    const r1 = db.prepare("UPDATE bookings SET status='refunded', cancelled_at=?, cancellation_reason=? WHERE id=? AND status IN ('paid','completed')").run(now(), reason, booking.id);
    if (!r1.changes) throw new Error('A reserva já foi reembolsada.');
    db.prepare("UPDATE payments SET status='refunded' WHERE id=? AND status='confirmed'").run(payment.id);
    db.prepare('DELETE FROM room_access WHERE lesson_id = ? AND student_id = ?').run(booking.lesson_id, booking.student_id);
    db.prepare("UPDATE reviews SET status='hidden', updated_at=? WHERE booking_id=?").run(now(), booking.id);
    const wallet = db.prepare('SELECT * FROM teacher_wallets WHERE teacher_id = ?').get(lesson.teacher_id);
    const balance = Math.round(((wallet?.balance || 0) - Number(booking.net || 0)) * 100) / 100;
    db.prepare(`INSERT INTO teacher_wallets (teacher_id,balance,total_earned,total_withdrawn,updated_at) VALUES (?,?,?,?,?)
      ON CONFLICT(teacher_id) DO UPDATE SET balance=excluded.balance, updated_at=?`)
      .run(lesson.teacher_id, balance, wallet?.total_earned || 0, wallet?.total_withdrawn || 0, now(), now());
    db.prepare('INSERT INTO wallet_transactions (id,teacher_id,type,amount,balance_after,booking_id,description,created_at) VALUES (?,?,?,?,?,?,?,?)')
      .run(uid('wt_'), lesson.teacher_id, 'refund', -Number(booking.net || 0), balance, booking.id, `Reembolso: ${reason}`, now());
  });
  notify(booking.student_id, 'payment', 'Reembolso processado', `O reembolso da aula "${lesson?.title || ''}" foi processado. A equipa EDUCA fará a transferência.`, '/painel');
  notify(lesson.teacher_id, 'payment', 'Reembolso processado', `Foi feito um reembolso de ${booking.net} MT na aula "${lesson?.title || ''}".`, '/professor');
  audit(req.user, 'payment.refund', 'payment', payment.id, { bookingId: booking.id, reason, net: booking.net });
  res.json({ ok: true });
}));

router.get('/bookings', (req, res) => {
  const status = req.query.status || 'all';
  res.json({ bookings: db.prepare(`SELECT b.*, l.title lesson_title, l.start_at, u.name student_name, u.email student_email, t.name teacher_name,
    p.reference payment_reference, p.status payment_status FROM bookings b JOIN lessons l ON l.id=b.lesson_id JOIN users u ON u.id=b.student_id JOIN users t ON t.id=l.teacher_id
    LEFT JOIN payments p ON p.booking_id=b.id ${status !== 'all' ? 'WHERE b.status = ?' : ''} ORDER BY b.created_at DESC`).all(...(status !== 'all' ? [status] : [])) });
});

router.get('/lessons', (req, res) => {
  res.json({ lessons: db.prepare(`SELECT l.*, s.name subject_name, e.name level_name, u.name teacher_name, u.email teacher_email,
    (SELECT COUNT(*) FROM bookings b WHERE b.lesson_id=l.id AND b.status IN ('pending','paid','completed')) taken
    FROM lessons l JOIN subjects s ON s.id=l.subject_id JOIN education_levels e ON e.id=l.level_id JOIN users u ON u.id=l.teacher_id ORDER BY l.start_at DESC`).all() });
});

router.post('/lessons/:id/cancel', asyncHandler(async (req, res) => {
  const lesson = db.prepare('SELECT * FROM lessons WHERE id = ?').get(req.params.id);
  if (!lesson) return fail(res, 404, 'Aula não encontrada.');
  if (lesson.status === 'cancelled') return fail(res, 409, 'A aula já está cancelada.');
  const reason = String(req.body?.reason || 'Cancelada pela administração.').slice(0, 300);
  runTx(() => {
    db.prepare("UPDATE lessons SET status='cancelled', updated_at=? WHERE id=?").run(now(), lesson.id);
    const pending = db.prepare("SELECT * FROM bookings WHERE lesson_id=? AND status='pending'").all(lesson.id);
    for (const b of pending) {
      db.prepare("UPDATE bookings SET status='cancelled', cancelled_at=?, cancellation_reason=? WHERE id=?").run(now(), reason, b.id);
      notify(b.student_id, 'booking', 'Reserva cancelada', `A aula "${lesson.title}" foi cancelada pela equipa EDUCA.`, '/painel');
    }
    const paid = db.prepare("SELECT * FROM bookings WHERE lesson_id=? AND status IN ('paid','completed')").all(lesson.id);
    for (const b of paid) notify(b.student_id, 'booking', 'Aula cancelada — reembolso a processar', `A aula "${lesson.title}" foi cancelada. Contacta o suporte para o reembolso.`, '/painel');
  });
  audit(req.user, 'admin.lesson.cancel', 'lesson', lesson.id, { reason });
  res.json({ ok: true });
}));

router.post('/lessons/:id/complete', asyncHandler(async (req, res) => {
  const lesson = db.prepare('SELECT * FROM lessons WHERE id = ?').get(req.params.id);
  if (!lesson) return fail(res, 404, 'Aula não encontrada.');
  runTx(() => {
    db.prepare("UPDATE lessons SET status='completed', updated_at=? WHERE id=?").run(now(), lesson.id);
    const paid = db.prepare("SELECT * FROM bookings WHERE lesson_id=? AND status='paid'").all(lesson.id);
    for (const b of paid) {
      db.prepare("UPDATE bookings SET status='completed' WHERE id=?").run(b.id);
      notify(b.student_id, 'lesson', 'Aula concluída', `A aula "${lesson.title}" foi concluída. Já podes avaliar o professor.`, '/painel');
    }
  });
  audit(req.user, 'admin.lesson.complete', 'lesson', lesson.id, null);
  res.json({ ok: true });
}));

router.get('/users', (req, res) => {
  const q = String(req.query.q || '').toLowerCase();
  const role = req.query.role || 'all';
  const status = req.query.status || 'all';
  let rows = db.prepare(`SELECT u.*, a.status application_status, a.id application_id, p.published profile_published
    FROM users u LEFT JOIN teacher_applications a ON a.user_id=u.id LEFT JOIN profiles p ON p.user_id=u.id ORDER BY u.created_at DESC`).all();
  if (role !== 'all') rows = rows.filter(u => u.role === role);
  if (status !== 'all') rows = rows.filter(u => u.status === status);
  if (q) rows = rows.filter(u => [u.name, u.email, u.phone, u.city].join(' ').toLowerCase().includes(q));
  res.json({ users: rows.map(u => ({ ...u, password_hash: undefined })) });
});

router.post('/users/:id/suspend', asyncHandler(async (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return fail(res, 404, 'Utilizador não encontrado.');
  if (user.id === req.user.id) return fail(res, 400, 'Não podes suspender a tua própria conta.');
  if (user.is_owner) return fail(res, 403, 'A conta do proprietário não pode ser suspensa.');
  const reason = String(req.body?.reason || 'Suspensão aplicada pela administração.').slice(0, 300);
  db.prepare("UPDATE users SET status='suspended', updated_at=? WHERE id=?").run(now(), user.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
  audit(req.user, 'user.suspend', 'user', user.id, { reason });
  res.json({ ok: true });
}));

router.post('/users/:id/reactivate', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return fail(res, 404, 'Utilizador não encontrado.');
  db.prepare("UPDATE users SET status='active', updated_at=? WHERE id=?").run(now(), user.id);
  audit(req.user, 'user.reactivate', 'user', user.id, null);
  res.json({ ok: true });
});

router.get('/withdrawals', (req, res) => {
  const status = req.query.status || 'all';
  res.json({ withdrawals: db.prepare(`SELECT w.*, u.name teacher_name, u.email teacher_email FROM withdrawal_requests w JOIN users u ON u.id=w.teacher_id
    ${status !== 'all' ? 'WHERE w.status = ?' : ''} ORDER BY w.requested_at DESC`).all(...(status !== 'all' ? [status] : [])) });
});

router.post('/withdrawals/:id/approve', asyncHandler(async (req, res) => {
  const reference = String(req.body?.reference || '').trim().slice(0, 80);
  if (reference.length < 3) return fail(res, 400, 'Indica a referência da transferência.');
  const w = db.prepare('SELECT * FROM withdrawal_requests WHERE id = ?').get(req.params.id);
  if (!w) return fail(res, 404, 'Levantamento não encontrado.');
  if (w.status !== 'pending') return fail(res, 409, 'Este levantamento já foi decidido.');
  const balance = db.prepare('SELECT COALESCE(SUM(amount),0) total FROM wallet_transactions WHERE teacher_id = ?').get(w.teacher_id).total;
  if (Number(w.amount) > Number(balance)) return fail(res, 400, 'Saldo insuficiente para este levantamento.');
  runTx(() => {
    const r = db.prepare("UPDATE withdrawal_requests SET status='paid', reference=?, decided_by=?, decided_at=? WHERE id=? AND status='pending'").run(reference, req.user.id, now(), w.id);
    if (!r.changes) throw new Error('Este levantamento já foi decidido.');
    const newBalance = Math.round((Number(balance) - Number(w.amount)) * 100) / 100;
    const walletRow = db.prepare('SELECT * FROM teacher_wallets WHERE teacher_id = ?').get(w.teacher_id);
    const newWithdrawn = Math.round(((walletRow?.total_withdrawn || 0) + Number(w.amount)) * 100) / 100;
    db.prepare('INSERT INTO wallet_transactions (id,teacher_id,type,amount,balance_after,payout_id,description,created_at) VALUES (?,?,?,?,?,?,?,?)')
      .run(uid('wt_'), w.teacher_id, 'withdrawal', -Number(w.amount), newBalance, w.id, `Levantamento via ${w.method}`, now());
    db.prepare(`INSERT INTO teacher_wallets (teacher_id,balance,total_withdrawn,updated_at) VALUES (?,?,?,?)
      ON CONFLICT(teacher_id) DO UPDATE SET balance=excluded.balance, total_withdrawn=excluded.total_withdrawn, updated_at=?`)
      .run(w.teacher_id, newBalance, newWithdrawn, now(), now());
  });
  notify(w.teacher_id, 'wallet', 'Levantamento aprovado', `O teu levantamento de ${w.amount} MT foi aprovado. Referência: ${reference}.`, '/professor');
  audit(req.user, 'withdrawal.approve', 'withdrawal', w.id, { amount: w.amount, reference });
  res.json({ ok: true });
}));

router.post('/withdrawals/:id/reject', asyncHandler(async (req, res) => {
  const reason = String(req.body?.reason || '').trim();
  if (reason.length < 5) return fail(res, 400, 'Indica o motivo da rejeição.');
  const w = db.prepare('SELECT * FROM withdrawal_requests WHERE id = ?').get(req.params.id);
  if (!w) return fail(res, 404, 'Levantamento não encontrado.');
  if (w.status !== 'pending') return fail(res, 409, 'Este levantamento já foi decidido.');
  db.prepare("UPDATE withdrawal_requests SET status='rejected', rejection_reason=?, decided_by=?, decided_at=? WHERE id=? AND status='pending'").run(reason, req.user.id, now(), w.id);
  notify(w.teacher_id, 'wallet', 'Levantamento rejeitado', `O teu levantamento de ${w.amount} MT foi rejeitado. Motivo: ${reason}`, '/professor');
  audit(req.user, 'withdrawal.reject', 'withdrawal', w.id, { reason });
  res.json({ ok: true });
}));

router.get('/reviews', (req, res) => {
  res.json({ reviews: db.prepare(`SELECT r.*, u.name student_name, t.name teacher_name, l.title lesson_title FROM reviews r
    JOIN users u ON u.id=r.student_id JOIN users t ON t.id=r.teacher_id JOIN lessons l ON l.id=r.lesson_id ORDER BY r.created_at DESC`).all() });
});
router.post('/reviews/:id/hide', (req, res) => {
  db.prepare("UPDATE reviews SET status='hidden', updated_at=? WHERE id=?").run(now(), req.params.id);
  audit(req.user, 'review.hide', 'review', req.params.id, null); res.json({ ok: true });
});
router.post('/reviews/:id/show', (req, res) => {
  db.prepare("UPDATE reviews SET status='visible', updated_at=? WHERE id=?").run(now(), req.params.id);
  audit(req.user, 'review.show', 'review', req.params.id, null); res.json({ ok: true });
});

router.get('/reports', (req, res) => {
  res.json({ reports: db.prepare(`SELECT r.*, u.name reporter_name, u.email reporter_email FROM reports r JOIN users u ON u.id=r.reporter_id ORDER BY r.created_at DESC`).all() });
});
router.post('/reports/:id/resolve', asyncHandler(async (req, res) => {
  const note = String(req.body?.note || '').trim().slice(0, 1000);
  const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id);
  if (!report) return fail(res, 404, 'Denúncia não encontrada.');
  db.prepare("UPDATE reports SET status='resolved', resolution_note=?, resolved_by=?, resolved_at=? WHERE id=?").run(note, req.user.id, now(), report.id);
  notify(report.reporter_id, 'report', 'Denúncia resolvida', `A tua denúncia foi analisada pela equipa EDUCA.`, '/painel');
  audit(req.user, 'report.resolve', 'report', report.id, { note });
  res.json({ ok: true });
}));

router.get('/subjects', (req, res) => res.json({ subjects: db.prepare('SELECT * FROM subjects ORDER BY sort_order').all() }));
router.post('/subjects', asyncHandler(async (req, res) => {
  const schema = z.object({ name: z.string().trim().min(2).max(60), icon: z.string().trim().max(40).default('BookOpen') });
  const data = schema.parse(req.body);
  const slug = data.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (db.prepare('SELECT id FROM subjects WHERE slug = ?').get(slug)) return fail(res, 409, 'Já existe uma disciplina com este nome.');
  const id = uid('sub_');
  db.prepare('INSERT INTO subjects (id,name,slug,icon,sort_order) VALUES (?,?,?,?,?)').run(id, data.name, slug, data.icon, db.prepare('SELECT COUNT(*) c FROM subjects').get().c);
  audit(req.user, 'subject.create', 'subject', id, data); res.status(201).json({ ok: true });
}));
router.patch('/subjects/:id', asyncHandler(async (req, res) => {
  const schema = z.object({ name: z.string().trim().min(2).max(60).optional(), icon: z.string().trim().max(40).optional(), active: z.boolean().optional() });
  const data = schema.parse(req.body);
  const fields = []; const values = [];
  for (const [k,v] of Object.entries(data)) { fields.push(`${k} = ?`); values.push(v); }
  if (!fields.length) return fail(res, 400, 'Nada para actualizar.');
  values.push(req.params.id);
  db.prepare(`UPDATE subjects SET ${fields.join(',')} WHERE id = ?`).run(...values);
  audit(req.user, 'subject.update', 'subject', req.params.id, data); res.json({ ok: true });
}));

router.get('/levels', (req, res) => res.json({ levels: db.prepare('SELECT * FROM education_levels ORDER BY sort_order').all() }));
router.post('/levels', asyncHandler(async (req, res) => {
  const schema = z.object({ name: z.string().trim().min(2).max(60) });
  const data = schema.parse(req.body);
  const slug = data.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (db.prepare('SELECT id FROM education_levels WHERE slug = ?').get(slug)) return fail(res, 409, 'Já existe um nível com este nome.');
  const id = uid('lvl_');
  db.prepare('INSERT INTO education_levels (id,name,slug,sort_order) VALUES (?,?,?,?)').run(id, data.name, slug, db.prepare('SELECT COUNT(*) c FROM education_levels').get().c);
  audit(req.user, 'level.create', 'level', id, data); res.status(201).json({ ok: true });
}));
router.patch('/levels/:id', asyncHandler(async (req, res) => {
  const schema = z.object({ name: z.string().trim().min(2).max(60).optional(), active: z.boolean().optional() });
  const data = schema.parse(req.body);
  const fields = []; const values = [];
  for (const [k,v] of Object.entries(data)) { fields.push(`${k} = ?`); values.push(v); }
  if (!fields.length) return fail(res, 400, 'Nada para actualizar.');
  values.push(req.params.id);
  db.prepare(`UPDATE education_levels SET ${fields.join(',')} WHERE id = ?`).run(...values);
  audit(req.user, 'level.update', 'level', req.params.id, data); res.json({ ok: true });
}));

router.get('/settings', (req, res) => res.json({ settings: { ...getSettings(), emailConfigured: !!process.env.RESEND_API_KEY, provider: process.env.JITSI_JAAS_DOMAIN ? 'jaas' : 'public' } }));
router.patch('/settings', asyncHandler(async (req, res) => {
  const schema = z.object({
    commission: z.number().min(0).max(50), mpesaNumber: z.string().trim().max(30).optional(), emolaNumber: z.string().trim().max(30).optional(),
    supportEmail: z.string().trim().email().max(120).optional(), supportPhone: z.string().trim().max(30).optional(), announcement: z.string().trim().max(500).optional()
  });
  const data = schema.parse(req.body);
  const current = getSettings();
  db.prepare('UPDATE platform_settings SET commission=?, mpesa_number=?, emola_number=?, support_email=?, support_phone=?, announcement=?, updated_at=? WHERE id=1')
    .run(data.commission, data.mpesaNumber ?? current.mpesa_number, data.emolaNumber ?? current.emola_number, data.supportEmail ?? current.support_email, data.supportPhone ?? current.support_phone, data.announcement ?? current.announcement, now());
  audit(req.user, 'settings.update', 'settings', '1', data);
  res.json({ ok: true, settings: { ...getSettings(), emailConfigured: !!process.env.RESEND_API_KEY, provider: process.env.JITSI_JAAS_DOMAIN ? 'jaas' : 'public' } });
}));

router.post('/notifications', asyncHandler(async (req, res) => {
  const schema = z.object({ userId: z.string().optional(), title: z.string().trim().min(3).max(120), body: z.string().trim().min(3).max(1000), link: z.string().trim().max(200).optional() });
  const data = schema.parse(req.body);
  if (data.userId) {
    const target = db.prepare('SELECT id FROM users WHERE id = ?').get(data.userId);
    if (!target) return fail(res, 404, 'Utilizador não encontrado.');
    notify(target.id, 'admin', data.title, data.body, data.link || null);
  } else {
    const recipients = db.prepare("SELECT id FROM users WHERE status = 'active'").all();
    for (const u of recipients) notify(u.id, 'admin', data.title, data.body, data.link || null);
  }
  audit(req.user, 'notification.send', 'notification', data.userId || 'all', data);
  res.json({ ok: true });
}));

router.get('/audit', (req, res) => {
  res.json({ logs: db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?').all(Math.min(500, Number(req.query.limit) || 100)) });
});

router.get('/team', (req, res) => {
  res.json({ team: db.prepare("SELECT id,name,email,created_at FROM users WHERE role='admin' ORDER BY created_at").all() });
});
router.post('/team/promote', requireOwner, asyncHandler(async (req, res) => {
  const schema = z.object({ userId: z.string().min(1) }); const { userId } = schema.parse(req.body);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return fail(res, 404, 'Utilizador não encontrado.');
  if (user.is_owner) return fail(res, 400, 'O proprietário já é administrador.');
  db.prepare("UPDATE users SET role='admin', status='active', updated_at=? WHERE id=?").run(now(), userId);
  notify(userId, 'account', 'Permissão de administrador', 'Foste nomeado administrador da plataforma EDUCA.', '/admin');
  audit(req.user, 'admin.promote', 'user', userId, null); res.json({ ok: true });
}));
router.post('/team/demote', requireOwner, asyncHandler(async (req, res) => {
  const schema = z.object({ userId: z.string().min(1) }); const { userId } = schema.parse(req.body);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return fail(res, 404, 'Utilizador não encontrado.');
  if (user.is_owner) return fail(res, 403, 'O proprietário não pode ser removido da administração.');
  if (user.id === req.user.id) return fail(res, 400, 'Não podes remover a tua própria permissão.');
  const app = db.prepare("SELECT status FROM teacher_applications WHERE user_id = ? AND status='approved'").get(userId);
  db.prepare("UPDATE users SET role=?, updated_at=? WHERE id=?").run(app ? 'teacher' : 'student', now(), userId);
  audit(req.user, 'admin.demote', 'user', userId, null); res.json({ ok: true });
}));

router.post('/demo-seed', asyncHandler(async (req, res) => {
  const result = seedDemo(req.user);
  res.json(result);
}));

router.post('/demo-clear', asyncHandler(async (req, res) => {
  const emails = ['demo.professor@educa.mz', 'demo.estudante@educa.mz'];
  const ids = db.prepare(`SELECT id FROM users WHERE email IN (${emails.map(() => '?').join(',')})`).all(...emails).map(u => u.id);
  if (ids.length) {
    runTx(() => {
      const inList = ids.map(() => '?').join(',');
      db.prepare(`DELETE FROM files WHERE owner_id IN (${inList})`).run(...ids);
      db.prepare(`DELETE FROM audit_logs WHERE actor_id IN (${inList})`).run(...ids);
      db.prepare(`DELETE FROM users WHERE id IN (${inList})`).run(...ids);
    });
  }
  audit(req.user, 'demo.clear', 'settings', '1', { removed: ids.length });
  res.json({ ok: true, removed: ids.length });
}));

router.get('/export/payments.csv', (req, res) => {
  const rows = db.prepare(`SELECT p.id,p.reference,p.method,p.amount,p.status,p.created_at,b.student_name,b.student_phone,l.title lesson_title,u.name teacher_name
    FROM payments p JOIN bookings b ON b.id=p.booking_id JOIN lessons l ON l.id=b.lesson_id JOIN users u ON u.id=l.teacher_id ORDER BY p.created_at DESC`).all();
  const header = 'id,referencia,metodo,valor,estado,data,estudante,telefone,aula,professor\n';
  const body = rows.map(r => [r.id,r.reference,r.method,r.amount,r.status,r.created_at,r.student_name,r.student_phone,r.lesson_title,r.teacher_name].map(v => `"${String(v ?? '').replace(/"/g,'""')}"`).join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="educa-pagamentos.csv"');
  res.send(header + body);
});

export default router;
