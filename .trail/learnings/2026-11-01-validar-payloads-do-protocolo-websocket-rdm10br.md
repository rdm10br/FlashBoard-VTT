---
title: validar payloads do protocolo WebSocket
author: Rdm10br
date: 2026-11-01
branch: master
id: l-05f25451
scope: repo
status: active
src: agent
touches:
  - apps/server/src/server.ts
  - apps/server/src/ws/dispatch.ts
  - apps/server/src/handlers/types.ts
  - packages/protocol/index.ts
---

O protocolo WebSocket só é validado em tempo de compilação porque o JSON recebido é convertido por type assertion e os handlers aceitam any; caso contrário payloads malformados dependem de validações inconsistentes em cada handler.
