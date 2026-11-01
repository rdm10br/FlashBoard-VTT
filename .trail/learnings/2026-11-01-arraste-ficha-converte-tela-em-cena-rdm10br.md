---
title: Arraste ficha converte tela em cena
author: Rdm10br
date: 2026-11-01
branch: master
id: l-cdd30ccd
scope: repo
status: active
src: agent
touches:
  - apps/client/src/game/GameController.ts
  - apps/server/src/handlers/tokenHandlers.ts
---

O drop sobre o canvas deve converter coordenadas do viewport para o container da cena e validar novamente o owner no servidor porque zoom e pan alteram o ponto visual; caso contrário o token nasce fora do cursor ou uma ficha alheia pode ser instanciada.
