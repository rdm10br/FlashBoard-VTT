---
title: Shutdown percorre processo supervisor
author: Rdm10br
date: 2026-11-01
branch: master
id: l-f232a840
scope: repo
status: active
src: agent
touches:
  - package.json
  - scripts/host.mjs
  - apps/server/src/server.ts
---

O encerramento via painel termina o servidor e os supervisores padrão encerram seus filhos porque npm start e host mantêm processos auxiliares; caso contrário Vite ou túnel permaneceriam rodando após desligar a API.
