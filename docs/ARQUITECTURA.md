# EDUCA — Arquitectura técnica

## 1. Visão geral

A EDUCA é uma aplicação web de página única (SPA) com uma API REST própria e base de dados SQLite. O frontend é servido pelo mesmo processo Express que expõe a API, o que simplifica o deployment e evita problemas de CORS e de cookies entre origens.

```
Navegador (React SPA)
    │  fetch /api (cookies HttpOnly)
    ▼
Express (Node.js)
    ├── helmet, rate limit, validação Zod
    ├── autenticação e sessões
    ├── autorização por função e propriedade
    ├── regras de negócio (reservas, pagamentos, carteira, avaliações)
    ├── acesso a ficheiros protegidos
    └── SQLite (better-sqlite3)
        ├── users, sessions, roles
        ├── teacher_applications, teacher_documents
        ├── profiles, subjects, education_levels, teacher_subjects, teacher_levels
        ├── lessons, schedules, bookings, payments, payment_confirmations
        ├── teacher_wallets, wallet_transactions, withdrawal_requests
        ├── reviews, room_access, conversations, messages
        ├── notifications, reports, platform_settings, audit_logs
        └── files
    └── Jitsi (iframe) ou JaaS (token)
```

### Decisões técnicas

- **SPA + API no mesmo servidor:** cookies `SameSite=Lax`, sem CORS, deploy num único serviço.
- **SQLite:** base de dados relacional real, transações, chaves estrangeiras, índices e restrições. Adequada a um MVP/pre-lançamento; para escalar horizontalmente, migrar para PostgreSQL mantendo o schema.
- **Sessões no servidor:** token aleatório de 32 bytes, hash SHA-256 na base de dados, expiração de 7 dias, cookie HttpOnly. Não há JWT de sessão no frontend.
- **Autorização no servidor:** todas as rotas sensíveis verificam função e propriedade. A interface nunca é a única barreira.
- **Regras de negócio transacionais:** confirmação de pagamento, crédito de carteira, autorização de sala e criação de avaliação na mesma transação.
- **Ficheiros na base de dados:** documentos privados e comprovativos ficam em `files`, com autorização por proprietário/administração. Para produção com muitos ficheiros, mover para S3/Supabase Storage.
- **Vídeo externo:** Jitsi público por omissão; JaaS com JWT quando configurado.

## 2. Base de dados

### `users`
`id` (PK), `email` (unique), `password_hash`, `name`, `phone`, `city`, `bio`, `role` (`student|teacher|admin`), `status` (`active|suspended`), `is_owner`, `email_verified`, `avatar_file_id`, `demo`, `created_at`, `updated_at`.

### `roles`
`code` (PK), `name`. Semeado com `student`, `teacher`, `admin`.

### `sessions`
`id` (hash do token, PK), `user_id` (FK), `expires_at`, `user_agent`, `created_at`.

### `email_verifications` / `password_resets`
`id`, `user_id`, `token_hash`, `expires_at`, `used_at`, `created_at`.

### `files`
`id`, `owner_id`, `filename`, `mime`, `size`, `visibility` (`private|public`), `data` (base64), `created_at`.

### `subjects` / `education_levels`
`id`, `name`, `slug`, `icon`/`sort_order`, `active`. 12 disciplinas e 5 níveis semeados.

### `teacher_applications`
`id`, `user_id` (unique), `name`, `headline`, `bio`, `city`, `phone`, `price`, `subjects` (JSON), `levels` (JSON), `status` (`pending|approved|rejected`), `rejection_reason`, `reviewed_by`, `reviewed_at`, timestamps.

### `teacher_documents`
`id`, `application_id`, `user_id`, `kind` (`id|diploma|certificate|other`), `file_id`, `filename`, `created_at`.

### `profiles`
`id` (igual ao id da candidatura), `user_id` (unique), `name`, `headline`, `bio`, `city`, `price`, `subjects`, `levels`, `photo_file_id`, `published`, timestamps.

