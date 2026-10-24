import { randomInt } from "node:crypto";

export type RollMode = "normal" | "adv" | "dis";
export type DiceLimits = { maxDice: number; maxSides: number };
/** Devolve um inteiro de 1 a `sides`. Injetável para testes. */
export type Rng = (sides: number) => number;

type KeepRule = { mode: "kh" | "kl"; n: number };
type DiceTerm = { kind: "dice"; sign: 1 | -1; count: number; sides: number; keep?: KeepRule };
type ConstTerm = { kind: "const"; sign: 1 | -1; value: number };
type Term = DiceTerm | ConstTerm;

export type ParsedRoll = {
  /** Forma normalizada do que a pessoa digitou, ex.: "2d6+1d4-3". */
  expression: string;
  /** Termos prontos para executar (vantagem/desvantagem já aplicadas). */
  terms: Term[];
  /** Texto livre depois da expressão, ex.: "ataque com espada". */
  label: string;
};

export type ParseResult = { ok: true; roll: ParsedRoll } | { ok: false; error: string };

export type TermResult =
  | { kind: "dice"; sign: 1 | -1; rolls: number[]; kept: boolean[]; subtotal: number }
  | { kind: "const"; sign: 1 | -1; value: number };

export type RollResult = {
  total: number;
  /** Soma das constantes, com sinal. */
  modifier: number;
  /** Todos os valores sorteados, na ordem (inclui os descartados). */
  results: number[];
  terms: TermResult[];
};

const MAX_TERMS = 20;
const MAX_CONSTANT = 1_000_000;
const MAX_LABEL = 50;

// [sinal] (NdM[kh|klK] | constante). Flag "y" (sticky): casa exatamente em lastIndex.
// O lookahead impede casar "1d20x" ou "5abc" como se fossem expressão.
const TERM_RE = /\s*([+-])?\s*(?:(\d*)d(\d+)(?:(kh|kl)(\d*))?|(\d+))(?!\w)/iy;

const fail = (error: string): ParseResult => ({ ok: false, error });

const defaultRng: Rng = (sides) => randomInt(1, sides + 1);

function formatExpression(terms: Term[]): string {
  return terms
    .map((term, index) => {
      const body =
        term.kind === "dice"
          ? `${term.count}d${term.sides}${term.keep ? `${term.keep.mode}${term.keep.n}` : ""}`
          : String(term.value);
      if (index === 0) return term.sign < 0 ? `-${body}` : body;
      return `${term.sign < 0 ? "-" : "+"}${body}`;
    })
    .join("");
}

