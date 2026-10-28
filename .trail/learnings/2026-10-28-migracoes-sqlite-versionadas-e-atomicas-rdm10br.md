---
title: migracoes SQLite versionadas e atomicas
author: Rdm10br
date: 2026-10-28
branch: master
id: l-05c821ba
scope: repo
status: active
src: agent
touches:
  - apps/server/src/db/migrations.ts
  - apps/server/src/db/schema.ts
  - apps/server/src/db/index.ts
---

A migracao de compatibilidade inicial deve ser registrada em schema_migrations e executada em transacao imediata porque DDL e backfills precisam ser atomicos; caso contrario uma falha intermediaria deixa o banco parcialmente alterado sem um marcador confiavel.
