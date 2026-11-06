export const formatMT = (value) => {
  const n = Number(value) || 0;
  if (n === 0) return 'Grátis';
  return `${new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 0 }).format(n)} MT`;
};
export const formatNumber = (value) => new Intl.NumberFormat('pt-PT').format(Number(value) || 0);
export const formatDate = (iso, opts = { day: '2-digit', month: 'short', year: 'numeric' }) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-PT', opts).format(d);
};
export const formatDateTime = (iso) => formatDate(iso, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
export const formatTime = (iso) => formatDate(iso, { hour: '2-digit', minute: '2-digit' });
export const formatWeekday = (iso) => formatDate(iso, { weekday: 'long', day: '2-digit', month: 'long' });
export const formatDuration = (minutes) => {
  const m = Number(minutes) || 0;
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60); const rest = m % 60;
  return rest ? `${h}h ${rest}min` : `${h}h`;
};
export const initials = (name) => String(name || 'E').trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase()).join('') || 'E';
export const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const lessonEnd = (lesson) => {
  const start = new Date(lesson?.start_at || lesson?.startAt);
  const safeStart = Number.isNaN(start.getTime()) ? new Date() : start;
  return new Date(safeStart.getTime() + (Number(lesson?.duration) || 60) * 60000).toISOString();
};
export const countdown = (iso) => {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return 'A decorrer ou terminada';
  const days = Math.floor(diff / 864e5); const hours = Math.floor((diff % 864e5) / 36e5); const mins = Math.floor((diff % 36e5) / 6e4);
  if (days) return `Começa em ${days} dia${days > 1 ? 's' : ''}`;
  if (hours) return `Começa em ${hours}h ${mins}min`;
  return `Começa em ${mins}min`;
};
export const PHASE_LABELS = {
  draft: 'Rascunho', published: 'Publicada', booked: 'Reservada', awaiting_payment: 'Aguardando pagamento',
  confirmed: 'Confirmada', in_progress: 'Em andamento', completed: 'Concluída', cancelled: 'Cancelada', unknown: 'Desconhecido'
};
export const BOOKING_LABELS = { pending: 'Pagamento pendente', paid: 'Pago', completed: 'Concluída', cancelled: 'Cancelada', refunded: 'Reembolsada' };
export const PAYMENT_LABELS = { pending: 'Pendente', confirmed: 'Confirmado', rejected: 'Rejeitado', refunded: 'Reembolsado', cancelled: 'Cancelado' };
export const APPLICATION_LABELS = { pending: 'Em análise', approved: 'Aprovado', rejected: 'Rejeitado' };
export const LESSON_STATUS_LABELS = { draft: 'Rascunho', published: 'Publicada', completed: 'Concluída', cancelled: 'Cancelada' };
export const WEEKDAYS = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
export const WEEKDAYS_SHORT = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
export const todayLong = () => new Intl.DateTimeFormat('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
