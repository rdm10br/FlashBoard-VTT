---
title: uploads sem quota e coleta de arquivos
author: Rdm10br
date: 2026-11-01
branch: master
id: l-7426c5db
scope: repo
status: active
src: agent
touches:
  - apps/server/src/http/assetRoutes.ts
  - apps/server/src/db/assetRepo.ts
  - apps/server/src/storage/uploads.ts
---

Os uploads podem se acumular sem limite por sessão porque a rota só grava arquivos e deleteAsset não tem callers; caso contrário o armazenamento hospedado pode crescer até esgotar o volume.
