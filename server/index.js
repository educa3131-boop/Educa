import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import fs from 'node:fs';
import { ZodError } from 'zod';
import authRoutes from './routes/auth.js';
import catalogRoutes from './routes/catalog.js';
import teacherRoutes from './routes/teacher.js';
import studentRoutes from './routes/student.js';
import adminRoutes from './routes/admin.js';
import messageRoutes from './routes/messages.js';
import notificationRoutes from './routes/notifications.js';
import fileRoutes from './routes/files.js';
import { getSessionUser } from './auth.js';

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' }, xFrameOptions: false }));
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use((req, res, next) => { req.user = getSessionUser(req); next(); });

const apiLimiter = rateLimit({ windowMs: 60_000, limit: 600, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Demasiados pedidos. Tenta novamente dentro de um minuto.' } });
const authLimiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Demasiadas tentativas. Tenta novamente dentro de um minuto.' } });
const bookingLimiter = rateLimit({ windowMs: 60_000, limit: 40, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Demasiados pedidos de reserva. Tenta novamente dentro de um minuto.' } });
app.use('/api', apiLimiter);

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'educa-api', time: new Date().toISOString() }));
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth', authRoutes);
app.use('/api', catalogRoutes);
app.use('/api/teacher', teacherRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/admin', adminRoutes);

app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint não encontrado.' }));

const dist = path.resolve(process.cwd(), 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.get('*', (req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    res.sendFile(path.join(dist, 'index.html'));
  });
}

app.use((err, req, res, next) => {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Dados inválidos.', issues: err.issues.map(i => ({ path: i.path.join('.'), message: i.message })) });
  }
  if (err?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'O ficheiro excede o limite de 5 MB.' });
  console.error('[EDUCA]', err);
  res.status(500).json({ error: 'Ocorreu um erro inesperado. Tenta novamente.' });
});

if (!process.env.ADMIN_PASSWORD) console.warn('[EDUCA] ADMIN_PASSWORD não definida. Na primeira execução é gerada uma palavra-passe aleatória e mostrada no log. Define ADMIN_PASSWORD para escolher uma.');
if (process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'true') console.warn('[EDUCA] AVISO: define COOKIE_SECURE=true em produção para proteger os cookies de sessão.');
if (process.env.NODE_ENV === 'production' && process.env.EXPOSE_DEV_LINKS === 'true') console.warn('[EDUCA] AVISO: EXPOSE_DEV_LINKS=true expõe links de verificação/reposição. Desactiva em produção.');

const port = Number(process.env.PORT) || 3000;
app.listen(port, '0.0.0.0', () => console.log(`EDUCA a correr em http://0.0.0.0:${port}`));

export default app;
