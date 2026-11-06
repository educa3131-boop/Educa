import { Router } from 'express';
import { z } from 'zod';
import db, { now, uid , runTx } from '../db.js';
import { requireAuth } from '../auth.js';
import { asyncHandler, fail, notify, notifyAdmins, audit, bookingConflict, seatsTaken, getSettings, roomUrl, lessonEnd, teacherRating } from '../helpers.js';

const router = Router();
router.use(requireAuth);

const bookingDetail = (id) => db.prepare(`SELECT b.*, l.title lesson_title, l.start_at, l.duration, l.price lesson_price, l.seats, l.status lesson_status, l.teacher_id,
  p.name teacher_name, p.headline teacher_headline, p.photo_file_id, s.name subject_name, e.name level_name,
  pay.status payment_status, pay.reference payment_reference, pay.amount payment_amount, pay.method payment_method, pay.submitted_at,
  r.id review_id, r.rating review_rating, r.comment review_comment, ra.id room_access_id
  FROM bookings b JOIN lessons l ON l.id=b.lesson_id JOIN profiles p ON p.user_id=l.teacher_id
  JOIN subjects s ON s.id=l.subject_id JOIN education_levels e ON e.id=l.level_id
  LEFT JOIN payments pay ON pay.booking_id=b.id LEFT JOIN reviews r ON r.booking_id=b.id LEFT JOIN room_access ra ON ra.lesson_id=b.lesson_id AND ra.student_id=b.student_id
  WHERE b.id = ?`).get(id);

function decorate(b) {
  if (!b) return null;
  const end = new Date(new Date(b.start_at).getTime() + (b.duration || 60) * 60000).toISOString();
  const canJoin = ['paid','completed'].includes(b.status) && b.lesson_status === 'published' && !!b.room_access_id && new Date() >= new Date(new Date(b.start_at).getTime() - 30*60000) && new Date() <= new Date(end);
  const canReview = ['paid','completed'].includes(b.status) && (b.lesson_status === 'completed' || new Date() >= new Date(end)) && !b.review_rating;
  return { ...b, end_at: end, canJoin, canReview, canCancel: b.status === 'pending', canSubmitPayment: b.status === 'pending' && (!b.payment_reference || b.payment_status === 'rejected') };
}

router.get('/bookings', (req, res) => {
  const rows = db.prepare(`SELECT b.id FROM bookings b WHERE b.student_id = ? ORDER BY b.created_at DESC`).all(req.user.id);
  res.json({ bookings: rows.map(r => decorate(bookingDetail(r.id))) });
});

router.get('/bookings/:id', (req, res) => {
  const b = bookingDetail(req.params.id);
  if (!b) return fail(res, 404, 'Reserva não encontrada.');
  if (b.student_id !== req.user.id && req.user.role !== 'admin' && b.teacher_id !== req.user.id) return fail(res, 403, 'Sem acesso a esta reserva.');
  res.json({ booking: decorate(b) });
});

const createBookingSchema = z.object({
  studentName: z.string().trim().min(2).max(80).optional(), studentPhone: z.string().trim().min(8).max(30).optional(),
  method: z.enum(['M-Pesa','e-Mola']), reference: z.string().trim().max(40).optional().or(z.literal(''))
});

