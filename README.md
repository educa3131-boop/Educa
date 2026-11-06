# EDUCA — Reconstrução completa da plataforma

Plataforma moçambicana de aulas ao vivo que liga estudantes a professores, com candidatura e aprovação de professores, reservas, pagamento manual M-Pesa/e-Mola, salas de aula, carteira de professor, avaliações, mensagens, notificações e administração.

> **Estado:** aplicação funcional, com backend real, base de dados SQLite, autenticação, autorização por função, testes de integração e interface responsiva. As integrações automáticas de pagamento e de vídeo com token estão preparadas, mas dependem de credenciais externas que não estão incluídas.

## Começar em 3 passos

```bash
cd educa
npm install
npm run build
npm start
```

A aplicação fica em `http://localhost:3000`. O servidor serve o frontend compilado (`dist/`) e a API (`/api`) na mesma origem.

### Contas iniciais

| Perfil | Email | Palavra-passe |
|---|---|---|
| Administrador proprietário | `admin@educa.mz` | definida em `ADMIN_PASSWORD` ou gerada na primeira execução (ver log) |
| Professor de demonstração | `demo.professor@educa.mz` | `Demo@1234` (conta de demonstração) |
| Estudante de demonstração | `demo.estudante@educa.mz` | `Demo@1234` (conta de demonstração) |

> **Importante:** a palavra-passe do administrador **não está incluída no repositório**. Define `ADMIN_EMAIL` e `ADMIN_PASSWORD` no `.env` **antes da primeira execução**. Se `ADMIN_PASSWORD` ficar vazio, é gerada uma palavra-passe aleatória e mostrada no log. Altera-a no perfil antes de usar em produção. As contas de demonstração são criadas explicitamente pelo botão **Administração → Definições → Carregar dados de demonstração** e estão marcadas como demonstração na interface. Podem ser removidas com **Limpar dados de demonstração**.

## O que está implementado

### Estudante
- Registo, verificação de email, login, logout, recuperação de palavra-passe e alteração de palavra-passe.
- Edição de perfil, fotografia e dados pessoais.
- Pesquisa de aulas e professores por texto, disciplina, nível, preço máximo, formato e avaliação.
- Detalhe da aula, perfil do professor, disponibilidade, avaliações e denúncia.
- Reserva de aulas individuais e em grupo, com prevenção de reservas duplicadas e conflitos de horário.
- Introdução da referência M-Pesa/e-Mola, comprovativo opcional e cancelamento de reservas pendentes.
- Entrada na sala ao vivo apenas depois de pagamento confirmado e dentro da janela de acesso.
- Avaliação de 1 a 5 estrelas apenas para aulas concluídas, uma por reserva.
- Mensagens com professores, notificações e histórico de pagamentos.

### Professor
- Candidatura a professor com dados académicos e profissionais, disciplinas, níveis, preço e documentos privados.
- Acompanhamento do estado da candidatura (pendente, aprovado, rejeitado com motivo).
- Publicação, edição, cancelamento e conclusão de aulas.
- Criação automática de sala privada para cada aula.
- Gestão de estudantes, horários de disponibilidade e perfil público.
- Carteira com saldo disponível, ganhos, histórico de movimentos e pedidos de levantamento.
- Avaliações recebidas e conversas com estudantes.
- **Nenhum professor pode publicar aulas ou receber reservas antes da aprovação administrativa.**

### Administração
- Estatísticas, receita confirmada, comissões, gráfico mensal e receita por disciplina.
- Análise de candidaturas com documentos, aprovação/rejeição e despublicação de perfil em caso de rejeição.
- Confirmação manual de pagamentos com verificação obrigatória no extracto, comprovativo, nota interna e registo de quem confirmou.
- Rejeição de pagamentos e reembolsos com ajuste da carteira do professor.
- Gestão de aulas, reservas, utilizadores, suspensão/reactivação e equipa de administração.
- Aprovação/rejeição de levantamentos com referência da transferência.
- Moderação de avaliações, resolução de denúncias, envio de notificações e gestão de disciplinas/níveis.
- Definições de comissão, números M-Pesa/e-Mola, suporte, anúncio e estado das integrações.
- Registos de auditoria e exportação CSV de pagamentos.
- Dados de demonstração explícitos, com botão de carregamento e limpeza.

## Tecnologia

| Camada | Tecnologia |
|---|---|
| Frontend | React 18, React Router, Vite, CSS próprio (sem dependência de CDN) |
| Backend | Node.js, Express, API REST em `/api` |
| Base de dados | SQLite (`better-sqlite3`), com chaves estrangeiras, índices e transações |
| Autenticação | Sessões com token aleatório, hash SHA-256 no servidor, cookie HttpOnly |
| Palavras-passe | `scrypt` com salt |
| Validação | Zod no servidor |
| Ficheiros | Armazenamento em base de dados com autorização por proprietário/função |
| Vídeo | Jitsi público em iframe com autorização no servidor; preparado para JaaS com JWT |
| Email | Resend opcional; sem chave, os links de verificação/reposição são devolvidos para desenvolvimento |
| Testes | `node:test` + assertions para API; Playwright para interface |

## Estrutura

