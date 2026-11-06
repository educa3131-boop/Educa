export class ApiError extends Error {
  constructor(message, status, data) { super(message); this.status = status; this.data = data; }
}
export async function api(path, options = {}) {
  const { method = 'GET', body, form, signal } = options;
  const headers = {};
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(`/api${path}`, { method, headers, body: payload, credentials: 'include', signal });
  let data = {};
  try { data = await res.json(); } catch { data = {}; }
  if (!res.ok) throw new ApiError(data.error || `Erro ${res.status}`, res.status, data);
  return data;
}
export async function uploadFile(file, visibility = 'private') {
  const form = new FormData();
  form.append('file', file);
  form.append('visibility', visibility);
  return api('/files', { method: 'POST', form });
}
export const getQuery = (params) => {
  const q = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') q.set(k, v); });
  const s = q.toString();
  return s ? `?${s}` : '';
};
