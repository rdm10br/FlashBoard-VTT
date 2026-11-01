---
title: ajuste do mapa e da cena e independente
author: Rdm10br
date: 2026-11-01
branch: master
id: l-23a1b173
scope: repo
status: active
src: agent
touches:
  - apps/client/src/lobby/panels/MapPanel.tsx
  - apps/client/src/engine/grid.ts
  - apps/client/src/engine/sceneMapLayer.ts
---

O upload escala a imagem para caber na janela e a cena mantém dimensões e grid configurados separadamente porque a escala visual não calibra a grade; caso contrário distâncias e movimento poderiam parecer corretos sem corresponder às unidades reais.
