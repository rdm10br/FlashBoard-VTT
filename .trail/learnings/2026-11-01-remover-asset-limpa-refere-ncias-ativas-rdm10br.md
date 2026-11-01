---
title: remover asset limpa referências ativas
author: Rdm10br
date: 2026-11-01
branch: master
id: l-64666b2f
scope: repo
status: active
src: agent
touches:
  - apps/server/src/db/assetRepo.ts
  - apps/server/src/handlers/assetHandlers.ts
  - apps/client/src/engine/tokenManager.ts
  - apps/client/src/game/GameController.ts
---

Excluir um asset deve limpar referências de tokens, mapas e imagem padrão e notificar clientes porque chaves estrangeiras definem esses vínculos como nulos; caso contrário o tabuleiro continua apontando para uma mídia removida.