router.post('/lessons/:id/bookings', asyncHandler(async (req, res) => {
  if (!req.user.email_verified) return fail(res, 403, 'Confirma o teu email antes de reservar uma aula.');
  const data = createBookingSchema.parse(req.body);
  const lesson = db.prepare(`SELECT l.*, p.name teacher_name FROM lessons l JOIN profiles p ON p.user_id=l.teacher_id WHERE l.id = ?`).get(req.params.id);
  if (!lesson || lesson.status !== 'published') return fail(res, 404, 'Aula indisponível.');
  if (lesson.teacher_id === req.user.id) return fail(res, 400, 'Não podes reservar a tua própria aula.');
  if (new Date(lesson.start_at).getTime() <= Date.now()) return fail(res, 400, 'As inscrições para esta aula já terminaram.');
  const existing = db.prepare("SELECT id,status FROM bookings WHERE lesson_id = ? AND student_id = ? AND status IN ('pending','paid','completed')").get(lesson.id, req.user.id);
  if (existing) return fail(res, 409, 'Já tens uma reserva activa para esta aula.');
  if (bookingConflict(req.user.id, lesson.start_at, lesson.duration)) return fail(res, 409, 'Tens outra aula reservada que coincide com este horário.');
  const taken = seatsTaken(lesson.id);
  if (taken >= lesson.seats) return fail(res, 409, 'A aula já não tem lugares disponíveis.');
  const takenSeats = new Set(db.prepare("SELECT seat_index FROM bookings WHERE lesson_id = ? AND status IN ('pending','paid','completed')").all(lesson.id).map(r => r.seat_index));
  let seat = 1; while (takenSeats.has(seat) && seat <= lesson.seats) seat++;
  if (seat > lesson.seats) return fail(res, 409, 'A aula já não tem lugares disponíveis.');
  const settings = getSettings();
  const isFree = Number(lesson.price) === 0;
  if (!isFree && (!settings.mpesa_number || !settings.emola_number)) return fail(res, 400, 'Os números de pagamento ainda não foram configurados pela equipa EDUCA.');
  const studentName = data.studentName || req.user.name;
  const studentPhone = data.studentPhone || req.user.phone;
  if (!studentPhone) return fail(res, 400, 'Indica o teu número de telefone para a reserva.');
  let reference = (data.reference || '').trim().toUpperCase();
  if (reference && !/^[A-Z0-9-]{4,40}$/.test(reference)) return fail(res, 400, 'Referência de pagamento inválida.');
  if (reference) {
    const dup = db.prepare('SELECT id FROM payments WHERE reference = ?').get(reference);
    if (dup) return fail(res, 409, 'Esta referência de pagamento já foi utilizada.');
  }
  const bookingId = uid('bk_');
  const paymentId = uid('pay_');
  runTx(() => {
    db.prepare(`INSERT INTO bookings (id,lesson_id,student_id,student_name,student_phone,method,seat_index,status,amount,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(bookingId, lesson.id, req.user.id, studentName, studentPhone, data.method, seat, isFree ? 'paid' : 'pending', lesson.price, now());
    db.prepare(`INSERT INTO payments (id,booking_id,student_id,amount,method,reference,status,submitted_at,created_at)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(paymentId, bookingId, req.user.id, lesson.price, data.method, reference || null, isFree ? 'confirmed' : 'pending', reference ? now() : null, now());
    if (isFree) {
      db.prepare('INSERT INTO room_access (id,lesson_id,student_id,granted_by,granted_at) VALUES (?,?,?,?,?)').run(uid('ra_'), lesson.id, req.user.id, req.user.id, now());
      db.prepare("INSERT INTO reviews (id,booking_id,lesson_id,teacher_id,student_id,status,created_at,updated_at) VALUES (?,?,?,?,?, 'visible',?,?)").run(uid('rev_'), bookingId, lesson.id, lesson.teacher_id, req.user.id, now(), now());
    }
  });
  notify(lesson.teacher_id, 'booking', isFree ? 'Nova inscrição gratuita' : 'Nova reserva pendente', `${studentName} reservou a aula "${lesson.title}".`, '/professor');
  if (!isFree) notifyAdmins('Pagamento por confirmar', `${studentName} submeteu uma reserva para "${lesson.title}".`, '/admin');
  audit(req.user, 'booking.create', 'booking', bookingId, { lessonId: lesson.id, method: data.method, free: isFree });
  res.status(201).json({ ok: true, bookingId, instructions: isFree ? null : { amount: lesson.price, method: data.method, mpesa: settings.mpesa_number, emola: settings.emola_number, referenceRequired: true } });
}));

const paymentSchema = z.object({ reference: z.string().trim().min(4).max(40).regex(/^[A-Za-z0-9-]+$/), proofFileId: z.string().optional() });
router.post('/bookings/:id/payment', asyncHandler(async (req, res) => {
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ? AND student_id = ?').get(req.params.id, req.user.id);
  if (!booking) return fail(res, 404, 'Reserva não encontrada.');
  if (booking.status !== 'pending') return fail(res, 400, 'Esta reserva já não está a aguardar pagamento.');
  const payment = db.prepare('SELECT * FROM payments WHERE booking_id = ?').get(booking.id);
  if (!payment) return fail(res, 400, 'Pagamento não encontrado.');
  if (payment.status === 'confirmed') return fail(res, 409, 'Este pagamento já foi confirmado.');
  const data = paymentSchema.parse(req.body);
  const reference = data.reference.trim().toUpperCase();
  const dup = db.prepare('SELECT id FROM payments WHERE reference = ? AND id <> ?').get(reference, payment.id);
  if (dup) return fail(res, 409, 'Esta referência de pagamento já foi utilizada.');
  if (data.proofFileId) {
    const file = db.prepare('SELECT id FROM files WHERE id = ? AND owner_id = ?').get(data.proofFileId, req.user.id);
    if (!file) return fail(res, 400, 'Comprovativo inválido.');
  }
  db.prepare("UPDATE payments SET reference=?, status='pending', submitted_at=?, rejection_reason=NULL, proof_file_id=? WHERE id=?")
    .run(reference, now(), data.proofFileId || null, payment.id);
  notifyAdmins('Referência de pagamento submetida', `${req.user.name} submeteu a referência ${reference} para a reserva ${booking.id}.`, '/admin');
  audit(req.user, 'payment.submit', 'payment', payment.id, { reference });
  res.json({ ok: true });
}));

router.post('/bookings/:id/cancel', asyncHandler(async (req, res) => {
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ? AND student_id = ?').get(req.params.id, req.user.id);
  if (!booking) return fail(res, 404, 'Reserva não encontrada.');
  if (booking.status !== 'pending') return fail(res, 400, 'Só podes cancelar reservas com pagamento pendente. Contacta o suporte para reembolsos.');
  const reason = String(req.body?.reason || 'Cancelada pelo estudante.').slice(0, 300);
  runTx(() => {
    db.prepare("UPDATE bookings SET status='cancelled', cancelled_at=?, cancellation_reason=? WHERE id=?").run(now(), reason, booking.id);
    db.prepare("UPDATE payments SET status='cancelled' WHERE booking_id=? AND status='pending'").run(booking.id);
  });
  const lesson = db.prepare('SELECT title,teacher_id FROM lessons WHERE id = ?').get(booking.lesson_id);
  notify(lesson.teacher_id, 'booking', 'Reserva cancelada', `${booking.student_name} cancelou a reserva da aula "${lesson.title}".`, '/professor');
  audit(req.user, 'booking.cancel', 'booking', booking.id, { reason });
  res.json({ ok: true });
}));

const reviewSchema = z.object({ rating: z.number().int().min(1).max(5), comment: z.string().trim().max(2000).optional().or(z.literal('')) });
router.post('/reviews/:bookingId', asyncHandler(async (req, res) => {
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ? AND student_id = ?').get(req.params.bookingId, req.user.id);
  if (!booking) return fail(res, 404, 'Reserva não encontrada.');
  if (!['paid','completed'].includes(booking.status)) return fail(res, 400, 'Só podes avaliar aulas com pagamento confirmado.');
  const lesson = db.prepare('SELECT * FROM lessons WHERE id = ?').get(booking.lesson_id);
  if (!lesson) return fail(res, 404, 'Aula não encontrada.');
  const ended = new Date(lesson.start_at).getTime() + (lesson.duration || 60) * 60000 <= Date.now();
  if (lesson.status !== 'completed' && !ended) return fail(res, 400, 'Só podes avaliar depois da aula terminar.');
  const review = db.prepare('SELECT * FROM reviews WHERE booking_id = ?').get(booking.id);
  if (!review) return fail(res, 400, 'Avaliação não disponível para esta reserva.');
  if (review.rating) return fail(res, 409, 'Já avaliaste esta aula.');
  const data = reviewSchema.parse(req.body);
  db.prepare('UPDATE reviews SET rating=?, comment=?, updated_at=? WHERE id=?').run(data.rating, data.comment || null, now(), review.id);
  notify(lesson.teacher_id, 'review', 'Nova avaliação', `${booking.student_name} avaliou a aula "${lesson.title}" com ${data.rating} estrelas.`, '/professor');
  audit(req.user, 'review.create', 'review', review.id, { rating: data.rating, bookingId: booking.id });
  res.json({ ok: true, rating: teacherRating(lesson.teacher_id) });
}));

router.get('/reviews', (req, res) => {
  res.json({ reviews: db.prepare(`SELECT r.*, l.title lesson_title, p.name teacher_name FROM reviews r JOIN lessons l ON l.id=r.lesson_id JOIN profiles p ON p.user_id=l.teacher_id WHERE r.student_id = ? ORDER BY r.created_at DESC`).all(req.user.id) });
});

const reportSchema = z.object({ targetType: z.enum(['teacher','review']), targetId: z.string().min(1), reason: z.string().trim().min(3).max(80), details: z.string().trim().max(2000).optional().or(z.literal('')) });
router.post('/reports', asyncHandler(async (req, res) => {
  const data = reportSchema.parse(req.body);
  let targetName = '';
  if (data.targetType === 'teacher') {
    const p = db.prepare('SELECT name FROM profiles WHERE user_id = ?').get(data.targetId);
    if (!p) return fail(res, 404, 'Professor não encontrado.');
    targetName = p.name;
  } else {
    const r = db.prepare('SELECT id FROM reviews WHERE id = ?').get(data.targetId);
    if (!r) return fail(res, 404, 'Avaliação não encontrada.');
    targetName = 'Avaliação';
  }
  const id = uid('rep_');
  db.prepare('INSERT INTO reports (id,reporter_id,target_type,target_id,target_name,reason,details,status,created_at) VALUES (?,?,?,?,?,?,?,\'open\',?)')
    .run(id, req.user.id, data.targetType, data.targetId, targetName, data.reason, data.details || null, now());
  notifyAdmins('Nova denúncia', `${req.user.name} denunciou ${data.targetType === 'teacher' ? 'o professor' : 'uma avaliação'} ${targetName}.`, '/admin');
  audit(req.user, 'report.create', 'report', id, data);
  res.status(201).json({ ok: true });
}));

router.get('/payments', (req, res) => {
  res.json({ payments: db.prepare(`SELECT p.*, b.lesson_id, l.title lesson_title, l.start_at FROM payments p JOIN bookings b ON b.id=p.booking_id JOIN lessons l ON l.id=b.lesson_id WHERE p.student_id = ? ORDER BY p.created_at DESC`).all(req.user.id) });
});

router.get('/summary', (req, res) => {
  const bookings = db.prepare('SELECT status FROM bookings WHERE student_id = ?').all(req.user.id);
  const reviews = db.prepare('SELECT rating FROM reviews WHERE student_id = ? AND rating IS NOT NULL').all(req.user.id);
  const pending = bookings.filter(b => b.status === 'pending').length;
  const paid = bookings.filter(b => ['paid','completed'].includes(b.status)).length;
  const completed = bookings.filter(b => b.status === 'completed').length;
  const avg = reviews.length ? reviews.reduce((s,r) => s + r.rating, 0) / reviews.length : 0;
  res.json({ total: bookings.length, pending, paid, completed, reviews: reviews.length, averageGiven: Math.round(avg * 10) / 10 });
});

router.get('/room-access/:lessonId', (req, res) => {
  const lesson = db.prepare('SELECT * FROM lessons WHERE id = ?').get(req.params.lessonId);
  if (!lesson) return fail(res, 404, 'Aula não encontrada.');
  const isTeacher = lesson.teacher_id === req.user.id;
  const isAdmin = req.user.role === 'admin';
  if (!isTeacher && !isAdmin) {
    const booking = db.prepare("SELECT * FROM bookings WHERE lesson_id = ? AND student_id = ? AND status IN ('paid','completed')").get(lesson.id, req.user.id);
    const access = db.prepare('SELECT * FROM room_access WHERE lesson_id = ? AND student_id = ?').get(lesson.id, req.user.id);
    if (!booking || !access) return fail(res, 403, 'Sala indisponível — só abre depois da confirmação do pagamento.');
    if (lesson.status !== 'published') return fail(res, 403, 'Esta aula não está disponível.');
    const start = new Date(lesson.start_at).getTime(); const end = start + (lesson.duration || 60) * 60000;
    if (Date.now() < start - 30*60000) return fail(res, 403, 'A sala abre 30 minutos antes do início da aula.');
    if (Date.now() > end) return fail(res, 403, 'A sala desta aula já fechou.');
  }
  if (isTeacher && lesson.status !== 'published') return fail(res, 403, 'A sala só está disponível para aulas publicadas.');
  res.json({ url: roomUrl(lesson.room_code), lesson: { id: lesson.id, title: lesson.title, startAt: lesson.start_at, duration: lesson.duration, status: lesson.status }, role: isAdmin ? 'admin' : isTeacher ? 'teacher' : 'student', provider: process.env.JITSI_JAAS_DOMAIN ? 'jaas' : 'public' });
});

export default router;
