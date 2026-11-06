import { chromium } from 'playwright';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@educa.mz';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) { console.error('Define ADMIN_PASSWORD no ambiente para correr os testes de interface.'); process.exit(1); }
const browser = await chromium.launch();
const results = [];
const errors = [];
async function newPage(viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.on('console', m => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });
  page.on('pageerror', e => errors.push(`[pageerror] ${e.message}`));
  return { context, page };
}
async function check(name, fn) {
  try { await fn(); results.push(`✓ ${name}`); }
  catch (e) { results.push(`✗ ${name}: ${e.message}`); }
}
const { context, page } = await newPage();
await check('home loads with hero and real lesson data', async () => {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  const text = await page.locator('body').innerText();
  if (!text.includes('Aprende com os melhores professores')) throw new Error('hero missing');
  if (!text.includes('Aulas ao vivo')) throw new Error('live classes missing');
  if (!text.includes('Matemática')) throw new Error('real lesson data missing');
});
await check('lessons page loads', async () => {
  await page.goto(`${BASE}/aulas`, { waitUntil: 'networkidle' });
  const text = await page.locator('body').innerText();
  if (!text.includes('Encontra a tua próxima aula')) throw new Error('lessons heading missing');
});
await check('teachers page loads', async () => {
  await page.goto(`${BASE}/professores`, { waitUntil: 'networkidle' });
  const text = await page.locator('body').innerText();
  if (!text.includes('Aprende com quem sabe ensinar')) throw new Error('teachers heading missing');
  if (!text.includes('Ana Macuácua')) throw new Error('demo teacher missing');
});
await check('teacher profile loads', async () => {
  await page.goto(`${BASE}/professores`, { waitUntil: 'networkidle' });
  await page.locator('a[href^="/professor/"]').first().click();
  await page.waitForLoadState('networkidle');
  await page.getByText('Sobre o professor').first().waitFor({ timeout: 15000 });
  const text = await page.locator('body').innerText();
  if (!text.includes('Sobre o professor')) throw new Error('profile content missing');
});
await check('login page loads', async () => {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  if (!(await page.locator('body').innerText()).includes('Bem-vindo de volta')) throw new Error('login heading missing');
});
await check('student login and dashboard', async () => {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.locator('input[type=email]').fill('demo.estudante@educa.mz');
  await page.locator('input[type=password]').fill('Demo@1234');
  await page.getByRole('button', { name: /Entrar na EDUCA/i }).click();
  await page.waitForURL('**/painel', { timeout: 15000 });
  await page.waitForLoadState('networkidle');
  const text = await page.locator('body').innerText();
  if (!text.includes('Painel do estudante')) throw new Error('student panel missing');
  if (!text.includes('As minhas reservas')) throw new Error('bookings tab missing');
});
await check('student messages page loads', async () => {
  await page.goto(`${BASE}/mensagens`, { waitUntil: 'networkidle' });
  const text = await page.locator('body').innerText();
  if (!text.includes('Conversas')) throw new Error('messages missing');
});
await check('notifications page loads', async () => {
  await page.goto(`${BASE}/notificacoes`, { waitUntil: 'networkidle' });
  const text = await page.locator('body').innerText();
  if (!text.includes('Notificações')) throw new Error('notifications missing');
});
await check('profile page loads', async () => {
  await page.goto(`${BASE}/perfil`, { waitUntil: 'networkidle' });
  const text = await page.locator('body').innerText();
  if (!text.includes('O meu perfil')) throw new Error('profile missing');
});
await context.close();
const teacherCtx = await newPage();
await check('teacher login and dashboard', async () => {
  await teacherCtx.page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await teacherCtx.page.locator('input[type=email]').fill('demo.professor@educa.mz');
  await teacherCtx.page.locator('input[type=password]').fill('Demo@1234');
  await teacherCtx.page.getByRole('button', { name: /Entrar na EDUCA/i }).click();
  await teacherCtx.page.waitForURL('**/professor', { timeout: 15000 });
  await teacherCtx.page.waitForLoadState('networkidle');
  await teacherCtx.page.getByText('As minhas aulas').first().waitFor({ timeout: 15000 });
  const text = await teacherCtx.page.locator('body').innerText();
  if (!text.includes('Painel do professor')) throw new Error('teacher panel missing');
  if (!text.includes('As minhas aulas')) throw new Error('lessons tab missing');
  if (!text.includes('Carteira')) throw new Error('wallet tab missing');
});
await teacherCtx.context.close();
const adminCtx = await newPage();
await check('admin login and dashboard', async () => {
  await adminCtx.page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await adminCtx.page.locator('input[type=email]').fill(ADMIN_EMAIL);
  await adminCtx.page.locator('input[type=password]').fill(ADMIN_PASSWORD);
  await adminCtx.page.getByRole('button', { name: /Entrar na EDUCA/i }).click();
  await adminCtx.page.waitForURL('**/admin', { timeout: 15000 });
  await adminCtx.page.waitForLoadState('networkidle');
  await adminCtx.page.getByText('Administração EDUCA').first().waitFor({ timeout: 15000 });
  const text = await adminCtx.page.locator('body').innerText();
  if (!text.includes('Administração EDUCA')) throw new Error('admin panel missing');
  if (!text.includes('Candidaturas')) throw new Error('applications tab missing');
  if (!text.includes('Receita confirmada')) throw new Error('stats missing');
});
await check('admin applications and payments tabs load', async () => {
  await adminCtx.page.getByRole('button', { name: /Candidaturas/ }).first().click();
  await adminCtx.page.waitForLoadState('networkidle');
  if (!(await adminCtx.page.locator('body').innerText()).includes('Candidaturas de professor')) throw new Error('applications page missing');
  await adminCtx.page.getByRole('button', { name: /^Pagamentos/ }).first().click();
  await adminCtx.page.waitForLoadState('networkidle');
  if (!(await adminCtx.page.locator('body').innerText()).includes('Pagamentos')) throw new Error('payments page missing');
});
await check('admin settings loads', async () => {
  await adminCtx.page.getByRole('button', { name: /Definições/ }).first().click();
  await adminCtx.page.waitForLoadState('networkidle');
  const text = await adminCtx.page.locator('body').innerText();
  if (!text.includes('Comissão EDUCA')) throw new Error('settings form missing');
});
await check('live room loads for authorised admin', async () => {
  const lessons = await (await fetch(`${BASE}/api/lessons`)).json();
  const future = lessons.lessons.find(l => l.status === 'published');
  if (!future) throw new Error('no published lesson');
  await adminCtx.page.goto(`${BASE}/sala/${future.id}`, { waitUntil: 'networkidle' });
  const text = await adminCtx.page.locator('body').innerText();
  if (!text.includes('Sala')) throw new Error('live room missing');
});
await adminCtx.context.close();
const mobileCtx = await newPage({ width: 390, height: 844 });
await check('mobile home has bottom navigation and no horizontal overflow', async () => {
  await mobileCtx.page.goto(BASE, { waitUntil: 'networkidle' });
  const text = await mobileCtx.page.locator('body').innerText();
  if (!text.includes('Início')) throw new Error('mobile nav missing');
  const overflow = await mobileCtx.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 2) throw new Error(`horizontal overflow ${overflow}px`);
});
await mobileCtx.context.close();
await browser.close();
console.log(results.join('\n'));
const appErrors = errors.filter(e => !/gum\.not_found|Failed to create local tracks|Permissions policy violation|ERR_UNKNOWN_URL_SCHEME|\[app:tracks\]/.test(e));
console.log('\nConsole/page errors:', appErrors.length ? appErrors : 'none (Jitsi iframe media warnings ignorados)');
if (results.some(r => r.startsWith('✗')) || appErrors.length) process.exit(1);
