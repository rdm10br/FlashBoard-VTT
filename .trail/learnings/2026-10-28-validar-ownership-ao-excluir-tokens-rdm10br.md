---
title: validar ownership ao excluir tokens
author: Rdm10br
date: 2026-10-28
branch: master
id: l-1da6271c
scope: repo
status: active
src: agent
touches:
  - apps/server/src/handlers/tokenHandlers.ts
  - apps/server/src/services/authService.test.ts
---

handleTokenDelete deve usar canActOnToken porque jogadores so podem apagar tokens proprios e GM pode apagar qualquer token da cena; caso contrario qualquer jogador da sessao pode remover tokens alheios.
