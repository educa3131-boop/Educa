# Deploy da EDUCA

A EDUCA é uma aplicação **Express + SQLite** com um servidor de longa duração. Precisa de um serviço que ofereça:

1. Servidor Node.js persistente (não serverless).
2. Sistema de ficheiros persistente para `data/educa.sqlite`.
3. HTTPS (para cookies seguros).
4. Variáveis de ambiente para o proprietário e integrações.

## Vercel: build corrigido, mas dados temporários

O erro de build foi corrigido:

- `package.json` usa Node 22 (`engines: 22.x`).
- `vercel.json` usa `runtime: nodejs22.x`.
- `api/index.js` exporta a aplicação Express como função serverless.
- O `better-sqlite3` tem binário pré-compilado para Node 22. O build passa.

**Limitação importante:** o Vercel não tem um sistema de ficheiros persistente. A base de dados fica em `/tmp/educa.sqlite` e é temporária. Contas, reservas, pagamentos e mensagens desaparecem em cold starts ou reinícios. Para produção, usa Railway, Render, Fly.io ou um banco hospedado (PostgreSQL/Turso).

### Deploy no Vercel

1. Importa o repositório `educa3131-boop/Educa` no Vercel.
2. Framework: **Vite** (detetado automaticamente).
3. Build command: `npm run build`.
4. Output directory: `dist`.
5. Define as variáveis:
   - `ADMIN_PASSWORD` (secreta)
   - `APP_URL=https://<url-do-vercel>`
   - Opcional: `RESEND_API_KEY`, `MAIL_FROM`, `JITSI_JAAS_DOMAIN`, `JITSI_JAAS_KID`, `JITSI_JAAS_PRIVATE_KEY`.
6. Faz deploy.
7. A API fica em `/api`; o frontend em `/`.
8. A palavra-passe inicial do administrador é a de `ADMIN_PASSWORD`. Se não definires, é gerada uma aleatória e mostrada nos logs da função.

O `vercel.json` já define `DATA_DIR=/tmp`, `COOKIE_SECURE=true`, `EXPOSE_DEV_LINKS=false` e `NODE_ENV=production`.

## Opção recomendada: Railway

1. Entra em [Railway](https://railway.app) e cria um projeto a partir do repositório `educa3131-boop/Educa`.
2. O Railway usa o `Dockerfile` incluído.
3. Adiciona um **Volume** montado em `/data`.
4. Define as variáveis:
   - `DATA_DIR=/data`
   - `COOKIE_SECURE=true`
   - `EXPOSE_DEV_LINKS=false`
   - `ADMIN_EMAIL=admin@educa.mz`
   - `ADMIN_PASSWORD=<palavra-passe forte>`
   - `APP_URL=https://<url-do-railway>`
   - Opcional: `RESEND_API_KEY`, `MAIL_FROM`, `JITSI_JAAS_DOMAIN`, `JITSI_JAAS_KID`, `JITSI_JAAS_PRIVATE_KEY`.
5. Faz deploy. O Railway executa `npm install`, `npm run build` e `npm start`.
6. A palavra-passe inicial do administrador é a de `ADMIN_PASSWORD`. Se não definires, é gerada uma aleatória e mostrada nos logs. Altera-a no perfil.

## Render

1. Cria um **Web Service** a partir do repositório.
2. Runtime: **Docker**.
3. O `render.yaml` incluído configura o serviço, o disco de 1 GB em `/data` e as variáveis.
4. Define `ADMIN_PASSWORD`, `APP_URL` e, opcionalmente, `RESEND_API_KEY` no painel.
5. Nota: o plano gratuito do Render pode não suportar discos persistentes. Usa um plano com disco (Starter ou superior).

## Fly.io

1. Instala o `flyctl`.
2. `fly launch` (usa o `fly.toml` incluído).
3. Cria o volume: `fly volumes create educa_data --size 1 --region jnb`.
4. Define os segredos:
   ```
   fly secrets set ADMIN_PASSWORD='<palavra-passe>' APP_URL='https://educa-mz.fly.dev' RESEND_API_KEY='<chave>'
   ```
5. `fly deploy`.

## VPS / servidor próprio

1. Instala Node.js 22, `make`, `g++`, `python3` e SQLite.
2. Clona o repositório.
3. `npm install && npm run build`.
4. Cria um `.env` com `DATA_DIR`, `ADMIN_PASSWORD`, `COOKIE_SECURE=true`, `APP_URL`, etc.
5. `npm start`.
6. Usa PM2 ou systemd para manter o processo.
7. Usa Nginx + Let's Encrypt para HTTPS.
8. Faz backup regular de `data/educa.sqlite`.

## Variáveis de produção

| Variável | Valor recomendado |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `3000` |
| `DATA_DIR` | `/data` |
| `COOKIE_SECURE` | `true` |
| `EXPOSE_DEV_LINKS` | `false` |
| `ADMIN_EMAIL` | email do proprietário |
| `ADMIN_PASSWORD` | palavra-passe forte (secreta) |
| `APP_URL` | URL pública HTTPS |
| `RESEND_API_KEY` | opcional, para emails reais |
| `MAIL_FROM` | `EDUCA <no-reply@educa.mz>` |
| `JITSI_JAAS_*` | opcional, para salas com token |

## Saúde

- `GET /api/health` → `{ "ok": true }`.
- A aplicação serve o frontend em `/` e a API em `/api`.
- O volume deve ser gravável pelo processo Node.
