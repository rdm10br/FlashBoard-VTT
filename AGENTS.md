<!-- trail:start -->
## Trail — repo context graph

This repo is indexed in `.trail/cache/`: small linked markdown nodes that explain each
system and carry exact file:line spans, kept in sync with the code through git.

For ANY task here — understanding how something works, finding where code lives,
or scoping a change — get context from the graph before grepping or opening
source files. Re-ask freely (it's cheap) and reuse literal identifiers you
already have (symbol, error string, file name) as the query. New to this repo?
Run `trail map` first — a token-budgeted orientation (dir clusters, hubs,
hotspots), no LLM, no key.

- Run `trail ask "<your question>" --source` → ranked nodes with the relevant
  code spans inlined (each hit's ≤8-line crux by default; `--full` for whole
  definitions when the crux isn't enough). Match the tool to the task shape:
  for understanding or editing, the top node IS the answer — cite its
  `covers:` file:line spans and edit straight from `--source`. For
  exhaustive tasks ("every occurrence / every caller of this pattern"), ranked
  results are top-N, not complete — run `trail grep "<literal>"` instead
  (exhaustive over indexed files, grouped by enclosing symbol), falling back
  to raw `grep -rn` only for unindexed files.
- `trail skeleton <file>` → every definition's signature + span, ~10× cheaper
  than reading the file; use it to skim an API surface.
- `trail callers <symbol>` gives precomputed, exact edges — who calls this.
  Add `--direction out` for what it calls, or `--depth N` to walk
  transitively for the full blast radius. For structural questions, skip
  ranking and use this directly.
- Or browse: `.trail/cache/INDEX.md` lists every node; follow the links.
- Monorepos and folders of multiple repos rank fairly across sub-projects —
  hits carry `[scope/]` labels naming which one they're from. Narrow with
  `trail ask "<task>" --in <scope>/` once you know where you're working.

If a returned span is truncated ("+N more lines"), open the file at that exact
range before finalizing. Only open source files when a node genuinely lacks a
needed detail, and then at the exact file:line the node points to — never
re-read whole files.

- Check `.trail/learnings/` before exploring: past sessions leave decisions, ruled-out approaches, and architectural findings there.
- When this session works out a fix, architecture decision, or non-obvious solution, record it with `trail note` so teammates and other agents share the learning.

After big code changes, refresh the graph with `trail build` (deterministic,
no API key, $0).
<!-- trail:end -->

## Regra Obrigatória: Salvar Learnings ao Final de Toda Sessão

**Ao terminar qualquer tarefa não-trivial (análise, correção de bug, nova feature, decisão de arquitetura), você DEVE:**

1. Chamar `trail note` para cada decisão ou problema não-óbvio encontrado:
   ```bash
   trail note --title "<tema-curto>" \
     -m "<o que foi descoberto, porque é assim, o que falha se ignorado>" \
     --touches "<arquivo1.ts,arquivo2.ts>" \
     --anyway
   ```
2. O corpo (`-m`) deve seguir o formato: `"X porque Y; caso contrário Z."`
3. Após salvar, commitar os learnings junto com as mudanças:
   ```bash
   git add .trail/learnings/
   git commit -m "docs(trail): learnings de <tarefa>"
   ```

**Tópicos que sempre merecem um learning:**
- Bugs encontrados mas não corrigidos nesta sessão
- Decisões de arquitetura tomadas e por quê
- Abordagens tentadas e descartadas (e por quê falharam)
- Padrões não-óbvios que outros devs precisam saber

