---
title: setas movem tokens por coordenadas de celula
author: Rdm10br
date: 2026-11-01
branch: master
id: l-8393f131
scope: repo
status: active
src: agent
touches:
  - apps/client/src/engine/grid.ts
  - apps/client/src/game/GameController.ts
---

A movimentacao por setas calcula o vizinho na coordenada axial do hexagono porque deslocamentos em pixels nao preservam uma celula em grids hexagonais; caso contrario jogadores podem pular celulas ou parar fora da malha.
