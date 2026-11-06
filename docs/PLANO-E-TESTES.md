# EDUCA — Plano de execução e testes

## 1. Fases de execução

| Fase | Âmbito | Estado |
|---|---|---|
| 1. Auditoria | Leitura integral da documentação, análise dos 14 screenshots, inventário de páginas, tipos de utilizador e fluxos | Concluída |
| 2. Arquitectura | SPA React + API Express + SQLite; schema relacional; autorização no servidor; modelo de ficheiros | Concluída |
| 3. Interface | Design system responsivo, layout, cards, tabelas, formulários, modais, estados vazios, loading, toasts | Concluída |
| 4. Backend | Autenticação, sessões, papéis, validação, SQL, transações, auditoria | Concluída |
| 5. Funcionalidades | Candidatura, aulas, reservas, pagamentos, carteira, salas, avaliações, mensagens, notificações | Concluída |
| 6. Administração | Estatísticas, candidaturas, pagamentos, reembolsos, utilizadores, levantamentos, moderação, catálogo, definições, auditoria, equipa | Concluída |
| 7. Integrações | Jitsi público, estrutura JaaS, email Resend opcional, estrutura M-Pesa/e-Mola | Preparada; automação requer credenciais |
| 8. Testes | 35 testes de API e 15 testes de interface; fluxos manuais | Concluída |
| 9. Produção | Build, variáveis, cookies seguros, exportação CSV, documentação, demo seed/clear | Preparada |

## 2. Inventário de execução

### Autenticação e acessos
- Registo de estudante, verificação de email, login e logout.
- Recuperação e reposição de palavra-passe.
- Edição de perfil, fotografia, telefone, cidade e bio.
- Três painéis independentes: `/painel`, `/professor`, `/admin`.
- Rotas protegidas no frontend e no backend.
- Proprietário inicial e nomeação segura de administradores.

### Professor
- Candidatura com documentos privados.
- Estados pendente/aprovado/rejeitado.
- Aprovação cria perfil público, papel de professor, disciplinas e níveis.
- Rejeição despublica perfil, remove papel e cancela aulas futuras.
- Aulas com todos os campos, estados, capacidade e sala privada.
- Edição limitada quando há pagamentos confirmados.
- Cancelamento e conclusão com notificações.
- Estudantes, horários, perfil público, carteira, levantamentos e avaliações.

### Estudante
- Pesquisa e filtros.
- Reserva com método, nome e telefone.
- Prevenção de duplicados, conflitos e lotação.
- Pagamento com referência e comprovativo opcional.
- Cancelamento de pendentes.
- Sala após confirmação.
- Avaliação elegível.
- Mensagens, notificações, denúncias e perfil.

### Administração
- Estatísticas e gráfico mensal.
- Receita por disciplina.
- Candidaturas com documentos.
- Pagamentos com confirmação atestada, rejeição e reembolso.
- Aulas, reservas, utilizadores, suspensão.
- Levantamentos com referência.
- Avaliações, denúncias, catálogo, definições.
- Auditoria, equipa, exportação CSV.
- Demo seed/clear.

## 3. Testes automatizados

### API — `tests/smoke.mjs` (35 cenários)
1. Health check.
2. Login do administrador.
3. Registo, verificação de email e login do estudante.
4. Registo e verificação do segundo estudante.
5. Registo e verificação do professor.
6. Estudante não pode aceder à API de administração.
7. Anónimo não pode aceder à administração.
8. Professor não pode publicar antes da aprovação.
9. Candidatura com documento privado.
10. Administração lista e aprova a candidatura.
11. Configuração de pagamentos e comissão.
12. Professor aprovado publica aulas.
13. Reserva e bloqueio de duplicados.
14. Submissão de referência.
15. Confirmação sem atestação é recusada; dupla confirmação é recusada.
16. Carteira creditada com líquido (425 = 500 − 15%).
17. Estudante obtém acesso à sala após pagamento.
18. Estudante não autorizado não entra.
19. Avaliação antes da conclusão é recusada.
20. Administração conclui aula; avaliação única.
21. Professor vê estudante, avaliação e mensagens; acesso de terceiro à conversa é recusado.
22. Notificações para estudante e professor; marcar todas como lidas.
23. Levantamento e aprovação administrativa; saldo atualizado.
24. Aula gratuita sem pagamento e acesso à sala.
25. Denúncia e resolução.
26. Suspensão e reactivação de conta.
27. Moderação de avaliação.
28. Cancelamento de aula e exportação CSV.
29. Estatísticas e auditoria.
30. Professor não pode aceder à administração.
31. Professor não pode reservar a própria aula.
32. Token de verificação inválido.
33. Reposição de palavra-passe.
34. Administração envia notificação a um estudante.
35. Restauro da configuração inicial.

**Resultado final:** 35 passed, 0 failed.

### Interface — `tests/ui-smoke.mjs` (15 cenários)
1. Home com hero e dados reais.
2. Página de aulas.
3. Página de professores.
4. Perfil de professor.
5. Página de login.
6. Login e painel do estudante.
7. Mensagens.
8. Notificações.
9. Perfil.
10. Login e painel do professor.
11. Login e painel do administrador.
12. Tabs de candidaturas e pagamentos.
13. Definições.
14. Sala protegida.
15. Home mobile sem overflow e com bottom navigation.

**Resultado final:** 15 passed, 0 failed. Erros de consola restantes são do iframe Jitsi em headless (sem câmara/microfone) e da política de `unload`, não da aplicação.

## 4. Cenários manuais recomendados

1. Registar um professor, submetê-lo e tentar publicar uma aula antes da aprovação.
2. Aprovar a candidatura e verificar o perfil público, disciplinas e níveis.
3. Publicar uma aula individual e uma em grupo.
4. Reservar a mesma aula duas vezes e verificar a recusa.
5. Reservar duas aulas sobrepostas e verificar o conflito.
6. Submeter uma referência e confirmar o pagamento no painel administrativo.
7. Verificar a carteira do professor, o histórico e o saldo.
8. Pedir um levantamento e aprová-lo na administração.
9. Entrar na sala depois da confirmação e verificar a recusa antes.
10. Concluir a aula e avaliar o professor.
11. Enviar mensagens nos dois sentidos e verificar a restrição de terceiros.
12. Suspender uma conta e tentar entrar.
13. Rejeitar uma candidatura e verificar a despublicação.
14. Reembolsar uma reserva paga e verificar o ajuste da carteira.
15. Exportar pagamentos em CSV.

## 5. Pendências e próximos passos

### Requerem credenciais externas
- **Pagamentos automáticos M-Pesa/e-Mola:** contrato de comerciante, credenciais, webhook e reconciliação.
- **JaaS:** conta 8x8, domínio, KID e chave privada para salas com token.
- **Email transaccional:** `RESEND_API_KEY` e domínio verificado.

### Melhorias de produto
- Módulo de aula de demonstração com grelha de 5 critérios.
- Preparação para exames.
- Notificações push/SSE em vez de polling.
- Exportação de relatórios por período e por professor.
- Migração para PostgreSQL e storage externo quando houver escala.
- Testes de carga e de concorrência com duas contas reais.
- Política de privacidade e conservação de dados.
- App móvel nativa, se necessário.

## 6. Conclusão

A plataforma está funcional no ciclo central:

```
candidatura → aprovação → perfil público → aula → reserva → pagamento manual →
confirmação administrativa → carteira → sala → avaliação
```

As funcionalidades obrigatórias foram implementadas e testadas. As integrações externas estão preparadas, mas não foram simuladas. As limitações estão documentadas na interface e na documentação.
