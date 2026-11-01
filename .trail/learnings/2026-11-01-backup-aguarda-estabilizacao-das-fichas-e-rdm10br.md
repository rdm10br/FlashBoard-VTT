---
title: backup aguarda estabilizacao das fichas e cenas
author: Rdm10br
date: 2026-11-01
branch: master
id: l-c1c062bd
scope: repo
status: active
src: agent
touches:
  - apps/server/src/db/backupRepo.ts
  - apps/server/src/db/migrations.ts
---

Exportação e restauração ainda não incluem template e dados de fichas nem localização individual dos players porque a estrutura de sessão segue em evolução e o backup foi explicitamente adiado; caso contrário uma restauração descartaria esses dados novos.
