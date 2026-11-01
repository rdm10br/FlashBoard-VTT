---
title: grade de mapas exige calibracao explicita
author: Rdm10br
date: 2026-11-01
branch: master
id: l-a4c887f9
scope: repo
status: active
src: agent
touches:
  - apps/client/src/engine/grid.ts
  - apps/client/src/engine/sceneMapLayer.ts
  - apps/client/src/lobby/panels/MapPanel.tsx
---

Ajuste automatico da grade sobre mapa deve usar dois pontos marcados pelo mestre e uma distancia conhecida porque imagens comuns nao carregam escala ou alinhamento de celulas confiaveis; caso contrario inferir pela dimensao do bitmap produz grades desalinhadas.
