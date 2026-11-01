---
title: gestao de participantes preserva um GM
author: Rdm10br
date: 2026-11-01
branch: master
id: l-7d9f7e05
scope: repo
status: active
src: agent
touches:
  - apps/server/src/handlers/sessionHandlers.ts
  - apps/server/src/db/membershipRepo.ts
  - apps/client/src/lobby/SessionInfo.tsx
---

A gestão de cargos e remoção é autorizada apenas ao GM e impede retirar ou rebaixar o último GM porque a sessão precisa manter um responsável; caso contrário ela ficaria sem autoridade para administração.
