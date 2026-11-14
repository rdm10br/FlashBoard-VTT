---
title: conexao de banco dinamica com proxy e ajuste de auth bootstrap em testes
author: Rdm10br
date: 2026-11-13
branch: master
id: l-7c42a8f1
scope: repo
status: active
src: agent
touches:
  - apps/server/src/db/connection.ts
  - apps/server/src/services/authService.ts
  - apps/server/src/services/authService.test.ts
---

db/connection.ts agora utiliza um Proxy dinâmico sobre a conexão do better-sqlite3 porque testes isolados alteram VTT_DATA_DIR e fecham conexões em cascata enquanto módulos ESM mantêm o singleton em cache; caso contrário testes individuais passam mas a suite all.test.ts falha com database connection is not open. Além disso, prepareAdminBootstrap() passa a retornar o token gerado para consumo em testes de autenticação.
