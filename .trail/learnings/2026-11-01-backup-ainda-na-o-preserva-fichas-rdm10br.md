---
title: Backup ainda não preserva fichas
author: Rdm10br
date: 2026-11-01
branch: master
id: l-e152b21a
scope: repo
status: active
src: agent
touches:
  - apps/server/src/db/backupRepo.ts
  - apps/server/src/db/tokenRepo.ts
---

O backup atual exporta tokens sem identidade de ficha e a importação cria uma ficha nova por token porque essa área foi adiada; caso contrário cópias de sessão perdem valores, owners e a relação de várias cenas da ficha.
