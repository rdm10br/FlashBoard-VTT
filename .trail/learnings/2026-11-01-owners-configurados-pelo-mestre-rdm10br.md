---
title: owners configurados pelo mestre
author: Rdm10br
date: 2026-11-01
branch: master
id: l-8495ead7
scope: repo
status: active
src: agent
touches:
  - apps/client/src/lobby/panels/TokenPanel.tsx
  - apps/server/src/handlers/tokenHandlers.ts
  - packages/protocol/index.ts
---

O mestre atribui owners jogadores da própria sessão aos tokens selecionados porque a autorização deve permanecer verificável no servidor; caso contrário um cliente poderia forjar permissão local.
