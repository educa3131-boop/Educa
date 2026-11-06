# EDUCA — Inventário de páginas e funcionalidades

Este inventário foi construído a partir da documentação técnica fornecida, dos 14 screenshots (720×1612, mobile) e das regras de negócio descritas. A interface foi reconstruída com uma linguagem visual própria (creme quente, verde profundo, roxo e laranja), mantendo a estrutura funcional e os fluxos documentados.

## 1. Tipos de utilizador

| Perfil | Como obtém o papel | Pode |
|---|---|---|
| Visitante | Sem sessão | Ver página inicial, aulas, professores, perfis públicos e detalhes de aulas |
| Estudante | Registo público | Reservar, pagar, cancelar pendentes, entrar na sala após pagamento, avaliar, mensagens, denúncias |
| Professor | Candidatura aprovada pela administração | Publicar/editar/cancelar/concluir aulas, ver estudantes, carteira, levantamentos, avaliações, mensagens |
| Administrador | Proprietário inicial ou nomeação segura pelo proprietário | Candidaturas, pagamentos, reembolsos, aulas, reservas, utilizadores, levantamentos, avaliações, denúncias, catálogo, definições, auditoria, equipa |

O papel de administrador **nunca** é escolhido no registo. O registo cria sempre uma conta de estudante.

## 2. Mapa de navegação

```
Público
├── /                     Home
├── /aulas                Pesquisa e filtros de aulas
├── /aula/:id             Detalhe, reserva, pagamento, avaliação
├── /professores          Lista de professores
├── /professor/:id        Perfil público
├── /ensinar              Landing de candidatura
├── /login                Entrar
├── /registo              Criar conta
├── /esqueci-palavra-passe
├── /repor-palavra-passe
└── /verificar-email

Autenticado
├── /painel               Painel do estudante
├── /professor            Painel do professor / candidatura
├── /admin                Painel do administrador
├── /sala/:lessonId       Sala de aula ao vivo
├── /mensagens            Conversas
├── /notificacoes         Avisos
└── /perfil               Perfil e segurança
```

## 3. Páginas públicas

### `/` — Home
- Hero com pesquisa por texto e disciplina.
- Estatísticas reais: professores aprovados, aulas disponíveis e avaliação média.
- Grelha de 12 disciplinas.
- Próximas aulas publicadas (cards).
- Professores em destaque (ordenados por avaliação).
- Como funciona (3 passos).
- Bloco de captação de professores.
- Selo de confiança e pagamento M-Pesa/e-Mola.
- Estados vazios com chamada à ação quando não há dados.

### `/aulas` — Explorar aulas
- Pesquisa por texto.
- Filtros: disciplina, nível, formato, preço máximo.
- Ordenação: data, preço ascendente/descendente, melhor avaliados.
- Contagem de resultados.
- Grelha responsiva de `LessonCard`.
- Estado vazio e carregamento.

### `/aula/:id` — Detalhe da aula
- Cabeçalho com disciplina, nível, formato e estado.
- Descrição, data, hora, duração, lugares e preço.
- Cartão do professor com avaliação.
- O que está incluído.
- Detalhes e política de cancelamento.
- Avaliações do professor.
- Cartão de reserva sticky:
  - Reserva (modal com nome, telefone e método).
  - Introdução de referência M-Pesa/e-Mola (modal com comprovativo opcional).
  - Cancelamento de reserva pendente.
  - Entrada na sala quando autorizada.
  - Avaliação quando elegível.
- Denúncia do professor.
- Bloqueio de reserva para a própria aula, aulas cheias, conflitos de horário e reservas duplicadas.

### `/professores` — Professores
- Pesquisa e filtros por disciplina, nível, preço máximo e avaliação mínima.
- Cards com fotografia/iniciais, título, avaliação, disciplinas, cidade e preço.
- Ordenação por avaliação e número de avaliações.

### `/professor/:id` — Perfil público
- Cabeçalho com nome, título, cidade, preço, avaliação e estado de aprovação.
- Biografia, disciplinas e níveis.
- Aulas disponíveis.
- Disponibilidade semanal.
- Avaliações reais.
- Enviar mensagem (se autenticado).
- Denunciar perfil.
- Aviso de conta de demonstração quando aplicável.

### `/ensinar` — Candidatura a professor
- Explicação do processo, requisitos e comissão.
- Chamada para criar conta e candidatar-se.
- Aviso de que a aprovação é obrigatória.

### Autenticação
- `/login`: email, palavra-passe, mostrar/ocultar, sessão, erro.
- `/registo`: nome, email, telefone, palavra-passe, confirmação, termos.
- Verificação de email com link; em desenvolvimento, link de demonstração.
- `/esqueci-palavra-passe`: envio de link; resposta genérica por segurança.
- `/repor-palavra-passe`: nova palavra-passe e confirmação.
- `/verificar-email`: confirmação do token.

## 4. Painel do estudante (`/painel`)

Separador lateral e versão mobile em scroll horizontal.

| Separador | Conteúdo |
|---|---|
| Visão geral | Saudação, 4 cartões de estatísticas, próxima aula, reservas recentes |
| As minhas reservas | Lista completa com estado da reserva, pagamento, referência, ações |
| Pagamentos | Histórico de pagamentos, método, referência, valor, estado e data |
| Mensagens | Conversas com professores, histórico, envio e leitura |
| Notificações | Avisos com ação, marcação de lida e marcar todas |
| Perfil | Nome, telefone, cidade, bio, fotografia, segurança e verificação de email |

Ações:
- Introduzir referência de pagamento.
- Carregar comprovativo opcional.
- Cancelar reserva pendente.
- Entrar na sala quando `canJoin`.
- Avaliar professor quando `canReview`.
- Denunciar professor.
- Iniciar conversa com professor.

