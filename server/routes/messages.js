import { Router } from 'express';
import { z } from 'zod';
import db, { now, uid , runTx } from '../db.js';
import { requireAuth } from '../auth.js';
import { asyncHandler, fail, notify, audit } from '../helpers.js';

const router = Router();
router.use(requireAuth);

function conversationRow(c, viewerId) {
  const otherId = c.student_id === viewerId ? c.teacher_id : c.student_id;
  const other = db.prepare('SELECT id,name,role,avatar_file_id FROM users WHERE id = ?').get(otherId);
  const last = db.prepare('SELECT body,sender_id,created_at FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1').get(c.id);
  const unread = db.prepare('SELECT COUNT(*) c FROM messages WHERE conversation_id = ? AND sender_id <> ? AND read_at IS NULL').get(c.id, viewerId).c;
  const lesson = c.lesson_id ? db.prepare('SELECT title,start_at FROM lessons WHERE id = ?').get(c.lesson_id) : null;
  return { id: c.id, other, lesson, lastMessage: last || null, unread, lastMessageAt: c.last_message_at, createdAt: c.created_at };
}

router.get('/conversations', (req, res) => {
  const col = req.user.role === 'teacher' ? 'teacher_id' : 'student_id';
  const rows = db.prepare(`SELECT * FROM conversations WHERE ${col} = ? ORDER BY last_message_at DESC`).all(req.user.id);
  res.json({ conversations: rows.map(c => conversationRow(c, req.user.id)) });
});

const createSchema = z.object({ teacherId: z.string().optional(), studentId: z.string().optional(), lessonId: z.string().optional() });
router.post('/conversations', asyncHandler(async (req, res) => {
  const data = createSchema.parse(req.body);
  let studentId = req.user.role === 'teacher' ? data.studentId : req.user.id;
  let teacherId = req.user.role === 'teacher' ? req.user.id : data.teacherId;
  if (!studentId || !teacherId) return fail(res, 400, 'Selecciona o participante da conversa.');
  if (studentId === teacherId) return fail(res, 400, 'Não é possível iniciar uma conversa consigo próprio.');
  const teacher = db.prepare(`SELECT p.name FROM profiles p JOIN users u ON u.id=p.user_id WHERE p.user_id=? AND p.published=1 AND u.status='active'`).get(teacherId);
  if (!teacher) return fail(res, 404, 'Professor não encontrado.');
  if (req.user.role === 'teacher') {
    const link = db.prepare(`SELECT b.id FROM bookings b JOIN lessons l ON l.id=b.lesson_id WHERE b.student_id=? AND l.teacher_id=?`).get(studentId, teacherId);
    if (!link) return fail(res, 403, 'Só podes conversar com estudantes com reservas nas tuas aulas.');
  }
  if (data.lessonId) {
    const lesson = db.prepare('SELECT id,teacher_id FROM lessons WHERE id = ?').get(data.lessonId);
    if (!lesson || lesson.teacher_id !== teacherId) return fail(res, 400, 'Aula inválida para esta conversa.');
  }
  const existing = db.prepare(`SELECT * FROM conversations WHERE student_id = ? AND teacher_id = ? AND IFNULL(lesson_id,'') = IFNULL(?,'')`).get(studentId, teacherId, data.lessonId || null);
  if (existing) return res.json({ conversation: conversationRow(existing, req.user.id) });
  const id = uid('conv_');
  db.prepare('INSERT INTO conversations (id,student_id,teacher_id,lesson_id,created_at,last_message_at) VALUES (?,?,?,?,?,?)').run(id, studentId, teacherId, data.lessonId || null, now(), now());
  const other = studentId === req.user.id ? teacherId : studentId;
  notify(other, 'message', 'Nova conversa', `${req.user.name} iniciou uma conversa contigo.`, '/mensagens');
  audit(req.user, 'conversation.create', 'conversation', id, null);
  res.status(201).json({ conversation: conversationRow(db.prepare('SELECT * FROM conversations WHERE id = ?').get(id), req.user.id) });
}));

function loadConversation(id, userId) {
  const c = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
  if (!c) return { error: 'Conversa não encontrada.' };
  if (c.student_id !== userId && c.teacher_id !== userId) return { error: 'Sem acesso a esta conversa.' };
  return { conversation: c };
}

router.get('/conversations/:id', (req, res) => {
  const { conversation, error } = loadConversation(req.params.id, req.user.id);
  if (error) return res.status(403).json({ error: 'Sem acesso a esta conversa.' });
  const messages = db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC').all(conversation.id);
  res.json({ conversation: conversationRow(conversation, req.user.id), messages });
});

const messageSchema = z.object({ body: z.string().trim().min(1).max(4000) });
router.post('/conversations/:id/messages', asyncHandler(async (req, res) => {
  const { conversation, error } = loadConversation(req.params.id, req.user.id);
  if (error) return fail(res, 403, 'Sem acesso a esta conversa.');
  const { body } = messageSchema.parse(req.body);
  const id = uid('msg_');
  runTx(() => {
    db.prepare('INSERT INTO messages (id,conversation_id,sender_id,body,created_at) VALUES (?,?,?,?,?)').run(id, conversation.id, req.user.id, body, now());
    db.prepare('UPDATE conversations SET last_message_at = ? WHERE id = ?').run(now(), conversation.id);
  });
  const other = conversation.student_id === req.user.id ? conversation.teacher_id : conversation.student_id;
  notify(other, 'message', 'Nova mensagem', `${req.user.name}: ${body.slice(0, 90)}${body.length > 90 ? '…' : ''}`, '/mensagens');
  res.status(201).json({ message: db.prepare('SELECT * FROM messages WHERE id = ?').get(id) });
}));

router.post('/conversations/:id/read', (req, res) => {
  const { conversation, error } = loadConversation(req.params.id, req.user.id);
  if (error) return fail(res, 403, 'Sem acesso a esta conversa.');
  db.prepare('UPDATE messages SET read_at = ? WHERE conversation_id = ? AND sender_id <> ? AND read_at IS NULL').run(now(), conversation.id, req.user.id);
  res.json({ ok: true });
});

export default router;
