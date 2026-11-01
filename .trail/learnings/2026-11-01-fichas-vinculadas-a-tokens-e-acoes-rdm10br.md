---
title: fichas vinculadas a tokens e acoes declarativas
author: Rdm10br
date: 2026-11-01
branch: master
id: l-3e9b30ba
scope: repo
status: active
src: agent
touches:
  - apps/server/src/db/migrations.ts
---

Cada token tem uma ficha persistida e o template usa ações declarativas em iframe isolado porque HTML arbitrário não deve executar código no app; caso contrário macros poderiam escapar das permissões de GM e owners.
