---
title: planejamento de arquitetura e features pos-1.0
author: Rdm10br
date: 2026-11-13
branch: master
id: l-9b7e41ac
scope: repo
status: active
src: agent
touches:
  - apps/client/src/App.tsx
  - apps/client/src/game/GameController.ts
  - apps/server/src/server.ts
  - packages/protocol/index.ts
---

Separacao de monorepo em orquestra, front, back e launcher, webhooks, temas e modding de canvas 3d devem ocorrer apenas pos-1.0 em estado jogavel estavel porque manter o nucleo 2d e monorepo atômico acelera a maturidade das regras de jogo; caso contrario mudancas de protocolo frequentes e complexidade grafica 3d dispersam o foco antes do sistema ser viavel e funcional.
