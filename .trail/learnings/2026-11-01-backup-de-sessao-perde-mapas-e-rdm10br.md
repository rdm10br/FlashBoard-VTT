---
title: backup de sessao perde mapas e imagens
author: Rdm10br
date: 2026-11-01
branch: master
id: l-656b436a
scope: repo
status: active
src: agent
touches:
  - apps/server/src/db/backupRepo.ts
  - apps/server/src/db/types.ts
  - apps/server/src/services/backupValidation.ts
---

O export JSON não persiste mapas nem associações de imagens porque getSessionBackup serializa apenas metadados básicos de cena e coordenadas dos tokens; caso contrário uma importação parece completa mas perde partes do tabuleiro.
