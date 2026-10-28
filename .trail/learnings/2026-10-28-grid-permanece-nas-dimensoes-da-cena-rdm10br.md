---
title: grid permanece nas dimensoes da cena ao redimensionar
author: Rdm10br
date: 2026-10-28
branch: master
id: l-94459d5a
scope: repo
status: active
src: agent
touches:
  - apps/client/src/engine/grid.ts
  - apps/client/src/engine/app.ts
  - apps/client/src/game/GameController.ts
---

Grid.draw usa SceneConfig.width e height porque a malha representa limites fixos da cena; caso contrario redesenhar a cada resize de janela nao amplia a area da cena e pode recalcular milhares de segmentos hexagonais sem necessidade.
