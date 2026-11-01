---
title: Saida de sessao e shutdown admin
author: Rdm10br
date: 2026-11-01
branch: master
id: l-8522fe0d
scope: repo
status: active
src: agent
touches:
  - apps/server/src/handlers/sessionHandlers.ts
  - apps/server/src/handlers/userHandlers.ts
  - apps/server/src/server.ts
---

Sair da sessão deve desregistrar a conexão sem encerrar autenticação e parar o servidor deve validar is_admin e fechar conexões auxiliares porque são operações diferentes; caso contrário sair do mapa desconecta a conta ou qualquer jogador pode derrubar o serviço.
