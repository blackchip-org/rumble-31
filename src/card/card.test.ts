import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCard, cardToString, rankValue } from "./card.ts";
import { newDeck } from "./deck.ts";
import type { Rank } from "./card.ts";

test("parseCard round-trips every card in the deck", () => {
  for (const c of newDeck()) {
    const got = parseCard(cardToString(c));
    assert.deepEqual(got, c);
  }
});

test("parseCard rejects invalid notation", () => {
  const cases: Record<string, string> = {
    "empty string": "",
    "too short": "7",
    "too long": "7hh",
    "lowercase rank": "th",
    "uppercase suit": "7H",
    "bad rank char": "1h",
    "bad suit char": "7x",
  };
  for (const [name, input] of Object.entries(cases)) {
    assert.throws(() => parseCard(input), name);
  }
});

test("rankValue matches specs/rules.md point values", () => {
  const cases: Array<[Rank, number]> = [
    ["7", 7],
    ["8", 8],
    ["9", 9],
    ["T", 10],
    ["J", 10],
    ["Q", 10],
    ["K", 10],
    ["A", 11],
  ];
  for (const [rank, want] of cases) {
    assert.equal(rankValue(rank), want, rank);
  }
});
