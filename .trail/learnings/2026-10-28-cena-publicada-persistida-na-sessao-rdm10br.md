---
title: cena publicada persistida na sessao
author: Rdm10br
date: 2026-10-28
branch: master
id: l-acd681c3
scope: repo
status: active
src: agent
touches:
  - apps/server/src/handlers/sceneHandlers.ts
  - apps/server/src/handlers/sessionHandlers.ts
  - apps/server/src/db/sessionRepo.ts
  - apps/server/src/services/authService.test.ts
---

SCENE_PUSH deve gravar active_scene_id e os fluxos de entrada devem ler esse campo porque a coluna e o setter ja existiam mas o mapa em memoria os ignorava; caso contrario reiniciar o servidor perde a ultima cena publicada.
