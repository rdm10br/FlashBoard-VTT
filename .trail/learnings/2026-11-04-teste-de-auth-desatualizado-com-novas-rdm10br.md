---
title: teste de auth desatualizado com novas migracoes
author: Rdm10br
date: 2026-11-04
branch: master
id: l-b8eb89eb
scope: repo
status: active
src: agent
touches:
  - apps/server/src/services/authService.test.ts
  - apps/server/src/db/migrations.ts
---

authService.test.ts falha porque espera apenas a migracao 1 enquanto o banco agora aplica as migracoes 1 a 8; caso contrario a suite npm test falha em qualquer ambiente limpo.
