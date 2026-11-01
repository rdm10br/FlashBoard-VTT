---
title: backup integral inclui banco e uploads
author: Rdm10br
date: 2026-11-01
branch: master
id: l-e0a560ae
scope: repo
status: active
src: agent
touches:
  - README.MD
  - apps/server/src/db/connection.ts
  - apps/server/src/storage/uploads.ts
  - apps/server/src/db/backupRepo.ts
---

A recuperação completa deve arquivar todo VTT_DATA_DIR porque o export JSON de sessão não preserva arquivos nem vínculos de mídia; caso contrário mapas e imagens podem faltar após restaurar.
