---
title: cobertura de permissoes de convites e cenas
author: Rdm10br
date: 2026-10-28
branch: master
id: l-c35f04af
scope: repo
status: active
src: agent
touches:
  - apps/server/src/services/authService.test.ts
  - apps/server/src/handlers/inviteHandlers.ts
  - apps/server/src/handlers/sceneHandlers.ts
---

Handlers de convites e controle de cenas exigem testes de jogador e GM na mesma sessao porque checar apenas recursos de outra sessao nao prova a regra de role; caso contrario regresoes de autorizacao dentro da sessao passam despercebidas.
