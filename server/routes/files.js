import { Router } from 'express';
import multer from 'multer';
import db, { now, uid } from '../db.js';
import { requireAuth, getSessionUser } from '../auth.js';
import { fail } from '../helpers.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
const allowed = new Set(['image/jpeg','image/png','image/webp','image/gif','application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document']);

router.post('/', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return fail(res, 400, 'Nenhum ficheiro recebido.');
  if (!allowed.has(req.file.mimetype)) return fail(res, 415, 'Formato não permitido. Usa JPG, PNG, WEBP, GIF, PDF ou DOC/DOCX.');
  const visibility = req.body.visibility === 'public' ? 'public' : 'private';
  const id = uid('file_');
  db.prepare('INSERT INTO files (id,owner_id,filename,mime,size,visibility,data,created_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(id, req.user.id, req.file.originalname.slice(0, 180), req.file.mimetype, req.file.size, visibility, req.file.buffer.toString('base64'), now());
  res.status(201).json({ id, filename: req.file.originalname, mime: req.file.mimetype, size: req.file.size, url: `/api/files/${id}` });
});

router.get('/:id', (req, res) => {
  const file = db.prepare('SELECT * FROM files WHERE id = ?').get(req.params.id);
  if (!file) return fail(res, 404, 'Ficheiro não encontrado.');
  const user = getSessionUser(req);
  const isOwner = user && file.owner_id === user.id;
  const isAdmin = user?.role === 'admin';
  if (!isOwner && !isAdmin && file.visibility !== 'public') {
    const doc = db.prepare('SELECT application_id FROM teacher_documents WHERE file_id = ?').get(file.id);
    if (doc) {
      const app = db.prepare('SELECT user_id FROM teacher_applications WHERE id = ?').get(doc.application_id);
      if (user && app?.user_id === user.id) return send(res, file);
    }
    const pay = db.prepare('SELECT p.student_id, l.teacher_id FROM payments p JOIN bookings b ON b.id=p.booking_id JOIN lessons l ON l.id=b.lesson_id WHERE p.proof_file_id = ?').get(file.id);
    if (pay && user && (pay.student_id === user.id || pay.teacher_id === user.id)) return send(res, file);
    return fail(res, 403, 'Sem acesso a este ficheiro.');
  }
  return send(res, file);
});

function send(res, file) {
  const buf = Buffer.from(file.data, 'base64');
  res.setHeader('Content-Type', file.mime);
  res.setHeader('Content-Length', String(buf.length));
  res.setHeader('Cache-Control', 'private, max-age=60');
  res.setHeader('Content-Disposition', `${file.mime.startsWith('image/') ? 'inline' : 'attachment'}; filename="${encodeURIComponent(file.filename)}"`);
  res.end(buf);
}

export default router;
