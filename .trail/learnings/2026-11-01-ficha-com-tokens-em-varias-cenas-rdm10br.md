---
title: Ficha com tokens em varias cenas
author: Rdm10br
date: 2026-11-01
branch: master
id: l-c7db68d6
scope: repo
status: active
src: agent
touches:
  - apps/server/src/db/migrations.ts
  - apps/server/src/db/tokenRepo.ts
  - apps/server/src/db/characterSheetRepo.ts
---

A ficha é a entidade persistente e os tokens são instâncias por cena porque owners e dados são compartilhados entre aparições; caso contrário a propriedade e os valores divergiriam entre mapas.