export function parseRoll(input: string, limits: DiceLimits, mode: RollMode = "normal"): ParseResult {
  const terms: Term[] = [];
  let pos = 0;

  while (pos < input.length) {
    TERM_RE.lastIndex = pos;
    const m = TERM_RE.exec(input);
    if (!m) break;

    // Depois do primeiro termo só continua com operador explícito; sem operador,
    // o resto do texto é o rótulo ("1d20 +5 ataque").
    if (terms.length > 0 && m[1] === undefined) break;
    if (terms.length >= MAX_TERMS) return fail(`Use no máximo ${MAX_TERMS} termos por rolagem.`);

    const sign: 1 | -1 = m[1] === "-" ? -1 : 1;

    if (m[6] !== undefined) {
      const value = Number(m[6]);
      if (value > MAX_CONSTANT) return fail("Modificador grande demais.");
      terms.push({ kind: "const", sign, value });
    } else {
      const count = m[2] === "" ? 1 : Number(m[2]);
      const sides = Number(m[3]);
      if (count < 1) return fail("A quantidade de dados deve ser ao menos 1.");
      if (sides < 1) return fail("Os dados precisam ter ao menos 1 face.");
      if (count > limits.maxDice) {
        return fail(`Limite excedido: a sessão permite no máximo ${limits.maxDice} dados por rolagem.`);
      }
      if (sides > limits.maxSides) {
        return fail(`Limite excedido: a sessão permite dados com no máximo ${limits.maxSides} faces.`);
      }

      let keep: KeepRule | undefined;
      if (m[4] !== undefined) {
        const keepMode = m[4].toLowerCase() === "kh" ? "kh" : "kl";
        const n = m[5] === "" ? 1 : Number(m[5]);
        if (n < 1 || n > count) return fail(`Em ${keepMode}, mantenha entre 1 e ${count} dados.`);
        keep = { mode: keepMode, n };
      }
      terms.push({ kind: "dice", sign, count, sides, keep });
    }
    pos = TERM_RE.lastIndex;
  }

  if (!terms.some((t) => t.kind === "dice")) {
    return fail("Expressão inválida. Exemplos: /roll 1d20+5, /roll 2d6 + 3 dano, /roll 4d6kh3");
  }

  const label = input.slice(pos).trim();
  if (label.length > MAX_LABEL) return fail(`O rótulo da rolagem deve ter até ${MAX_LABEL} caracteres.`);

  const expression = formatExpression(terms);

  // Vantagem/desvantagem: o primeiro d20 vira "2d20 mantendo o maior/menor".
  let execTerms = terms;
  if (mode !== "normal") {
    const first = terms.find((t): t is DiceTerm => t.kind === "dice");
    if (!first || first.count !== 1 || first.sides !== 20 || first.sign !== 1 || first.keep) {
      return fail("Vantagem e desvantagem só valem para 1d20 (ex.: /adv 1d20+5).");
    }
    const keep: KeepRule = { mode: mode === "adv" ? "kh" : "kl", n: 1 };
    execTerms = terms.map((t): Term => (t === first ? { ...first, count: 2, keep } : t));
  }

  const totalDice = execTerms.reduce((sum, t) => (t.kind === "dice" ? sum + t.count : sum), 0);
  if (totalDice > limits.maxDice) {
    return fail(`Limite excedido: a sessão permite no máximo ${limits.maxDice} dados por rolagem.`);
  }

  return { ok: true, roll: { expression, terms: execTerms, label } };
}

export function executeRoll(roll: ParsedRoll, rng: Rng = defaultRng): RollResult {
  const terms: TermResult[] = [];
  const results: number[] = [];
  let total = 0;
  let modifier = 0;

  for (const term of roll.terms) {
    if (term.kind === "const") {
      terms.push({ kind: "const", sign: term.sign, value: term.value });
      modifier += term.sign * term.value;
      total += term.sign * term.value;
      continue;
    }

    const rolls = Array.from({ length: term.count }, () => rng(term.sides));
    const kept = rolls.map(() => true);
    if (term.keep) {
      const { mode, n } = term.keep;
      const order = rolls.map((_, i) => i).sort((a, b) => {
        const diff = mode === "kh" ? rolls[b] - rolls[a] : rolls[a] - rolls[b];
        return diff !== 0 ? diff : a - b;
      });
      kept.fill(false);
      for (const i of order.slice(0, n)) kept[i] = true;
    }

    const subtotal = rolls.reduce((sum, v, i) => (kept[i] ? sum + v : sum), 0);
    terms.push({ kind: "dice", sign: term.sign, rolls, kept, subtotal });
    results.push(...rolls);
    total += term.sign * subtotal;
  }

  return { total, modifier, results, terms };
}

/** "[3, 4] + [2] - 3". Valores entre parênteses foram descartados (kh/kl, vantagem). */
export function formatBreakdown(result: RollResult): string {
  return result.terms
    .map((term, index) => {
      const body =
        term.kind === "dice"
          ? `[${term.rolls.map((v, i) => (term.kept[i] ? String(v) : `(${v})`)).join(", ")}]`
          : String(term.value);
      if (index === 0) return term.sign < 0 ? `-${body}` : body;
      return `${term.sign < 0 ? "-" : "+"} ${body}`;
    })
    .join(" ");
}