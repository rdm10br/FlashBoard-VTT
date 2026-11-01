---
title: selecao filtra owners mas servidor autoriza movimento
author: Rdm10br
date: 2026-11-01
branch: master
id: l-1a04aefd
scope: repo
status: active
src: agent
touches:
  - apps/client/src/game/GameController.ts
  - apps/server/src/handlers/tokenHandlers.ts
  - apps/server/src/db/tokenRepo.ts
---

A selecao por caixa filtra tokens pelo owner enviado no estado da cena enquanto o handler TOKEN_MOVE continua validando a permissao porque a UI nao e uma fronteira de seguranca; caso contrario tokens alheios poderiam ser movidos por mensagens manipuladas.
