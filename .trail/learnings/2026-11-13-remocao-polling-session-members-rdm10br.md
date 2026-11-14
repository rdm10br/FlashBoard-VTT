---
title: remocao de polling de session members em favor de session presence
author: Rdm10br
date: 2026-11-13
branch: master
id: l-4f11a8bc
scope: repo
status: active
src: agent
touches:
  - apps/client/src/App.tsx
  - apps/client/src/lobby/SessionInfo.tsx
---

Polling de 10s de SESSION_MEMBERS_REQUEST foi removido em SessionInfo.tsx porque o servidor já emite SESSION_PRESENCE reativamente via WebSocket com a mesma lista de membros e status online; caso contrário o cliente gera tráfego e queries SQLite repetitivas desnecessárias.
