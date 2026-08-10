import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCard, cardToString, cardConsole, rankValue } from "./card.ts";
import { newDeck } from "./deck.ts";
import type { Rank, Suit } from "./card.ts";

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

test("cardConsole renders each suit's glyph and color", () => {
  const cases: Array<{ suit: Suit; wantGlyph: string; wantFG: string }> = [
    { suit: "s", wantGlyph: "♠", wantFG: "30" },
    { suit: "h", wantGlyph: "♥", wantFG: "31" },
    { suit: "d", wantGlyph: "♦", wantFG: "32" },
    { suit: "c", wantGlyph: "♣", wantFG: "34" },
  ];
  for (const { suit, wantGlyph, wantFG } of cases) {
    const got = cardConsole({ rank: "7", suit });
    const want = `\x1b[47;${wantFG}m 7${wantGlyph}  \x1b[0m`;
    assert.equal(got, want, suit);
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
