---
title: fixar Windows CI em runner com VS reconhecido
author: Rdm10br
date: 2026-10-28
branch: master
id: l-339561e8
scope: repo
status: active
src: agent
touches:
  - ".github/workflows/ci.yml"
---

O job Windows deve usar windows-2022 porque node-gyp 11.5 nao reconhece a instalacao Visual Studio 18 fornecida por windows-latest; caso contrario compilacoes nativas de dependencias falham antes dos testes.
