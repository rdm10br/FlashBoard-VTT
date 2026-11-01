---
title: camera local com pan e zoom
author: Rdm10br
date: 2026-11-01
branch: master
id: l-ebfe7aa0
scope: repo
status: active
src: agent
touches:
  - apps/client/src/engine/app.ts
  - apps/client/src/game/GameController.ts
---

Mapa, grade e tokens compartilham um container de mundo com transformacao local por jogador porque as coordenadas da cena devem permanecer independentes da viewport; caso contrario pan e zoom alteram posicoes persistidas ou divergem entre clientes.
