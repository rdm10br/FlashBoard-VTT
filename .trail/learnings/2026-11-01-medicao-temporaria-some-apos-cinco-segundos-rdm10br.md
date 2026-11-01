---
title: medicao temporaria some apos cinco segundos
author: Rdm10br
date: 2026-11-01
branch: master
id: l-a782d8db
scope: repo
status: active
src: agent
touches:
  - apps/server/src/handlers/drawingHandlers.ts
  - apps/client/src/lobby/panels/MapToolsPanel.tsx
---

Medições sem retenção expiram em cinco segundos porque o toggle manter no mapa deve controlar a persistência visual e a gravação por cena; caso contrário medições temporárias ficam acumuladas e confundem o tabuleiro.
