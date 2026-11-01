---
title: seleção em grupo e ctrl clique
author: Rdm10br
date: 2026-11-01
branch: master
id: l-c6b38295
scope: repo
status: active
src: agent
touches:
  - apps/client/src/game/GameController.ts
  - apps/client/src/game/tokenInteractions.ts
---

Arrastar um token já selecionado move o grupo e Ctrl/Cmd alterna membros porque o fluxo single-select colapsava a seleção ao pointerdown; caso contrário caixas de seleção múltipla não poderiam ser movidas de forma intuitiva.
