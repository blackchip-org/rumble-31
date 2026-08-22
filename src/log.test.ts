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
  assert.deepEqual(gameStartLines(42, "0.0", "3", "Moderate"), ["Welcome to Rumble 31, v0.0", "Starting game with seed 42", "Bot version 3", "Difficulty level is Moderate"]);
});

test("roundStartLines", () => {
  const southHand = mustHand("7h", "8c", "9d");
  const cases: Array<{ name: string; southHand: Hand | undefined; dealerSeat: number; want: string[] }> = [
    {
      name: "South is dealt in: pot still private",
      southHand,
      dealerSeat: 2,
      want: ["", "=== Round 1 ===", "North is the dealer", "South is dealt [7h 8c 9d]"],
    },
    {
      name: "South already eliminated, so not dealt a hand",
      southHand: undefined,
      dealerSeat: 0,
      want: ["", "=== Round 1 ===", "South is the dealer"],
    },
  ];
  for (const c of cases) {
    assert.deepEqual(roundStartLines(1, c.southHand, c.dealerSeat), c.want, c.name);
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
        { seat: 0, hand: cardsFor("7h", "8c", "9d"), score: 9, rank: 4 },
        { seat: 2, hand: cardsFor("Ah", "Ad", "Ac"), score: 32, rank: 1 },
      ],
      winners: [2],
    },
    struck: [0],
    eliminated: [],
    secondChanceGranted: [],
    endReason: { type: "31", seat: 2 },
  };
  assert.deepEqual(roundRecapLines(outcome, [1, 0, 0, 0]), [
    "Round over: North has 31",
    "South has [7h 8c 9d]",
    "North has [Ah Ad Ac]",
    "South receives a strike",
    "South has 9 points with 1 strike",
    "North has 32 points with 0 strikes",
  ]);
});

test("roundRecapLines names the knocker, and keeps a fractional score's decimal", () => {
  const outcome: RoundOutcome = {
    result: {
      players: [{ seat: 2, hand: mustHand("7h", "8h", "9h"), score: 30.5, rank: 1 }],
      winners: [2],
    },
    struck: [2],
    eliminated: [],
    secondChanceGranted: [],
    endReason: { type: "knock", seat: 2 },
  };
  assert.deepEqual(roundRecapLines(outcome, [0, 0, 1, 0]), [
    "Round over: North knocked",
    "North has [7h 8h 9h]",
    "North receives a strike",
    "North has 30.5 points with 1 strike",
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
    secondChanceGranted: [],
    endReason: { type: "knock", seat: 2 },
  };
  assert.deepEqual(roundRecapLines(outcome, [0, 0, 3, 0]), [
    "Round over: North knocked",
    "North has [7h 8c 9d]",
    "North receives a strike and is eliminated",
    "North has 24 points with 3 strikes",
  ]);
});

test("roundRecapLines marks a seat granted a second chance", () => {
  const outcome: RoundOutcome = {
    result: {
      players: [{ seat: 2, hand: mustHand("7h", "8c", "9d"), score: 24, rank: 1 }],
      winners: [2],
    },
    struck: [2],
    eliminated: [],
    secondChanceGranted: [2],
    endReason: { type: "knock", seat: 2 },
  };
  assert.deepEqual(roundRecapLines(outcome, [0, 0, 3, 0]), [
    "Round over: North knocked",
    "North has [7h 8c 9d]",
    "North receives a strike and gets a second chance",
    "North has 24 points with 3 strikes",
  ]);
});

test("gameEndLines", () => {
  // botSkillLevelLabels is West/North/East order (matches BotSeats),
  // revealed in gameEndLines' own East/West/North order.
  const botSkillLevelLabels = ["Novice", "Advanced", "Expert"];
  const cases: Array<{ name: string; eliminated: [boolean, boolean, boolean, boolean]; southPlace: number; want: string[] }> = [
    {
      name: "South among the winners",
      eliminated: [false, true, true, false],
      southPlace: 1,
      want: ["South wins the game", "Game over: First place", "East's skill level was Expert", "West's skill level was Novice", "North's skill level was Advanced"],
    },
    {
      name: "South not among the winners",
      eliminated: [true, false, false, true],
      southPlace: 3,
      want: ["Game over: Third place", "East's skill level was Expert", "West's skill level was Novice", "North's skill level was Advanced"],
    },
  ];
  for (const { name, eliminated, southPlace, want } of cases) {
    const g = new Game({ eliminated });
    assert.deepEqual(gameEndLines(g, southPlace, botSkillLevelLabels), want, name);
  }
});
