import db, { now, uid, hashPassword, runTx } from './db.js';
import { generateRoomCode } from './helpers.js';

const DEMO_TEACHER = 'demo.professor@educa.mz';
const DEMO_STUDENT = 'demo.estudante@educa.mz';
const DEMO_PASSWORD = 'Demo@1234';

export function seedDemo(actor) {
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(DEMO_TEACHER);
  if (existing) {
    return { ok: true, alreadySeeded: true, credentials: { admin: { email: process.env.ADMIN_EMAIL || 'admin@educa.mz', password: process.env.ADMIN_PASSWORD || 'Admin@1234' }, teacher: { email: DEMO_TEACHER, password: DEMO_PASSWORD }, student: { email: DEMO_STUDENT, password: DEMO_PASSWORD } } };
  }
  const teacherId = uid('usr_'); const studentId = uid('usr_');
  const appId = uid('app_');
  const subId = (slug) => db.prepare('SELECT id FROM subjects WHERE id = ?').get(slug)?.id;
  const lvlId = (slug) => db.prepare('SELECT id FROM education_levels WHERE id = ?').get(slug)?.id;
  const subjectIds = [subId('matematica'), subId('biologia'), subId('ingles')].filter(Boolean);
  const levelIds = [lvlId('secundario-2'), lvlId('universitario')].filter(Boolean);
  if (subjectIds.length < 2 || levelIds.length < 1) return { ok: false, error: 'Catálogo base indisponível.' };
  const days = (n, h = 17, m = 0) => { const d = new Date(); d.setDate(d.getDate() + n); d.setHours(h, m, 0, 0); return d.toISOString(); };
  runTx(() => {
    db.prepare(`INSERT INTO users (id,email,password_hash,name,phone,city,bio,role,status,email_verified,demo,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,'teacher','active',1,1,?,?)`).run(teacherId, DEMO_TEACHER, hashPassword(DEMO_PASSWORD), 'Ana Macuácua', '84 000 0001', 'Maputo', 'Professora de Matemática e Biologia com 8 anos de experiência em explicações no ensino secundário.', now(), now());
    db.prepare(`INSERT INTO users (id,email,password_hash,name,phone,city,role,status,email_verified,demo,created_at,updated_at)
      VALUES (?,?,?,?,?,?,'student','active',1,1,?,?)`).run(studentId, DEMO_STUDENT, hashPassword(DEMO_PASSWORD), 'João Nhaca', '84 000 0002', 'Maputo', now(), now());
    db.prepare(`INSERT INTO teacher_applications (id,user_id,name,headline,bio,city,phone,price,subjects,levels,status,reviewed_by,reviewed_at,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,'approved',?,?,?,?)`).run(appId, teacherId, 'Ana Macuácua', 'Explicadora de Matemática e Biologia', 'Professora dedicada, com experiência em preparação para exames do secundário e acompanhamento universitário.', 'Maputo', '84 000 0001', 500, JSON.stringify(subjectIds), JSON.stringify(levelIds), actor.id, now(), now(), now());
    db.prepare(`INSERT INTO profiles (id,user_id,name,headline,bio,city,price,subjects,levels,published,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,1,?,?)`).run(appId, teacherId, 'Ana Macuácua', 'Explicadora de Matemática e Biologia', 'Professora dedicada, com experiência em preparação para exames do secundário e acompanhamento universitário.', 'Maputo', 500, JSON.stringify(subjectIds), JSON.stringify(levelIds), now(), now());
    const insS = db.prepare('INSERT OR IGNORE INTO teacher_subjects (id,teacher_id,subject_id) VALUES (?,?,?)'); subjectIds.forEach(s => insS.run(uid('ts_'), teacherId, s));
    const insL = db.prepare('INSERT OR IGNORE INTO teacher_levels (id,teacher_id,level_id) VALUES (?,?,?)'); levelIds.forEach(l => insL.run(uid('tl_'), teacherId, l));
    const lessonIds = [];
    const lessons = [
      { title: 'Matemática — Funções e gráficos', description: 'Aula individual de revisão de funções, domínio, contradomínio e leitura de gráficos, com exercícios resolvidos e material de apoio.', subject: subjectIds[0], level: levelIds[0], mode: 'individual', price: 500, duration: 60, start: days(2, 17), seats: 1, status: 'published' },
      { title: 'Biologia: a célula e as suas partes', description: 'Aula em grupo sobre a estrutura da célula, organelos e funções. Inclui esquema-resumo e sessão de perguntas.', subject: subjectIds[1], level: levelIds[0], mode: 'grupo', price: 300, duration: 90, start: days(4, 18), seats: 5, status: 'published' },
      { title: 'Inglês — conversação e fluência', description: 'Sessão de conversação para ganhar confiança oral, com vocabulário prático e correcção personalizada.', subject: subjectIds[2], level: levelIds[1], mode: 'individual', price: 400, duration: 60, start: days(-3, 16), seats: 1, status: 'completed' }
    ];
    const insLesson = db.prepare(`INSERT INTO lessons (id,teacher_id,title,description,subject_id,level_id,mode,price,duration,start_at,seats,status,room_code,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    for (const l of lessons) { const id = uid('ls_'); insLesson.run(id, teacherId, l.title, l.description, l.subject, l.level, l.mode, l.price, l.duration, l.start, l.seats, l.status, generateRoomCode(), now(), now()); lessonIds.push(id); }
    const insBooking = db.prepare(`INSERT INTO bookings (id,lesson_id,student_id,student_name,student_phone,method,seat_index,status,amount,commission,net,paid_at,confirmed_by,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const insPayment = db.prepare(`INSERT INTO payments (id,booking_id,student_id,amount,method,reference,status,submitted_at,confirmed_by,confirmed_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
    // completed past lesson with confirmed payment + review + wallet
    const pastBooking = uid('bk_'); const pastPayment = uid('pay_');
    insBooking.run(pastBooking, lessonIds[2], studentId, 'João Nhaca', '84 000 0002', 'M-Pesa', 1, 'completed', 400, 60, 340, days(-3, 17), actor.id, days(-4));
    insPayment.run(pastPayment, pastBooking, studentId, 400, 'M-Pesa', 'DEMO-PAST-1', 'confirmed', days(-4), actor.id, days(-3), days(-4));
    db.prepare('INSERT INTO room_access (id,lesson_id,student_id,granted_by,granted_at) VALUES (?,?,?,?,?)').run(uid('ra_'), lessonIds[2], studentId, actor.id, days(-3));
    db.prepare(`INSERT INTO reviews (id,booking_id,lesson_id,teacher_id,student_id,rating,comment,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'visible',?,?)`).run(uid('rev_'), pastBooking, lessonIds[2], teacherId, studentId, 5, 'Aula muito clara e bem organizada. A professora explicou com calma e respondeu a todas as dúvidas.', days(-2), days(-2));
    db.prepare('INSERT INTO teacher_wallets (teacher_id,balance,total_earned,total_withdrawn,updated_at) VALUES (?,?,?,?,?)').run(teacherId, 340, 340, 0, now());
    db.prepare('INSERT INTO wallet_transactions (id,teacher_id,type,amount,balance_after,booking_id,description,created_at) VALUES (?,?,?,?,?,?,?,?)').run(uid('wt_'), teacherId, 'earning', 340, 340, pastBooking, 'Aula "Inglês — conversação e fluência"', days(-3));
    // pending booking on upcoming lesson
    const pendingBooking = uid('bk_'); const pendingPayment = uid('pay_');
    insBooking.run(pendingBooking, lessonIds[0], studentId, 'João Nhaca', '84 000 0002', 'M-Pesa', 1, 'pending', 500, 0, 0, null, null, now());
    insPayment.run(pendingPayment, pendingBooking, studentId, 500, 'M-Pesa', 'DEMO-PENDING-1', 'pending', now(), null, null, now());
    db.prepare(`INSERT INTO withdrawal_requests (id,teacher_id,amount,method,number,status,requested_at) VALUES (?,?,?,?,?,'pending',?)`).run(uid('wd_'), teacherId, 100, 'M-Pesa', '84 000 0001', now());
    // conversation
    const convId = uid('conv_');
    db.prepare('INSERT INTO conversations (id,student_id,teacher_id,lesson_id,created_at,last_message_at) VALUES (?,?,?,?,?,?)').run(convId, studentId, teacherId, lessonIds[0], now(), now());
    db.prepare('INSERT INTO messages (id,conversation_id,sender_id,body,created_at) VALUES (?,?,?,?,?)').run(uid('msg_'), convId, teacherId, 'Olá João! Vi a tua reserva. Leva o teu caderno de exercícios para a aula de Matemática.', now());
    db.prepare('INSERT INTO messages (id,conversation_id,sender_id,body,created_at) VALUES (?,?,?,?,?)').run(uid('msg_'), convId, studentId, 'Olá professora! Obrigado. Vou levar sim. Podemos rever também os exercícios de gráficos?', now());
    db.prepare('INSERT INTO notifications (id,user_id,type,title,body,link,created_at) VALUES (?,?,?,?,?,?,?)').run(uid('ntf_'), studentId, 'booking', 'Reserva registada', 'A tua reserva para "Matemática — Funções e gráficos" está pendente de pagamento.', '/painel', now());
    db.prepare('INSERT INTO notifications (id,user_id,type,title,body,link,created_at) VALUES (?,?,?,?,?,?,?)').run(uid('ntf_'), teacherId, 'booking', 'Nova reserva', 'João Nhaca reservou a aula "Matemática — Funções e gráficos".', '/professor', now());
  });
  return {
    ok: true, alreadySeeded: false,
    credentials: {
      admin: { email: process.env.ADMIN_EMAIL || 'admin@educa.mz', password: process.env.ADMIN_PASSWORD || 'Admin@1234' },
      teacher: { email: DEMO_TEACHER, password: DEMO_PASSWORD },
      student: { email: DEMO_STUDENT, password: DEMO_PASSWORD }
    },
    note: 'Dados de demonstração criados. Configura os números M-Pesa/e-Mola em Administração → Definições antes de confirmar o pagamento pendente.'
  };
}
