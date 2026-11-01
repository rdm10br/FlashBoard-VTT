---
title: ownership multiplo de tokens
author: Rdm10br
date: 2026-11-01
branch: master
id: l-18293ec5
scope: repo
status: active
src: agent
touches:
  - apps/server/src/db/migrations.ts
  - apps/server/src/db/tokenRepo.ts
  - apps/server/src/handlers/tokenHandlers.ts
---

Owners de token usam relação muitos-para-muitos com migração dos owners legados porque um token pode pertencer a vários jogadores; caso contrário a autorização e a gestão por ficha continuariam limitadas a uma pessoa.
