---
title: autocomplete-chat-comandos-e-whisper
author: Rdm10br
date: 2026-11-07
branch: master
id: l-643feefa
scope: repo
status: active
src: agent
touches:
  - apps/client/src/lobby/panels/ChatPanel.tsx
  - apps/server/src/services/chatService.ts
---

Autocomplete de comandos e destinatários no chat suporta /w e /whisper sem aspas e encerra sugestão ao detectar o nickname seguido de espaço porque o backend consome o apelido cru diretamente dos argumentos; caso contrário o popup ficaria aberto atrapalhando a digitação da mensagem.
