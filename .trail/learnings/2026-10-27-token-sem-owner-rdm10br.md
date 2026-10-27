---
title: token-sem-owner
author: Rdm10br
date: 2026-10-27
branch: master
id: l-772e6ea5
scope: repo
status: active
src: agent
touches:
  - apps/server/src/handlers/tokenHandlers.ts
  - apps/server/src/db/schema.ts
---

Players podem mover e deletar qualquer token porque tokenHandlers.ts nao valida owner_user_id; o campo nao existe na tabela tokens do schema.ts. Sem essa checagem um jogador pode interferir nos tokens de outro. Fix: adicionar owner_user_id na tabela tokens e validar no handler.
