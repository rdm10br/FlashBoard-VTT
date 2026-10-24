import assert from "node:assert/strict";
import { test } from "node:test";
import { executeRoll, formatBreakdown, parseRoll, type RollMode, type Rng } from "./dice";

const LIMITS = { maxDice: 100, maxSides: 100 };

// RNG determinístico: devolve os valores da lista, na ordem.
function seq(...values: number[]): Rng {
  let i = 0;
  return () => values[i++];
}

function parse(input: string, mode: RollMode = "normal") {
  const result = parseRoll(input, LIMITS, mode);
  if (!result.ok) throw new Error(result.error);
  return result.roll;
}

test("expressão simples sem espaços", () => {
  const roll = parse("1d20+5");
  assert.equal(roll.expression, "1d20+5");
  const out = executeRoll(roll, seq(14));
  assert.equal(out.total, 19);
  assert.equal(out.modifier, 5);
});

test("espaços ao redor do operador e rótulo livre", () => {
  const roll = parse("1d20 + 5 ataque com espada");
  assert.equal(roll.expression, "1d20+5");
  assert.equal(roll.label, "ataque com espada");
});

test("termo sem operador começa o rótulo", () => {
  const roll = parse("1d20 1d4");
  assert.equal(roll.expression, "1d20");
  assert.equal(roll.label, "1d4");
});

test("d20 sem quantidade vale 1d20", () => {
  assert.equal(parse("d20").expression, "1d20");
});

test("vários grupos e constantes com sinal", () => {
  const out = executeRoll(parse("2d6+1d4-3"), seq(3, 4, 2));
  assert.equal(out.total, 6);
  assert.equal(formatBreakdown(out), "[3, 4] + [2] - 3");
});

test("kh mantém os maiores", () => {
  const out = executeRoll(parse("4d6kh3"), seq(6, 2, 5, 3));
  assert.equal(out.total, 14);
  assert.equal(formatBreakdown(out), "[6, (2), 5, 3]");
});

test("vantagem e desvantagem", () => {
  const adv = executeRoll(parse("1d20+5", "adv"), seq(14, 9));
  assert.equal(adv.total, 19);
  assert.equal(formatBreakdown(adv), "[14, (9)] + 5");

  const dis = executeRoll(parse("1d20+5", "dis"), seq(14, 9));
  assert.equal(dis.total, 14);
  assert.equal(formatBreakdown(dis), "[(14), 9] + 5");
});

test("vantagem só vale para 1d20", () => {
  assert.equal(parseRoll("2d20", LIMITS, "adv").ok, false);
  assert.equal(parseRoll("1d6", LIMITS, "adv").ok, false);
});

test("respeita os limites da sessão", () => {
  assert.equal(parseRoll("101d6", LIMITS).ok, false);
  assert.equal(parseRoll("1d101", LIMITS).ok, false);
  assert.equal(parseRoll("60d6+60d6", LIMITS).ok, false);
});

test("rejeita entradas inválidas", () => {
  for (const input of ["abc", "5", "0d6", "1d0", "4d6kh5"]) {
    assert.equal(parseRoll(input, LIMITS).ok, false, input);
  }
});