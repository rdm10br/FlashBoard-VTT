---
title: plano de refatoracao de ui mui e migracao pos-1.0
author: Rdm10br
date: 2026-11-13
branch: master
id: l-3a819df4
scope: repo
status: active
src: agent
touches:
  - apps/client/src/App.tsx
  - apps/client/src/lobby/SessionInfo.tsx
  - packages/protocol/index.ts
---

Refatoracao de UI e separacao de repositorios devem aguardar a estabilizacao das regras de jogo e protocolo na versao 1.0 porque sincronizar contratos WebSocket entre multiplos repositorios atrasa o ciclo de desenvolvimento durante a fase jogavel; caso contrario alteracoes no protocolo exigem deploys cruzados e versionamento prematuro de pacotes.
