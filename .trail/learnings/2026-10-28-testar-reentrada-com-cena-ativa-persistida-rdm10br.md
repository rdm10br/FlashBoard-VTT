---
title: testar reentrada com cena ativa persistida
author: Rdm10br
date: 2026-10-28
branch: master
id: l-434c607c
scope: repo
status: active
src: agent
touches:
  - apps/server/src/services/authService.test.ts
  - apps/server/src/handlers/sessionHandlers.ts
---

O teste de persistencia deve exercitar SESSION_ENTER e verificar SESSION_JOINED e SCENE_STATE porque testar apenas resolveActiveSceneId nao cobre a integracao do handler; caso contrario a reconexao pode ignorar o id salvo sem falhar nos testes.
