---
title: validar ClientMessage no limite WebSocket
author: Rdm10br
date: 2026-11-01
branch: master
id: l-92082535
scope: repo
status: active
src: agent
touches:
  - apps/server/src/server.ts
  - apps/server/src/ws/dispatch.ts
---

A validação de cada ClientMessage deve ocorrer após JSON.parse e antes do dispatch porque os tipos TypeScript desaparecem em runtime; caso contrário payloads inválidos dependem de verificações ad hoc nos handlers.
