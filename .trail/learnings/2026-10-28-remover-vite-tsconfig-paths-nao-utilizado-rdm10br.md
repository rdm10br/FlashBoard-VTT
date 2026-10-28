---
title: remover vite-tsconfig-paths nao utilizado
author: Rdm10br
date: 2026-10-28
branch: master
id: l-2dd0abf4
scope: repo
status: active
src: agent
touches:
  - package.json
  - package-lock.json
  - apps/client/vite.config.ts
---

vite-tsconfig-paths deve sair das dependencias porque nenhuma configuracao o importa e seu tsconfck opcional procura TypeScript 5.x; caso contrario npm ci em outra versao do npm pode exigir typescript 5.9.3 ausente do lockfile.