```
educa/
├── server/
│   ├── index.js          # Express, segurança, rotas, SPA
│   ├── db.js             # schema SQLite, seed, migrações
│   ├── auth.js           # sessões, cookies, middleware de função
│   ├── helpers.js        # regras de negócio, notificações, auditoria
│   ├── mailer.js         # email opcional (Resend)
│   ├── demo.js           # dados de demonstração explícitos
│   └── routes/           # auth, catálogo, professor, estudante, admin, mensagens, notificações, ficheiros
├── src/
│   ├── pages/            # Home, Lessons, LessonDetail, Teachers, TeacherProfile, TeacherLanding,
│   │                     # StudentPanel, TeacherPanel, AdminPanel, LiveRoom, AuthPages, etc.
│   ├── components/       # Layout, UI, Cards, PanelShell, MessagesView, NotificationsView, ProfileView
│   ├── context/          # AuthContext
│   ├── lib/              # API client, formatação
│   └── styles.css        # design system responsivo
├── tests/
│   ├── smoke.mjs         # 35 testes de integração API
│   └── ui-smoke.mjs      # 15 testes de interface com Playwright
├── docs/                 # inventário, arquitetura, plano e testes
├── data/educa.sqlite     # base de dados (criada na primeira execução)
└── dist/                 # build de produção
```

## Variáveis de ambiente

Copia `.env.example` para `.env`. O servidor carrega o `.env` automaticamente.

| Variável | Uso |
|---|---|
| `PORT` | Porta do servidor (por omissão 3000) |
| `APP_URL` | URL pública usada nos links de email |
| `DATA_DIR` | Diretório da base de dados SQLite |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Proprietário criado na primeira execução |
| `COOKIE_SECURE` | `true` em produção (HTTPS) |
| `EXPOSE_DEV_LINKS` | `true` apenas em desenvolvimento para mostrar links de verificação/reposição |
| `RESEND_API_KEY` / `MAIL_FROM` | Email transaccional opcional |
| `JITSI_JAAS_DOMAIN`, `JITSI_JAAS_KID`, `JITSI_JAAS_PRIVATE_KEY`, `JITSI_JAAS_ISS`, `JITSI_JAAS_SUB` | Salas JaaS com token assinado (opcional) |

Sem `RESEND_API_KEY`, a plataforma não envia emails reais. Os links de verificação e reposição são devolvidos na resposta da API e mostrados no ecrã quando `EXPOSE_DEV_LINKS=true`. Em produção, configura o Resend e desactiva `EXPOSE_DEV_LINKS`.

## Testes

```bash
# API: 35 cenários (registo, candidatura, aprovação, aula, reserva, pagamento,
# confirmação, carteira, sala, avaliação, mensagens, notificações, levantamento,
# denúncia, suspensão, moderação, exportação, reset de palavra-passe)
ADMIN_PASSWORD='<palavra-passe-do-admin>' node tests/smoke.mjs

# Interface: 15 cenários com Playwright (páginas públicas, login dos três painéis,
# tabs, definições, sala protegida, mobile sem overflow)
# Carrega primeiro os dados de demonstração em Administração → Definições.
ADMIN_PASSWORD='<palavra-passe-do-admin>' node tests/ui-smoke.mjs
```

Os testes de API correm contra `http://127.0.0.1:3000` e limpam as contas de teste no fim. O script recusa URLs que não sejam locais para não alterar um ambiente real.

## Segurança

- Palavras-passe com `scrypt` e salt; nunca são devolvidas pela API.
- Sessões com token de 32 bytes, guardado apenas como hash SHA-256; cookie `HttpOnly`, `SameSite=Lax` e `Secure` quando `COOKIE_SECURE=true`.
- Autorização no servidor em todas as rotas: `requireAuth`, `requireRole`, `requireAdmin`, `requireOwner` e verificação de propriedade.
- A função de administrador nunca é escolhida no registo público. Só o proprietário pode nomear/remover administradores.
- Regras de negócio no servidor: estado inicial pendente, confirmação de pagamento com `attested`, idempotência por `status='pending'`, capacidade, conflito de horário, duplicação de referência, saldo de levantamento, avaliação por reserva.
- SQL parametrizado, validação Zod, limites de tamanho de ficheiro e tipos permitidos.
- Ficheiros privados (documentos de candidatura, comprovativos) só são legíveis pelo dono ou pela administração. Fotografias públicas são marcadas como tal.
- Cabeçalhos de segurança, rate limiting em autenticação e API, e registos de auditoria.
- A interface não é a única barreira: todas as operações sensíveis são validadas no servidor.

## Limitações e integrações externas

- **Pagamentos M-Pesa/e-Mola:** confirmação manual pela equipa, por desenho. A plataforma não simula pagamentos. Para automação é necessário contrato de comerciante e credenciais oficiais das operadoras.
- **Vídeo:** usa Jitsi público em iframe. O acesso é verificado no servidor, mas o Jitsi público não impede que alguém com o link entre. Para salas com autenticação real, configura `JITSI_JAAS_*`; o código já gera o token JWT e usa o domínio JaaS quando as credenciais existem.
- **Email:** sem `RESEND_API_KEY`, os links são de demonstração. Não há envio real.
- **Notificações:** são guardadas na base de dados e actualizadas por polling (15–20 s), não por push. A estrutura permite adicionar push/SSE.
- **Dados de demonstração:** são explícitos, estão marcados como demonstração e podem ser removidos na administração. Não são usados para simular pagamentos reais.
- **Módulos futuros:** aula de demonstração com grelha de critérios, preparação para exames e pagamentos automáticos não fazem parte desta entrega. A documentação original identifica-os como pendências e não foram inventados como funcionalidades concluídas.

## Documentação

- [Inventário de páginas e funcionalidades](docs/INVENTARIO.md)
- [Arquitectura técnica e base de dados](docs/ARQUITECTURA.md)
- [Plano de execução e resultados de testes](docs/PLANO-E-TESTES.md)

## Licença

Projeto EDUCA. Uso interno e comercial conforme acordo com o proprietário da plataforma.
