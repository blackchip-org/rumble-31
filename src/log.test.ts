import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCard } from "./card/card.ts";
import type { Card } from "./card/card.ts";
import { Game } from "./game/game.ts";
import type { RoundOutcome } from "./game/game.ts";
import type { Hand, Pot, TurnRecord } from "./game/types.ts";
import { gameEndLines, gameStartLines, roundRecapLines, roundStartLines, turnLines, turnStartLine } from "./log.ts";

function mustHand(...notation: [string, string, string]): Hand {
  return [parseCard(notation[0]), parseCard(notation[1]), parseCard(notation[2])];
}
function mustPot(...notation: [string, string, string]): Pot {
  return mustHand(...notation);
}

test("gameStartLines", () => {
  assert.deepEqual(gameStartLines(42, "0.0"), ["Welcome to Rumble 31, v0.0", "Starting game with seed 42"]);
});

test("roundStartLines", () => {
  const pot = mustPot("7h", "8c", "9d");
  const southHand = mustHand("7h", "8c", "9d");
  const cases: Array<{ name: string; southHand: Hand | undefined; firstSeat: number; want: string[] }> = [
    {
      name: "South is dealt in and acts first: pot shown",
      southHand,
      firstSeat: 0,
      want: ["", "=== Round 1 ===", "Pot is dealt [7h 8c 9d]", "South is dealt [7h 8c 9d]"],
    },
    {
      name: "South already eliminated, so not dealt a hand",
      southHand: undefined,
      firstSeat: 0,
      want: ["", "=== Round 1 ===", "Pot is dealt [7h 8c 9d]"],
    },
    {
      name: "South is dealt in but does not act first: pot private",
      southHand,
      firstSeat: 1,
      want: ["", "=== Round 1 ===", "Pot is dealt", "South is dealt [7h 8c 9d]"],
    },
  ];
  for (const c of cases) {
    assert.deepEqual(roundStartLines(1, pot, c.southHand, c.firstSeat), c.want, c.name);
  }
});

test("turnStartLine", () => {
  assert.equal(turnStartLine(0, false), "South's turn");
  assert.equal(turnStartLine(2, false), "North's turn");
  assert.equal(turnStartLine(0, true), "South goes first");
  assert.equal(turnStartLine(3, true), "East goes first");
});

test("turnLines", () => {
  const base = {
    turnIndex: 0,
    seat: 0,
    handAfter: mustHand("7h", "8c", "9d"),
    potAfter: mustPot("7h", "8c", "9d"),
    scoreAfter: 0,
  };
  const cases: Array<{ name: string; rec: TurnRecord; want: string[] }> = [
    {
      name: "trade names the specific cards swapped",
      rec: {
        ...base,
        turnIndex: 1,
        action: { type: "trade", potIndex: 0, handIndex: 0 },
        handBefore: mustHand("7h", "8c", "9d"),
        potBefore: mustPot("8d", "Ah", "Kc"),
        potAfter: mustPot("7h", "Ah", "Kc"),
      },
      want: ["South trades [7h] for [8d]", "Pot is [7h Ah Kc]"],
    },
    {
      name: "exchange after the first turn names the whole hand and pot",
      rec: {
        ...base,
        turnIndex: 1,
        action: { type: "exchange", potIndex: 0, handIndex: 0 },
        handBefore: mustHand("7h", "8s", "9d"),
        potBefore: mustPot("Th", "Js", "Qd"),
        potAfter: mustPot("7h", "8s", "9d"),
      },
      want: ["South exchanges [7h 8s 9d] for [Th Js Qd]", "Pot is [7h 8s 9d]"],
    },
    {
      name: "exchange on the round's first turn (Take Pot) names no cards",
      rec: {
        ...base,
        turnIndex: 0,
        action: { type: "exchange", potIndex: 0, handIndex: 0 },
        handBefore: mustHand("7h", "8s", "9d"),
        potBefore: mustPot("Th", "Js", "Qd"),
        potAfter: mustPot("7h", "8s", "9d"),
      },
      want: ["South exchanges their hand for the pot", "Pot is [7h 8s 9d]"],
    },
    {
      name: "knock has no pot line",
      rec: {
        ...base,
        turnIndex: 1,
        seat: 3,
        action: { type: "knock", potIndex: 0, handIndex: 0 },
        handBefore: mustHand("7h", "8c", "9d"),
        potBefore: mustPot("7h", "8c", "9d"),
      },
      want: ["East knocks"],
    },
    {
      name: "knock on the round's first turn (Keep) reveals the pot",
      rec: {
        ...base,
        turnIndex: 0,
        seat: 3,
        action: { type: "knock", potIndex: 0, handIndex: 0 },
        handBefore: mustHand("7h", "8c", "9d"),
        potBefore: mustPot("7h", "8c", "9d"),
      },
      want: ["East keeps their hand", "Pot is [7h 8c 9d]"],
    },
  ];

  for (const { name, rec, want } of cases) {
    assert.deepEqual(turnLines(rec), want, name);
  }
});

test("roundRecapLines", () => {
  const cardsFor = (...notation: [string, string, string]): [Card, Card, Card] => mustHand(...notation);
  const outcome: RoundOutcome = {
    result: {
      players: [
        { seat: 0, hand: cardsFor("7h", "8c", "9d"), score: 9.0, rank: 4 },
        { seat: 2, hand: cardsFor("Ah", "Ad", "Ac"), score: 32, rank: 1 },
      ],
      winners: [2],
    },
    struck: [0],
    eliminated: [],
  };
  assert.deepEqual(roundRecapLines(outcome, [1, 0, 0, 0]), [
    "South has [7h 8c 9d]",
    "North has [Ah Ad Ac]",
    "South receives a strike",
    "South has 9.0 points with 1 strike",
    "North has 32.0 points with 0 strikes",
  ]);
});

test("roundRecapLines marks an eliminated seat", () => {
  const outcome: RoundOutcome = {
    result: {
      players: [{ seat: 2, hand: mustHand("7h", "8c", "9d"), score: 24, rank: 1 }],
      winners: [2],
    },
    struck: [2],
    eliminated: [2],
  };
  assert.deepEqual(roundRecapLines(outcome, [0, 0, 3, 0]), [
    "North has [7h 8c 9d]",
    "North receives a strike and is eliminated",
    "North has 24.0 points with 3 strikes",
  ]);
});

test("gameEndLines", () => {
  const cases: Array<{ name: string; eliminated: [boolean, boolean, boolean, boolean]; want: string[] }> = [
    { name: "South among the winners", eliminated: [false, true, true, false], want: ["South wins the game", "Game over"] },
    { name: "South not among the winners", eliminated: [true, false, false, true], want: ["Game over"] },
  ];
  for (const { name, eliminated, want } of cases) {
    const g = new Game({ eliminated });
    assert.deepEqual(gameEndLines(g), want, name);
  }
});
