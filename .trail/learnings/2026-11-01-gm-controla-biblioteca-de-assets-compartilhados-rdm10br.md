---
title: GM controla biblioteca de assets compartilhados
author: Rdm10br
date: 2026-11-01
branch: master
id: l-8cfbe6b0
scope: repo
status: active
src: agent
touches:
  - apps/server/src/handlers/assetHandlers.ts
  - apps/server/src/db/schema.ts
---

A exclusão da biblioteca fica restrita ao GM porque a tabela de assets não registra quem fez cada upload; caso contrário não há dado confiável para autorizar remoção por proprietário.
