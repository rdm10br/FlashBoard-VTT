---
title: medicao com vertices validada no servidor
author: Rdm10br
date: 2026-11-01
branch: master
id: l-3794092a
scope: repo
status: active
src: agent
touches:
  - apps/client/src/game/GameController.ts
  - apps/server/src/handlers/drawingHandlers.ts
  - packages/protocol/validation.ts
---

A régua em curva envia uma sequência de vértices porque a distância precisa somar cada segmento; caso contrário o servidor rejeitaria qualquer medição com mais de dois pontos.
