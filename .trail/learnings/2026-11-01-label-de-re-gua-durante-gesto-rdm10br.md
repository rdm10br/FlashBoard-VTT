---
title: Label de régua durante gesto
author: Rdm10br
date: 2026-11-01
branch: master
id: l-753e6f62
scope: repo
status: active
src: agent
touches:
  - apps/client/src/game/GameController.ts
---

A etiqueta da medição provisória usa o mesmo formatador da medição salva porque o preview precisa refletir a unidade e o snap da cena; caso contrário o valor muda só depois que a pessoa termina o gesto.
