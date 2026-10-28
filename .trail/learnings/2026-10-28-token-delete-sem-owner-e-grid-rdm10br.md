---
title: token delete sem owner e grid resize incompleto
author: Rdm10br
date: 2026-10-28
branch: master
id: l-4a540dde
scope: repo
status: active
src: agent
touches:
  - apps/server/src/handlers/tokenHandlers.ts
  - apps/client/src/game/GameController.ts
  - apps/client/src/engine/grid.ts
---

TOKEN_DELETE nao chama canActOnToken porque o handler valida apenas sessao/cena; caso contrario um player pode excluir token de outro. O resize do GameController chama apenas pixiApp.resize porque nao redesenha o Grid; caso contrario o fundo fica desatualizado apos redimensionar a janela.
