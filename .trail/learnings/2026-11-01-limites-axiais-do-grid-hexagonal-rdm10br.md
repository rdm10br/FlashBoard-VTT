---
title: Limites axiais do grid hexagonal
author: Rdm10br
date: 2026-11-01
branch: master
id: l-ece7c69e
scope: repo
status: active
src: agent
touches:
  - apps/client/src/engine/grid.ts
---

O desenho do hex usa limites por coordenada axial e extensão geométrica porque a projeção desloca linhas conforme q ou r; caso contrário o loop fixo deixa regiões da cena sem grade.
