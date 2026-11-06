import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';
if (!/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(BASE)) throw new Error('Por segurança, os testes só correm contra um servidor local. Define BASE_URL para 127.0.0.1 ou localhost.');
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@educa.mz';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) throw new Error('Define ADMIN_PASSWORD no ambiente para correr os testes de API.');
const SUFFIX = Date.now().toString(36).slice(-6);
let passed = 0, failed = 0;
const failures = [];
async function test(name, fn) {
  try { await fn(); passed++; console.log(`✓ ${name}`); }
  catch (e) { failed++; failures.push({ name, message: e.message }); console.error(`✗ ${name}\n   ${e.message}`); }
}
class Client {
  constructor(name) { this.name = name; this.cookies = new Map(); }
  async request(path, options = {}) {
    const { method = 'GET', body, form } = options;
    const headers = {};
    if (this.cookies.size) headers.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    let payload;
    if (form) payload = form;
    else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch(BASE + path, { method, headers, body: payload });
    const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : (res.headers.raw?.()['set-cookie'] || []);
    for (const c of setCookies) { const pair = c.split(';')[0]; const idx = pair.indexOf('='); this.cookies.set(pair.slice(0, idx), pair.slice(idx + 1)); }
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    if (!res.ok) { const err = new Error(data?.error || `HTTP ${res.status}`); err.status = res.status; err.data = data; throw err; }
    return data;
  }
  get(p) { return this.request(p); }
  post(p, b) { return this.request(p, { method: 'POST', body: b }); }
  patch(p, b) { return this.request(p, { method: 'PATCH', body: b }); }
  put(p, b) { return this.request(p, { method: 'PUT', body: b }); }
  async upload(p, file, filename, mime, visibility = 'private') {
    const form = new FormData();
    form.append('file', new Blob([file], { type: mime }), filename);
    form.append('visibility', visibility);
    return this.request(p, { method: 'POST', form });
  }
}
const tokenFrom = (url) => new URL(url).searchParams.get('token');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=', 'base64');

const admin = new Client('admin');
const student = new Client('student');
const teacher = new Client('teacher');
const otherStudent = new Client('otherStudent');
const anon = new Client('anon');