### `teacher_subjects` / `teacher_levels`
Relações normalizadas professor–disciplina e professor–nível.

### `lessons`
`id`, `teacher_id`, `title`, `description`, `subject_id`, `level_id`, `mode` (`individual|grupo`), `price`, `duration`, `start_at`, `seats`, `status` (`draft|published|cancelled|completed`), `room_code`, timestamps.

O estado apresentado ao utilizador é derivado: `rascunho`, `publicada`, `reservada`, `aguardando pagamento`, `confirmada`, `em andamento`, `concluída`, `cancelada`.

### `schedules`
`id`, `teacher_id`, `weekday` (0–6), `start_time`, `end_time`, `active`.

### `bookings`
`id`, `lesson_id`, `student_id`, `student_name`, `student_phone`, `method`, `seat_index`, `status` (`pending|paid|completed|cancelled|refunded`), `amount`, `commission`, `net`, `paid_at`, `confirmed_by`, `cancelled_at`, `cancellation_reason`, `created_at`.

### `payments`
`id`, `booking_id` (unique), `student_id`, `amount`, `method`, `reference` (unique quando presente), `proof_file_id`, `status` (`pending|confirmed|rejected|refunded|cancelled`), `rejection_reason`, `submitted_at`, `confirmed_by`, `confirmed_at`, `created_at`.

### `payment_confirmations`
`id`, `payment_id`, `admin_id`, `decision`, `note`, `created_at`.

### `teacher_wallets`
`teacher_id` (PK), `balance`, `total_earned`, `total_withdrawn`, `updated_at`.

### `wallet_transactions`
`id`, `teacher_id`, `type` (`earning|refund|withdrawal|adjustment`), `amount` (com sinal), `balance_after`, `booking_id`, `payout_id`, `description`, `created_at`.

### `withdrawal_requests`
`id`, `teacher_id`, `amount`, `method`, `number`, `status` (`pending|paid|rejected`), `reference`, `rejection_reason`, `requested_at`, `decided_by`, `decided_at`.

### `reviews`
`id`, `booking_id` (unique), `lesson_id`, `teacher_id`, `student_id`, `rating` (1–5, começa null), `comment`, `status` (`visible|hidden`), timestamps.

### `room_access`
`id`, `lesson_id`, `student_id`, `granted_by`, `granted_at`, único por aula+estudante.

### `conversations` / `messages`
Conversa entre estudante e professor, opcionalmente ligada a uma aula. Mensagens com remetente, corpo, data e leitura.

### `notifications`
`id`, `user_id`, `type`, `title`, `body`, `link`, `read_at`, `created_at`.

### `reports`
`id`, `reporter_id`, `target_type`, `target_id`, `target_name`, `reason`, `details`, `status` (`open|resolved`), `resolution_note`, `resolved_by`, `resolved_at`, `created_at`.

### `platform_settings`
Documento único (`id=1`): `commission`, `mpesa_number`, `emola_number`, `support_email`, `support_phone`, `announcement`, `updated_at`.

### `audit_logs`
`id`, `actor_id`, `actor_name`, `action`, `entity_type`, `entity_id`, `details` (JSON), `created_at`.

## 3. API

Todas as rotas são prefixadas por `/api`. Respostas de erro em JSON `{ error, issues? }`.

### Autenticação
| Método | Rota | Descrição |
|---|---|---|
| POST | `/auth/register` | Cria conta de estudante e envia/verifica email |
| POST | `/auth/login` | Inicia sessão |
| POST | `/auth/logout` | Termina sessão |
| GET | `/auth/me` | Utilizador atual, perfil e candidatura |
| POST | `/auth/forgot-password` | Pede reposição |
| POST | `/auth/reset-password` | Repõe palavra-passe |
| POST | `/auth/verify-email` | Confirma email |
| POST | `/auth/resend-verification` | Reenvia verificação |
| PATCH | `/auth/profile` | Edita nome, telefone, cidade, bio, avatar |
| POST | `/auth/change-password` | Altera palavra-passe |

