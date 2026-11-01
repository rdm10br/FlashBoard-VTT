---
title: alinhar porta do host com túnel nomeado
author: Rdm10br
date: 2026-11-01
branch: master
id: l-4c9d37b5
scope: repo
status: active
src: agent
touches:
  - scripts/host.mjs
  - README.MD
---

O túnel nomeado usa a porta do serviço no config porque o listener e o upstream precisam coincidir; caso contrário a URL fixa não alcança o servidor.