await test('health check', async () => { const d = await anon.get('/api/health'); assert.equal(d.ok, true); });
let initialSettings;
await test('admin login', async () => { const d = await admin.post('/api/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD }); assert.equal(d.user.role, 'admin'); assert.equal(d.user.isOwner, true); initialSettings = (await admin.get('/api/admin/settings')).settings; });
await test('student registration + email verification + login', async () => {
  const email = `teste.estudante.${SUFFIX}@educa.mz`;
  const reg = await student.post('/api/auth/register', { name: 'Estudante Teste', email, phone: '84 000 0010', password: 'Teste@1234' });
  assert.ok(reg.verification?.url, 'dev verification url missing');
  await anon.post('/api/auth/verify-email', { token: tokenFrom(reg.verification.url) });
  const login = await student.post('/api/auth/login', { email, password: 'Teste@1234' });
  assert.equal(login.user.role, 'student');
  assert.equal(login.user.emailVerified, true);
  const updated = await student.patch('/api/auth/profile', { city: 'Maputo', bio: 'Estudante de teste da plataforma EDUCA.' });
  assert.equal(updated.user.city, 'Maputo');
});
await test('second student registration + verification + login', async () => {
  const email = `outro.estudante.${SUFFIX}@educa.mz`;
  const reg = await otherStudent.post('/api/auth/register', { name: 'Outro Estudante', email, phone: '84 000 0011', password: 'Teste@1234' });
  await anon.post('/api/auth/verify-email', { token: tokenFrom(reg.verification.url) });
  const login = await otherStudent.post('/api/auth/login', { email, password: 'Teste@1234' });
  assert.equal(login.user.role, 'student');
});
await test('teacher registration + verification + login', async () => {
  const email = `teste.professor.${SUFFIX}@educa.mz`;
  const reg = await teacher.post('/api/auth/register', { name: 'Professor Teste', email, phone: '84 000 0012', password: 'Teste@1234' });
  await anon.post('/api/auth/verify-email', { token: tokenFrom(reg.verification.url) });
  const login = await teacher.post('/api/auth/login', { email, password: 'Teste@1234' });
  assert.equal(login.user.role, 'student');
});
await test('student cannot access admin API', async () => { await assert.rejects(() => student.get('/api/admin/stats'), (e) => e.status === 403); });
await test('anonymous cannot access admin API', async () => { await assert.rejects(() => anon.get('/api/admin/stats'), (e) => e.status === 401); });
await test('teacher cannot publish before approval', async () => {
  await assert.rejects(() => teacher.post('/api/teacher/lessons', { title: 'Aula antes da aprovação', description: 'Não deve ser possível publicar esta aula.', subject: 'matematica', level: 'primario', mode: 'individual', price: 100, duration: 60, startAt: new Date(Date.now() + 864e5).toISOString(), seats: 1, publish: true }), (e) => e.status === 403);
});
let applicationId;
await test('teacher submits application with private document', async () => {
  const file = await teacher.upload('/api/files', png, 'documento.png', 'image/png', 'private');
  assert.ok(file.id);
  const app = await teacher.post('/api/teacher/application', {
    name: 'Professor Teste', headline: 'Explicador de Matemática', bio: 'Professor com experiência em explicações de Matemática e Física para o ensino secundário.', city: 'Maputo', phone: '84 000 0012', price: 400,
    subjects: ['matematica'], levels: ['secundario-2'], documents: [{ kind: 'id', fileId: file.id }]
  });
  assert.ok(app.applicationId);
  applicationId = app.applicationId;
  const own = await teacher.get('/api/teacher/application');
  assert.equal(own.application.status, 'pending');
  assert.equal(own.application.documents.length, 1);
});
await test('admin lists and approves teacher application', async () => {
  const list = await admin.get('/api/admin/applications?status=pending');
  const found = list.applications.find(a => a.id === applicationId);
  assert.ok(found, 'application not found');
  await admin.post(`/api/admin/applications/${applicationId}/approve`);
  const me = await teacher.get('/api/auth/me');
  assert.equal(me.user.role, 'teacher');
  assert.equal(me.user.profile.published, true);
});
await test('admin configures payment numbers and commission', async () => {
  const d = await admin.patch('/api/admin/settings', { commission: 15, mpesaNumber: '84 000 0000', emolaNumber: '86 000 0000', supportEmail: 'suporte@educa.mz', supportPhone: '84 000 0000', announcement: '' });
  assert.equal(d.settings.commission, 15);
  assert.equal(d.settings.mpesa_number, '84 000 0000');
});
let paidLessonId, groupLessonId, freeLessonId;
await test('approved teacher publishes paid and group lessons', async () => {
  const start = new Date(Date.now() + 20 * 60000).toISOString();
  const paid = await teacher.post('/api/teacher/lessons', { title: 'Matemática — funções', description: 'Aula individual de revisão de funções e gráficos com exercícios resolvidos.', subject: 'matematica', level: 'secundario-2', mode: 'individual', price: 500, duration: 60, startAt: start, seats: 1, publish: true });
  assert.ok(paid.id); paidLessonId = paid.id;
  const group = await teacher.post('/api/teacher/lessons', { title: 'Biologia — célula', description: 'Aula em grupo sobre a célula e as suas partes, com esquema-resumo.', subject: 'biologia', level: 'secundario-2', mode: 'grupo', price: 300, duration: 90, startAt: new Date(Date.now() + 3 * 864e5).toISOString(), seats: 5, publish: true });
  assert.ok(group.id); groupLessonId = group.id;
  const free = await teacher.post('/api/teacher/lessons', { title: 'Inglês — conversação gratuita', description: 'Sessão gratuita de conversação para testar a sala de aula.', subject: 'ingles', level: 'universitario', mode: 'individual', price: 0, duration: 15, startAt: new Date(Date.now() + 1 * 60000).toISOString(), seats: 1, publish: true });
  assert.ok(free.id); freeLessonId = free.id;
});
await test('student books paid lesson and duplicate booking is blocked', async () => {
  const booking = await student.post(`/api/student/lessons/${paidLessonId}/bookings`, { method: 'M-Pesa', studentName: 'Estudante Teste', studentPhone: '84 000 0010' });
  assert.ok(booking.bookingId);
  await assert.rejects(() => student.post(`/api/student/lessons/${paidLessonId}/bookings`, { method: 'M-Pesa', studentName: 'Estudante Teste', studentPhone: '84 000 0010' }), (e) => e.status === 409);
});
let paidBookingId;
await test('student submits payment reference', async () => {
  const bookings = await student.get('/api/student/bookings');
  const booking = bookings.bookings.find(b => b.lesson_id === paidLessonId);
  assert.ok(booking); paidBookingId = booking.id;
  const pay = await student.post(`/api/student/bookings/${booking.id}/payment`, { reference: `TESTE-${SUFFIX}` });
  assert.ok(pay.ok);
  const after = await student.get(`/api/student/bookings/${booking.id}`);
  assert.equal(after.booking.payment_status, 'pending');
  assert.equal(after.booking.payment_reference, `TESTE-${SUFFIX}`.toUpperCase());
});
let paymentId;
await test('admin cannot confirm without attestation and duplicate confirmation is blocked', async () => {
  const list = await admin.get('/api/admin/payments?status=pending');
  const payment = list.payments.find(p => p.reference === `TESTE-${SUFFIX}`.toUpperCase());
  assert.ok(payment); paymentId = payment.id;
  await assert.rejects(() => admin.post(`/api/admin/payments/${payment.id}/confirm`, { attested: false }), (e) => e.status === 400);
  const confirmed = await admin.post(`/api/admin/payments/${payment.id}/confirm`, { attested: true, note: 'Verificado no extracto de teste.' });
  assert.ok(confirmed.ok);
  await assert.rejects(() => admin.post(`/api/admin/payments/${payment.id}/confirm`, { attested: true }), (e) => e.status === 409);
});
await test('teacher wallet is credited with net amount after confirmation', async () => {
  const wallet = await teacher.get('/api/teacher/wallet');
  const earning = wallet.transactions.find(t => t.booking_id === paidBookingId);
  assert.ok(earning, 'earning transaction missing');
  assert.equal(earning.amount, 425);
  assert.equal(wallet.summary.balance, 425);
});
await test('student gets room access after confirmed payment', async () => {
  const bookings = await student.get('/api/student/bookings');
  const booking = bookings.bookings.find(b => b.id === paidBookingId);
  assert.equal(booking.status, 'paid');
  assert.equal(booking.canJoin, true);
  const room = await student.get(`/api/student/room-access/${paidLessonId}`);
  assert.ok(room.url.includes('meet.jit.si'));
  assert.equal(room.role, 'student');
});
await test('unauthorized student cannot enter the room', async () => {
  await assert.rejects(() => otherStudent.get(`/api/student/room-access/${paidLessonId}`), (e) => e.status === 403);
});
await test('student cannot review before lesson completion', async () => {
  await assert.rejects(() => student.post(`/api/student/reviews/${paidBookingId}`, { rating: 5, comment: 'Ainda não terminou.' }), (e) => e.status === 400);
});
await test('admin marks lesson complete and student reviews once', async () => {
  await admin.post(`/api/admin/lessons/${paidLessonId}/complete`);
  const review = await student.post(`/api/student/reviews/${paidBookingId}`, { rating: 5, comment: 'Aula muito clara e bem organizada.' });
  assert.ok(review.ok);
  await assert.rejects(() => student.post(`/api/student/reviews/${paidBookingId}`, { rating: 4, comment: 'Duplicada.' }), (e) => e.status === 409);
});
await test('teacher sees student, review and can message', async () => {
  const students = await teacher.get('/api/teacher/students');
  assert.ok(students.students.some(s => s.student_name === 'Estudante Teste'));
  const reviews = await teacher.get('/api/teacher/reviews');
  assert.ok(reviews.reviews.some(r => r.student_name === 'Estudante Teste' && r.rating === 5));
  const conv = await student.post('/api/messages/conversations', { teacherId: (await teacher.get('/api/auth/me')).user.id, lessonId: paidLessonId });
  assert.ok(conv.conversation.id);
  const msg = await student.post(`/api/messages/conversations/${conv.conversation.id}/messages`, { body: 'Olá professor, obrigado pela aula!' });
  assert.ok(msg.message.id);
  const teacherConvs = await teacher.get('/api/messages/conversations');
  assert.ok(teacherConvs.conversations.some(c => c.id === conv.conversation.id));
  const teacherMsg = await teacher.post(`/api/messages/conversations/${conv.conversation.id}/messages`, { body: 'De nada! Bom trabalho.' });
  assert.ok(teacherMsg.message.id);
  await assert.rejects(() => otherStudent.get(`/api/messages/conversations/${conv.conversation.id}`), (e) => e.status === 403);
});
await test('notifications are generated for student and teacher', async () => {
  const s = await student.get('/api/notifications');
  assert.ok(s.unread > 0);
  const t = await teacher.get('/api/notifications');
  assert.ok(t.unread > 0);
  await student.post('/api/notifications/read-all');
  const after = await student.get('/api/notifications');
  assert.equal(after.unread, 0);
});
await test('teacher requests withdrawal and admin approves it', async () => {
  const req = await teacher.post('/api/teacher/wallet/withdrawals', { amount: 100, method: 'M-Pesa', number: '84 000 0012' });
  assert.ok(req.id);
  const list = await admin.get('/api/admin/withdrawals?status=pending');
  const w = list.withdrawals.find(x => x.id === req.id);
  assert.ok(w);
  await admin.post(`/api/admin/withdrawals/${w.id}/approve`, { reference: `REF-${SUFFIX}` });
  const wallet = await teacher.get('/api/teacher/wallet');
  assert.equal(wallet.summary.balance, 325);
});
await test('free lesson is booked without payment and room access is granted', async () => {
  const booking = await student.post(`/api/student/lessons/${freeLessonId}/bookings`, { method: 'M-Pesa', studentName: 'Estudante Teste', studentPhone: '84 000 0010' });
  assert.ok(booking.bookingId);
  const room = await student.get(`/api/student/room-access/${freeLessonId}`);
  assert.ok(room.url.includes('meet.jit.si'));
});
await test('student report is resolved by admin', async () => {
  const teacherId = (await teacher.get('/api/auth/me')).user.id;
  const report = await student.post('/api/student/reports', { targetType: 'teacher', targetId: teacherId, reason: 'Outro', details: 'Teste de denúncia automatizada.' });
  assert.ok(report.ok);
  const list = await admin.get('/api/admin/reports');
  const r = list.reports.find(x => x.details === 'Teste de denúncia automatizada.');
  assert.ok(r);
  await admin.post(`/api/admin/reports/${r.id}/resolve`, { note: 'Testado pela equipa.' });
});
await test('admin suspends and reactivates a student account', async () => {
  const users = await admin.get('/api/admin/users');
  const other = users.users.find(u => u.name === 'Outro Estudante');
  assert.ok(other);
  await admin.post(`/api/admin/users/${other.id}/suspend`, { reason: 'Teste de suspensão.' });
  await assert.rejects(() => otherStudent.post('/api/auth/login', { email: `outro.estudante.${SUFFIX}@educa.mz`, password: 'Teste@1234' }), (e) => e.status === 403);
  await admin.post(`/api/admin/users/${other.id}/reactivate`);
  const login = await otherStudent.post('/api/auth/login', { email: `outro.estudante.${SUFFIX}@educa.mz`, password: 'Teste@1234' });
  assert.equal(login.user.status, 'active');
});
await test('admin can hide and show a review', async () => {
  const list = await admin.get('/api/admin/reviews');
  const r = list.reviews.find(x => x.student_name === 'Estudante Teste');
  assert.ok(r);
  await admin.post(`/api/admin/reviews/${r.id}/hide`);
  await admin.post(`/api/admin/reviews/${r.id}/show`);
});
await test('admin can cancel a lesson and export payments CSV', async () => {
  await admin.post(`/api/admin/lessons/${groupLessonId}/cancel`, { reason: 'Cancelamento de teste.' });
  const csv = await admin.request('/api/admin/export/payments.csv');
  assert.ok(typeof csv === 'string' && csv.includes('id,referencia,metodo'));
});
await test('admin stats and audit log are available', async () => {
  const stats = await admin.get('/api/admin/stats');
  assert.ok(stats.counts.revenue >= 500);
  assert.ok(stats.counts.commission >= 75);
  const audit = await admin.get('/api/admin/audit');
  assert.ok(audit.logs.length > 0);
});
await test('admin can send a notification to a student', async () => {
  const users = await admin.get('/api/admin/users');
  const target = users.users.find(u => u.role === 'student' && u.email.startsWith('teste.estudante.'));
  assert.ok(target, 'test student not found');
  const sent = await admin.post('/api/admin/notifications', { userId: target.id, title: 'Aviso de teste', body: 'Notificação enviada pela administração.', link: '/painel' });
  assert.ok(sent.ok);
  const notifications = await student.get('/api/notifications');
  assert.ok(notifications.notifications.some(n => n.title === 'Aviso de teste'));
});

await test('teacher cannot access admin API', async () => { await assert.rejects(() => teacher.get('/api/admin/stats'), (e) => e.status === 403); });
await test('teacher cannot book own lesson', async () => {
  await assert.rejects(() => teacher.post(`/api/student/lessons/${freeLessonId}/bookings`, { method: 'M-Pesa', studentName: 'Professor Teste', studentPhone: '84 000 0012' }), (e) => e.status === 400);
});
await test('invalid verification token is rejected', async () => {
  await assert.rejects(() => anon.post('/api/auth/verify-email', { token: 'invalido' }), (e) => e.status === 400);
});
await test('password reset flow works', async () => {
  const forgot = await anon.post('/api/auth/forgot-password', { email: `teste.estudante.${SUFFIX}@educa.mz` });
  assert.ok(forgot.devUrl);
  const token = tokenFrom(forgot.devUrl);
  await anon.post('/api/auth/reset-password', { token, password: 'NovaSenha@123' });
  const login = await student.post('/api/auth/login', { email: `teste.estudante.${SUFFIX}@educa.mz`, password: 'NovaSenha@123' });
  assert.equal(login.user.role, 'student');
});
// clear test payment numbers so the delivered platform starts in a clean, honest setup state
await test('restore initial payment configuration', async () => {
  await admin.patch('/api/admin/settings', { commission: initialSettings.commission, mpesaNumber: initialSettings.mpesa_number, emolaNumber: initialSettings.emola_number, supportEmail: initialSettings.support_email, supportPhone: initialSettings.support_phone, announcement: initialSettings.announcement });
});
try {
  const db = new Database(path.resolve(process.env.DATA_DIR || 'data', 'educa.sqlite'));
  const testUsers = db.prepare("SELECT id FROM users WHERE email LIKE 'teste.%@educa.mz' OR email LIKE 'outro.%@educa.mz'").all();
  const ids = testUsers.map(u => u.id);
  if (ids.length) {
    const inList = ids.map(() => '?').join(',');
    db.prepare(`DELETE FROM files WHERE owner_id IN (${inList})`).run(...ids);
    db.prepare(`DELETE FROM audit_logs WHERE actor_id IN (${inList})`).run(...ids);
    db.prepare(`DELETE FROM users WHERE id IN (${inList})`).run(...ids);
  }
  db.close();
  console.log(`Cleanup: ${ids.length} test users removed.`);
} catch (e) { console.log('Cleanup warning:', e.message); }
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) { console.log('Failures:', failures); process.exit(1); }