### Catálogo público
| GET | `/settings` | Definições públicas e estado das integrações |
| GET | `/subjects` | Disciplinas activas |
| GET | `/levels` | Níveis activos |
| GET | `/teachers` | Professores aprovados com filtros |
| GET | `/teachers/:id` | Perfil, aulas, disponibilidade e avaliações |
| GET | `/lessons` | Aulas publicadas com filtros |
| GET | `/lessons/:id` | Detalhe, lugares, avaliações e definições de pagamento |

### Professor
| GET | `/teacher/application` | Candidatura e documentos |
| POST | `/teacher/application` | Submete/reenvia candidatura |
| GET | `/teacher/dashboard` | Aulas, reservas, carteira, avaliações |
| GET/POST | `/teacher/lessons` | Lista/cria aulas |
| PATCH | `/teacher/lessons/:id` | Edita aula |
| POST | `/teacher/lessons/:id/cancel` | Cancela aula e liberta pendentes |
| POST | `/teacher/lessons/:id/complete` | Conclui aula |
| GET | `/teacher/students` | Estudantes das aulas |
| GET/PUT | `/teacher/schedules` | Disponibilidade semanal |
| PATCH | `/teacher/profile` | Edita perfil público e fotografia |
| GET | `/teacher/wallet` | Carteira e movimentos |
| POST | `/teacher/wallet/withdrawals` | Pede levantamento |
| GET | `/teacher/reviews` | Avaliações recebidas |

### Estudante
| GET | `/student/bookings` | Reservas com estado e ações |
| GET | `/student/bookings/:id` | Detalhe com autorização |
| POST | `/student/lessons/:id/bookings` | Reserva (indivíduo/grupo) |
| POST | `/student/bookings/:id/payment` | Submete referência/comprovativo |
| POST | `/student/bookings/:id/cancel` | Cancela pendente |
| POST | `/student/reviews/:bookingId` | Avalia aula concluída |
| GET | `/student/reviews` | Avaliações dadas |
| POST | `/student/reports` | Denuncia professor/avaliação |
| GET | `/student/payments` | Histórico de pagamentos |
| GET | `/student/summary` | Estatísticas |
| GET | `/student/room-access/:lessonId` | Autorização e URL da sala |

### Mensagens e notificações
| GET | `/messages/conversations` | Conversas do utilizador |
| POST | `/messages/conversations` | Inicia conversa |
| GET | `/messages/conversations/:id` | Conversa e mensagens |
| POST | `/messages/conversations/:id/messages` | Envia mensagem |
| POST | `/messages/conversations/:id/read` | Marca como lida |
| GET | `/notifications` | Notificações e não lidas |
| POST | `/notifications/:id/read` | Marca uma como lida |
| POST | `/notifications/read-all` | Marca todas |

### Ficheiros
| POST | `/files` | Upload privado/público (5 MB, tipos permitidos) |
| GET | `/files/:id` | Download com autorização |

### Administração
| GET | `/admin/stats` | Estatísticas, receita, gráficos |
| GET | `/admin/applications` | Candidaturas |
| POST | `/admin/applications/:id/approve` | Aprova e cria perfil |
| POST | `/admin/applications/:id/reject` | Rejeita e despublica |
| GET | `/admin/payments` | Pagamentos |
| POST | `/admin/payments/:id/confirm` | Confirma com `attested` |
| POST | `/admin/payments/:id/reject` | Rejeita |
| POST | `/admin/payments/:id/refund` | Reembolsa e ajusta carteira |
| GET | `/admin/bookings` | Reservas |
| GET | `/admin/lessons` | Aulas |
| POST | `/admin/lessons/:id/cancel` | Cancela aula |
| POST | `/admin/lessons/:id/complete` | Conclui aula |
| GET | `/admin/users` | Utilizadores |
| POST | `/admin/users/:id/suspend` | Suspende |
| POST | `/admin/users/:id/reactivate` | Reactiva |
| GET | `/admin/withdrawals` | Levantamentos |
| POST | `/admin/withdrawals/:id/approve` | Aprova com referência |
| POST | `/admin/withdrawals/:id/reject` | Rejeita |
| GET | `/admin/reviews` | Avaliações |
| POST | `/admin/reviews/:id/hide` / `show` | Modera |
| GET | `/admin/reports` | Denúncias |
| POST | `/admin/reports/:id/resolve` | Resolve |
| GET/POST/PATCH | `/admin/subjects`, `/admin/levels` | Catálogo |
| GET/PATCH | `/admin/settings` | Definições |
| GET | `/admin/audit` | Auditoria |
| GET | `/admin/team` | Equipa |
| POST | `/admin/team/promote` / `demote` | Apenas proprietário |
| POST | `/admin/demo-seed` / `demo-clear` | Dados de demonstração |
| GET | `/admin/export/payments.csv` | Exportação |

