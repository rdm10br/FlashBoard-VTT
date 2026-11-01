---
title: SESSION_JOINED precisa expor user id
author: Rdm10br
date: 2026-11-01
branch: master
id: l-274727e8
scope: repo
status: active
src: agent
touches:
  - apps/server/src/services/sessionService.ts
  - apps/client/src/game/GameController.ts
---

SESSION_JOINED deve enviar o ID do usuário porque ownership de tokens e fichas usa user IDs; caso contrário o cliente compara membership ID e rejeita o movimento permitido ao player.
