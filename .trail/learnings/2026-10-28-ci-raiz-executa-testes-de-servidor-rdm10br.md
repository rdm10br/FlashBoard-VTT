---
title: CI raiz executa testes de servidor e cliente
author: Rdm10br
date: 2026-10-28
branch: master
id: l-76577102
scope: repo
status: active
src: agent
touches:
  - package.json
  - ".github/workflows/ci.yml"
---

O workflow multiplataforma deve chamar o script raiz de testes porque ele agrega node:test do servidor e Vitest do cliente; caso contrário a suíte do cliente pode passar localmente sem bloquear integrações.
