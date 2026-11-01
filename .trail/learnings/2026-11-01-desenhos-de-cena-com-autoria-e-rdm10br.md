---
title: desenhos de cena com autoria e visibilidade
author: Rdm10br
date: 2026-11-01
branch: master
id: l-b286b4b9
scope: repo
status: active
src: agent
touches:
  - apps/server/src/services/gameService.ts
  - packages/protocol/index.ts
---

Desenhos persistentes pertencem ao usuario criador e permitem alteracao pelo autor ou GM, enquanto medições privadas sao filtradas por destinatario ao montar SceneState porque um broadcast global vazaria conteudo privado; caso contrario usuarios poderiam alterar desenhos alheios ou ver medições nao compartilhadas.