## 4. Segurança

- **Autenticação:** scrypt, sessões com hash, cookie HttpOnly/SameSite=Lax/Secure em produção.
- **Autorização:** `requireAuth`, `requireRole`, `requireAdmin`, `requireOwner`; verificação de propriedade em reservas, pagamentos, aulas, conversas, ficheiros e avaliações.
- **Validação:** Zod em todos os corpos de entrada; SQL parametrizado.
- **Regras de negócio:** estado inicial pendente, confirmação manual com `attested`, idempotência (`WHERE status='pending'`), capacidade, conflito de horário, referência única, saldo de levantamento, avaliação elegível.
- **Ficheiros:** tipos permitidos, limite de 5 MB, autorização por dono/administração; documentos privados nunca são públicos.
- **Cabeçalhos:** helmet, `X-Content-Type-Options`, `Referrer-Policy`, etc.
- **Rate limiting:** 30/min em autenticação, 600/min na API.
- **Auditoria:** ações administrativas, aprovações, pagamentos, reembolsos, levantamentos, suspensões e decisões.
- **Sessões:** logout, alteração de palavra-passe e suspensão revogam sessões.
- **Proprietário:** `is_owner` não pode ser suspenso nem removido da administração.

## 5. Integrações

### M-Pesa / e-Mola
- Fluxo manual: instruções, referência, estado pendente, verificação no extracto, confirmação administrativa.
- A plataforma não simula pagamentos.
- Para automação: contrato de comerciante, credenciais oficiais, endpoint de callback/webhook, reconciliação e fallback manual.

### Jitsi / JaaS
- Por omissão: `https://meet.jit.si/educa-<room_code>` em iframe.
- O servidor só entrega o endereço a professor, administração ou estudante com reserva paga e `room_access`, dentro da janela.
- Limitação do Jitsi público: quem tem o link pode entrar.
- JaaS opcional: `JITSI_JAAS_DOMAIN`, `JITSI_JAAS_KID`, `JITSI_JAAS_PRIVATE_KEY`; o servidor assina um JWT RS256 com expiração de 2 horas.

### Email
- `RESEND_API_KEY` opcional. Sem chave, os links são devolvidos na API e mostrados no ecrã em desenvolvimento.
- Em produção, definir `EXPOSE_DEV_LINKS=false`.

## 6. Deploy

1. `npm install`
2. `npm run build`
3. Definir variáveis de ambiente.
4. `npm start` (ou `node server/index.js`).
5. Servir atrás de HTTPS com `COOKIE_SECURE=true`.
6. Fazer backup de `data/educa.sqlite`.
7. Para escalar: PostgreSQL + serviço de ficheiros + email transaccional + JaaS.

## 7. Limitações conhecidas

- SQLite é single-writer; para muitos utilizadores simultâneos, migrar para PostgreSQL.
- Ficheiros na base de dados aumentam o tamanho; para produção, usar storage externo.
- Notificações por polling, não push.
- Jitsi público sem autenticação real de participantes.
- Pagamentos manuais.
- Sem módulo de aula de demonstração com grelha nem preparação para exames.
