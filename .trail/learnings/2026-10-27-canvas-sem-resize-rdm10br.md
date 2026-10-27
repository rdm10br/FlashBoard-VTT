---
title: canvas-sem-resize
author: Rdm10br
date: 2026-10-27
branch: master
id: l-f62678ee
scope: repo
status: active
src: agent
touches:
  - apps/client/src/engine/app.ts
  - apps/client/src/engine/grid.ts
---

Nao adicionar resize ao canvas Pixi resolve porque app.ts/grid.ts fixam window.innerWidth no init sem listener de resize; caso contrario o grid fica cortado ao redimensionar a janela. Fix: chamar app.renderer.resize e grid.draw em window addEventListener resize.
