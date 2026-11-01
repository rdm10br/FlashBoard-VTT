---
title: Imagem pertence a ficha
author: Rdm10br
date: 2026-11-01
branch: master
id: l-9bbad535
scope: repo
status: active
src: agent
touches:
  - apps/server/src/db/migrations.ts
  - apps/server/src/db/tokenRepo.ts
  - apps/server/src/handlers/sheetHandlers.ts
  - apps/client/src/lobby/panels/SheetPanel.tsx
---

A imagem deve ser armazenada na ficha porque todas as instâncias em cenas representam o mesmo personagem e seus owners precisam alterá-la uma vez; caso contrário os tokens da mesma ficha podem exibir retratos diferentes.
