const FROM = process.env.MAIL_FROM || 'EDUCA <no-reply@educa.mz>';
export async function sendMail({ to, subject, html, text }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { delivered: false, reason: 'RESEND_API_KEY não configurada; o email não foi enviado.' };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [to], subject, html, text })
    });
    if (!res.ok) return { delivered: false, reason: `Falha ao enviar email (${res.status}).` };
    return { delivered: true };
  } catch (e) { return { delivered: false, reason: 'Serviço de email indisponível.' }; }
}
export const exposeDevLinks = () => process.env.NODE_ENV !== 'production' || process.env.EXPOSE_DEV_LINKS === 'true';