## 5. Painel do professor (`/professor`)

### Candidatura (antes da aprovação)
- Formulário com nome, título, bio, cidade, telefone privado, preço, disciplinas e níveis.
- Upload de documento de identificação, diploma e outro certificado.
- Estado pendente com cronologia e aviso de que não pode publicar antes da aprovação.
- Estado rejeitado com motivo e possibilidade de reenviar.
- Documentos privados, acessíveis apenas ao candidato e à administração.

### Painel (depois da aprovação)
| Separador | Conteúdo |
|---|---|
| Visão geral | Aulas publicadas, reservas, saldo, avaliação, próxima aula, reservas recentes, carteira |
| As minhas aulas | Lista, criação, edição, cancelamento, conclusão, estado e lugares |
| Estudantes | Nome, email, aula, data, valor, estado e mensagem |
| Carteira | Saldo disponível, total ganho, pendentes, movimentos e levantamentos |
| Avaliações | Média, número, comentários, aula e estudante |
| Mensagens | Conversas com estudantes |
| Notificações | Avisos |
| Horários | Disponibilidade semanal por dia e hora |
| Perfil público | Título, bio, cidade, preço, disciplinas, níveis e fotografia |

Regras:
- Aula individual tem 1 lugar; grupo entre 2 e 200.
- Data futura, duração 15–480 minutos, preço ≥ 0.
- Conflito de horário do professor é recusado.
- Aula com pagamentos confirmados não pode alterar preço, data, duração, lugares, formato, disciplina ou nível.
- Cancelamento liberta reservas pendentes e marca as pagas para reembolso.
- Conclusão permite avaliação.
- Levantamento verifica saldo disponível (ganhos − levantamentos pendentes).

## 6. Painel do administrador (`/admin`)

| Separador | Conteúdo |
|---|---|
| Visão geral | Utilizadores, receita, pagamentos pendentes, candidaturas, gráfico mensal, comissões, levantamentos, denúncias, receita por disciplina |
| Candidaturas | Filtros por estado, lista, detalhe com documentos, aprovar/rejeitar com motivo |
| Pagamentos | Filtros por estado, referência, estudante, professor, valor, confirmar com checkbox, rejeitar, reembolsar, exportar CSV |
| Aulas | Todas as aulas, professor, data, formato, lugares, preço, estado, cancelar/concluir |
| Reservas | Histórico completo com estudante, aula, professor, valor, estado e pagamento |
| Utilizadores | Pesquisa, filtros por função/estado, suspender, reactivar, promoção/remoção de administrador |
| Levantamentos | Aprovar com referência, rejeitar com motivo |
| Avaliações | Moderar, ocultar/mostrar |
| Denúncias | Resolver com nota |
| Disciplinas e níveis | Adicionar, activar/desactivar |
| Definições | Comissão, números M-Pesa/e-Mola, suporte, anúncio, estado das integrações, demo seed/clear, variáveis |
| Notificações | Envio de avisos a um utilizador ou a todos os utilizadores activos |
| Auditoria | Registos de ações administrativas |
| Equipa | Lista de administradores, nomeação/remoção apenas pelo proprietário |

## 7. Sala de aula (`/sala/:lessonId`)

- Verificação no servidor:
  - Professor da aula ou administrador: acesso.
  - Estudante: reserva paga, autorização de sala e aula publicada.
  - Estudante: dentro da janela de 30 minutos antes do início até ao fim.
- Iframe Jitsi com câmara, microfone, ecrã inteiro e partilha.
- Aviso claro sobre a limitação do Jitsi público.
- Aviso de token JaaS quando configurado.
- Professor/admin podem marcar a aula como concluída.
- Estudante pode avaliar no fim.

## 8. Componentes transversais

- Header com navegação desktop, dropdown de conta, notificações e mensagens.
- Bottom navigation mobile com Início, Aulas, Professores, Painel e Perfil.
- Footer com links, pagamentos e suporte.
- Design system: cards, badges, tabelas, modais, toasts, estados vazios, loading, formulários, radio cards, ficheiros.
- Responsividade testada a 390 px, 768 px, 1024 px e 1280 px.
- Modais de confirmação para ações destrutivas.
- Mensagens de erro e sucesso.
- Notificações com polling de 15–20 s.

## 9. Funcionalidades por módulo

| Módulo | Estado |
|---|---|
| Autenticação, verificação, recuperação, perfil | Implementado |
| Candidatura e aprovação de professor | Implementado |
| Documentos privados de professor | Implementado |
| Aulas, estados, capacidade, conflitos | Implementado |
| Reservas, duplicação, cancelamento | Implementado |
| Pagamentos manuais, referência, comprovativo | Implementado |
| Confirmação administrativa idempotente | Implementado |
| Reembolsos e ajuste de carteira | Implementado |
| Carteira, movimentos, levantamentos | Implementado |
| Avaliações, elegibilidade, média, ranking, moderação | Implementado |
| Mensagens e restrições de acesso | Implementado |
| Notificações por evento | Implementado (polling) |
| Denúncias e resolução | Implementado |
| Auditoria e exportação CSV | Implementado |
| Jitsi com autorização no servidor | Implementado (Jitsi público) |
| JaaS com token | Estrutura preparada; requer credenciais |
| M-Pesa/e-Mola automáticos | Estrutura preparada; requer contrato e credenciais |
| Email transaccional | Estrutura preparada; requer `RESEND_API_KEY` |
| Aula de demonstração com grelha | Não implementado (fora do âmbito desta entrega) |
| Preparação para exames | Não implementado (fora do âmbito desta entrega) |
