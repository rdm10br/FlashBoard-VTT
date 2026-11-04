---
title: box de rolagem colapsavel e alinhamento de vantagem
author: Rdm10br
date: 2026-11-04
branch: master
id: l-2bf019e5
scope: repo
status: active
src: agent
touches:
  - apps/client/src/lobby/panels/ChatPanel.tsx
  - apps/server/src/services/dice.ts
---

O box de rolagem colapsa os dados intermediarios e preserva o resultado em negrito enquanto a vantagem foca no termo 1d20 porque isso respeita a legibilidade do chat e as regras de d20; caso contrario o chat fica poluido e expressoes compostas com outros dados sofrem vantagem indevida.
