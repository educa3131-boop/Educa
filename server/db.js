import Database from 'better-sqlite3';
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';

const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, 'educa.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export const now = () => new Date().toISOString();
export function runTx(fn) { return db.transaction(fn)(); }
export const uid = (prefix = '') => prefix + randomBytes(12).toString('hex');
export const hashToken = (token) => createHash('sha256').update(token).digest('hex');

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}
export function verifyPassword(password, stored) {
  try {
    const [scheme, salt, hash] = String(stored).split(':');
    if (scheme !== 'scrypt') return false;
    const candidate = scryptSync(password, salt, 64);
    const expected = Buffer.from(hash, 'hex');
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  } catch { return false; }
}

db.exec(`
CREATE TABLE IF NOT EXISTS roles (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  city TEXT,
  bio TEXT,
  role TEXT NOT NULL DEFAULT 'student' REFERENCES roles(code),
  status TEXT NOT NULL DEFAULT 'active',
  is_owner INTEGER NOT NULL DEFAULT 0,
  email_verified INTEGER NOT NULL DEFAULT 0,
  avatar_file_id TEXT,
  demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  user_agent TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS email_verifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS password_resets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'private',
  data TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS subjects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  icon TEXT NOT NULL DEFAULT 'BookOpen',
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS education_levels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS teacher_applications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  headline TEXT NOT NULL,
  bio TEXT NOT NULL,
  city TEXT NOT NULL,
  phone TEXT NOT NULL,
  price REAL NOT NULL,
  subjects TEXT NOT NULL,
  levels TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  rejection_reason TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS teacher_documents (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES teacher_applications(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  headline TEXT NOT NULL,
  bio TEXT NOT NULL,
  city TEXT NOT NULL,
  price REAL NOT NULL,
  subjects TEXT NOT NULL,
  levels TEXT NOT NULL,
  photo_file_id TEXT,
  published INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS teacher_subjects (
  id TEXT PRIMARY KEY,
  teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  UNIQUE(teacher_id, subject_id)
);
CREATE TABLE IF NOT EXISTS teacher_levels (
  id TEXT PRIMARY KEY,
  teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  level_id TEXT NOT NULL REFERENCES education_levels(id) ON DELETE CASCADE,
  UNIQUE(teacher_id, level_id)
);
CREATE TABLE IF NOT EXISTS lessons (
  id TEXT PRIMARY KEY,
  teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  subject_id TEXT NOT NULL REFERENCES subjects(id),
  level_id TEXT NOT NULL REFERENCES education_levels(id),
  mode TEXT NOT NULL DEFAULT 'individual',
  price REAL NOT NULL DEFAULT 0,
  duration INTEGER NOT NULL DEFAULT 60,
  start_at TEXT NOT NULL,
  seats INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft',
  room_code TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS schedules (
  id TEXT PRIMARY KEY,
  teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_name TEXT NOT NULL,
  student_phone TEXT NOT NULL,
  method TEXT NOT NULL,
  seat_index INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  amount REAL NOT NULL DEFAULT 0,
  commission REAL NOT NULL DEFAULT 0,
  net REAL NOT NULL DEFAULT 0,
  paid_at TEXT,
  confirmed_by TEXT,
  cancelled_at TEXT,
  cancellation_reason TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount REAL NOT NULL,
  method TEXT NOT NULL,
  reference TEXT,
  proof_file_id TEXT REFERENCES files(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  rejection_reason TEXT,
  submitted_at TEXT,
  confirmed_by TEXT,
  confirmed_at TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS payment_confirmations (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  admin_id TEXT NOT NULL REFERENCES users(id),
  decision TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS teacher_wallets (
  teacher_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance REAL NOT NULL DEFAULT 0,
  total_earned REAL NOT NULL DEFAULT 0,
  total_withdrawn REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id TEXT PRIMARY KEY,
  teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  amount REAL NOT NULL,
  balance_after REAL NOT NULL,
  booking_id TEXT,
  payout_id TEXT,
  description TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id TEXT PRIMARY KEY,
  teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount REAL NOT NULL,
  method TEXT NOT NULL,
  number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reference TEXT,
  rejection_reason TEXT,
  requested_at TEXT NOT NULL,
  decided_by TEXT,
  decided_at TEXT
);
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER,
  comment TEXT,
  status TEXT NOT NULL DEFAULT 'visible',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS room_access (
  id TEXT PRIMARY KEY,
  lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  granted_by TEXT REFERENCES users(id),
  granted_at TEXT NOT NULL,
  UNIQUE(lesson_id, student_id)
);
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id TEXT REFERENCES lessons(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  last_message_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  read_at TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  link TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  target_name TEXT NOT NULL,
  reason TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  resolution_note TEXT,
  resolved_by TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS platform_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  commission REAL NOT NULL DEFAULT 15,
  mpesa_number TEXT NOT NULL DEFAULT '',
  emola_number TEXT NOT NULL DEFAULT '',
  support_email TEXT NOT NULL DEFAULT 'suporte@educa.mz',
  support_phone TEXT NOT NULL DEFAULT '',
  announcement TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  actor_name TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_lessons_teacher ON lessons(teacher_id);
CREATE INDEX IF NOT EXISTS idx_lessons_start ON lessons(start_at);
CREATE INDEX IF NOT EXISTS idx_lessons_status ON lessons(status);
CREATE INDEX IF NOT EXISTS idx_bookings_lesson ON bookings(lesson_id);
CREATE INDEX IF NOT EXISTS idx_bookings_student ON bookings(student_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_reference ON payments(reference) WHERE reference IS NOT NULL AND reference <> '';
CREATE INDEX IF NOT EXISTS idx_wallet_teacher ON wallet_transactions(teacher_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_teacher ON withdrawal_requests(teacher_id);
CREATE INDEX IF NOT EXISTS idx_reviews_teacher ON reviews(teacher_id);
CREATE INDEX IF NOT EXISTS idx_reviews_lesson ON reviews(lesson_id);
CREATE INDEX IF NOT EXISTS idx_room_access_student ON room_access(student_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
`);

