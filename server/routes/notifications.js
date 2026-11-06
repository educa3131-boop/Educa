import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../auth.js';
import { asyncHandler, fail } from '../helpers.js';

const router = Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const limit = Math.min(100, Number(req.query.limit) || 50);
  const items = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?').all(req.user.id, limit);
  const unread = db.prepare('SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND read_at IS NULL').get(req.user.id).c;
  res.json({ notifications: items, unread });
});

router.post('/:id/read', (req, res) => {
  const n = db.prepare('SELECT * FROM notifications WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!n) return fail(res, 404, 'Notificação não encontrada.');
  db.prepare('UPDATE notifications SET read_at = ? WHERE id = ?').run(new Date().toISOString(), n.id);
  res.json({ ok: true });
});

router.post('/read-all', (req, res) => {
  db.prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL').run(new Date().toISOString(), req.user.id);
  res.json({ ok: true });
});

export default router;
