---
title: cenas com localizacao persistente de players
author: Rdm10br
date: 2026-11-01
branch: master
id: l-d2e226eb
scope: repo
status: active
src: agent
touches:
  - apps/server/src/db/migrations.ts
  - apps/server/src/db/membershipRepo.ts
  - apps/server/src/handlers/sceneHandlers.ts
  - apps/server/src/services/sessionService.ts
---

A localização do player fica na membership e os viewers são limitados às cenas publicadas com players porque a divisão da party deve sobreviver a reconexões; caso contrário a mudança de cena perderia o grupo e poderia expor cenas sem jogadores.