const seedSubjects = [
  ['Matemática','matematica','Calculator'], ['Física','fisica','Atom'], ['Química','quimica','FlaskConical'],
  ['Biologia','biologia','Dna'], ['Português','portugues','BookOpen'], ['Inglês','ingles','Languages'],
  ['História','historia','Landmark'], ['Geografia','geografia','Globe2'], ['Informática','informatica','Monitor'],
  ['Contabilidade','contabilidade','Receipt'], ['Estatística','estatistica','ChartColumn'], ['Desenho','desenho','Palette']
];
const seedLevels = [
  ['Primário','primario',1], ['Secundário 1º ciclo','secundario-1',2], ['Secundário 2º ciclo','secundario-2',3],
  ['Universitário','universitario',4], ['Adultos','adultos',5]
];

try { db.exec('ALTER TABLE users ADD COLUMN demo INTEGER NOT NULL DEFAULT 0'); } catch {}
db.prepare("UPDATE users SET demo = 1 WHERE email LIKE 'demo.%@educa.mz'").run();

const seed = db.transaction(() => {
  const insertRole = db.prepare('INSERT OR IGNORE INTO roles (code, name) VALUES (?, ?)');
  insertRole.run('student','Estudante'); insertRole.run('teacher','Professor'); insertRole.run('admin','Administrador');
  const insSub = db.prepare('INSERT OR IGNORE INTO subjects (id,name,slug,icon,sort_order) VALUES (?,?,?,?,?)');
  seedSubjects.forEach(([name,slug,icon],i)=>insSub.run(slug,name,slug,icon,i));
  const insLevel = db.prepare('INSERT OR IGNORE INTO education_levels (id,name,slug,sort_order) VALUES (?,?,?,?)');
  seedLevels.forEach(([name,slug,order])=>insLevel.run(slug,name,slug,order));
  db.prepare('INSERT OR IGNORE INTO platform_settings (id, commission, support_email, updated_at) VALUES (1, 15, ?, ?)').run('suporte@educa.mz', now());
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@educa.mz').toLowerCase();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);
  if (!existing) {
    const id = uid('usr_');
    const generatedPassword = !process.env.ADMIN_PASSWORD;
    const adminPassword = process.env.ADMIN_PASSWORD || randomBytes(12).toString('hex');
    db.prepare(`INSERT INTO users (id,email,password_hash,name,role,status,is_owner,email_verified,created_at,updated_at)
      VALUES (?,?,?,?,'admin','active',1,1,?,?)`).run(id, adminEmail, hashPassword(adminPassword), 'Administrador EDUCA', now(), now());
    if (generatedPassword) console.log(`[EDUCA] Palavra-passe inicial do administrador (${adminEmail}): ${adminPassword}`);
  }
});
seed();

export default db;
