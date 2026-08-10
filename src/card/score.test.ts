import { test } from "node:test";
import assert from "node:assert/strict";
import { score, sum, sameSuit } from "./score.ts";
import { parseCard } from "./card.ts";
import type { Card } from "./card.ts";

function hand(...notation: [string, string, string]): [Card, Card, Card] {
  return [parseCard(notation[0]), parseCard(notation[1]), parseCard(notation[2])];
}

test("score matches specs/rules.md examples and edge cases", () => {
  const cases: Array<{ name: string; cards: [string, string, string]; want: number }> = [
    { name: "suit beats lone ace", cards: ["7h", "Ad", "Kh"], want: 17 },
    { name: "three different suits picks max lone card", cards: ["7h", "Ad", "Kc"], want: 11 },
    { name: "three of a kind non-ace", cards: ["7h", "7d", "7c"], want: 30.5 },
    { name: "three aces", cards: ["Ah", "Ad", "Ac"], want: 32 },
    { name: "three of a kind face rank", cards: ["Th", "Td", "Tc"], want: 30.5 },
    { name: "two aces different suits plus suited card", cards: ["Ah", "7h", "Ad"], want: 18 },
    { name: "two aces three different suits", cards: ["Ah", "Ad", "7c"], want: 11 },
    { name: "pair does not trigger three-of-a-kind rule", cards: ["7h", "7d", "Kc"], want: 10 },
    { name: "tie across suits picks max not sum", cards: ["Th", "Td", "9c"], want: 10 },
    { name: "single suit sum", cards: ["7h", "8h", "9h"], want: 24 },
  ];
  for (const { name, cards, want } of cases) {
    assert.equal(score(hand(...cards)), want, name);
  }
});

test("score is independent of card order", () => {
  const base = hand("7h", "Ad", "Kh");
  const want = score(base);
  const perms = [
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0],
  ] as const;
  for (const [i, j, k] of perms) {
    const permuted: [Card, Card, Card] = [
      base[i] as Card,
      base[j] as Card,
      base[k] as Card,
    ];
    assert.equal(score(permuted), want);
  }
});

test("sum adds point values", () => {
  assert.equal(sum(hand("7h", "Ad", "Kh")), 28);
});

test("sameSuit", () => {
  assert.equal(sameSuit(hand("7h", "8h", "9h")), true);
  assert.equal(sameSuit(hand("7h", "8d", "9h")), false);
});
