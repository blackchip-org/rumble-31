import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCard } from "../card/card.ts";
import type { Card } from "../card/card.ts";
import { score } from "../card/score.ts";
import type { Hand, Pot, PlayerView, PublicTurn } from "../game/types.ts";
import { applyPublicTurn, bestExchange, bestSwaps, candidateSwaps } from "./helpers.ts";

function mustHand(...notation: [string, string, string]): Hand {
  return [parseCard(notation[0]), parseCard(notation[1]), parseCard(notation[2])];
}
function mustPot(...notation: [string, string, string]): Pot {
  return mustHand(...notation);
}

function baseView(overrides: Partial<PlayerView>): PlayerView {
  return {
    hand: mustHand("7c", "8d", "9s"),
    pot: mustPot("Kc", "Kd", "Ks"),
    seat: 0,
    isFirstTurnOfRound: false,
    ownTurnNumber: 1,
    ...overrides,
  };
}

test("candidateSwaps enumerates all 9 swaps in pot-major/hand-minor order", () => {
  const v = baseView({});
  const swaps = candidateSwaps(v);
  assert.equal(swaps.length, 9);
  const order = swaps.map((s) => [s.potIdx, s.handIdx]);
  assert.deepEqual(order, [
    [0, 0],
    [0, 1],
    [0, 2],
    [1, 0],
    [1, 1],
    [1, 2],
    [2, 0],
    [2, 1],
    [2, 2],
  ]);
});

test("bestSwaps returns every swap tied for the max score", () => {
  // Every swap leaves the hand at 30.5 (three sevens), so all 9 tie.
  const v = baseView({ hand: mustHand("7h", "7d", "7c"), pot: mustPot("7s", "7s", "7s") });
  const swaps = bestSwaps(v);
  assert.equal(swaps.length, 9);
  assert.ok(swaps.every((s) => s.score === 30.5));
});

test("bestExchange finds the globally best swap", () => {
  const cases: Array<{ name: string; hand: [string, string, string]; pot: [string, string, string] }> = [
    { name: "already strong hand", hand: ["Ah", "Kh", "7c"], pot: ["7d", "8d", "9d"] },
    { name: "pot has an improving ace", hand: ["7c", "8d", "9s"], pot: ["Ah", "Kh", "7d"] },
    { name: "no improving swap available", hand: ["Ah", "Kh", "Qh"], pot: ["7c", "8d", "9s"] },
  ];
  for (const { name, hand, pot } of cases) {
    const h = mustHand(...hand);
    const p = mustPot(...pot);
    const v = baseView({ hand: h, pot: p });

    const action = bestExchange(v);
    assert.equal(action.type, "trade", name);

    const got = [...h] as [Card, Card, Card];
    got[action.handIndex] = p[action.potIndex] as Card;
    const gotScore = score(got);

    let wantScore = -1;
    for (let potIdx = 0; potIdx < 3; potIdx++) {
      for (let handIdx = 0; handIdx < 3; handIdx++) {
        const trial = [...h] as [Card, Card, Card];
        trial[handIdx] = p[potIdx] as Card;
        const s = score(trial);
        if (s > wantScore) {
          wantScore = s;
        }
      }
    }
    assert.equal(gotScore, wantScore, name);
  }
});

test("bestExchange ties break to the lowest indices", () => {
  const hand = mustHand("7h", "7d", "7c");
  const pot = mustPot("7s", "7s", "7s");
  const v = baseView({ hand, pot });

  const action = bestExchange(v);
  assert.equal(action.potIndex, 0);
  assert.equal(action.handIndex, 0);
});

function turn(seat: number, type: PublicTurn["type"], given: string[], taken: string[]): PublicTurn {
  return { seat, type, given: given.map(parseCard), taken: taken.map(parseCard) };
}

test("applyPublicTurn replays a seat's known-held cards across trades and an exchange", () => {
  const held = new Map<number, Card[]>();

  const steps: Array<{ name: string; turn: PublicTurn; want: string[] }> = [
    { name: "first trade reveals one card", turn: turn(1, "trade", ["7h"], ["Kd"]), want: ["Kd"] },
    { name: "re-trading the known card swaps it, count unchanged", turn: turn(1, "trade", ["Kd"], ["Qs"]), want: ["Qs"] },
    {
      name: "trading an unseen original card grows the known set",
      turn: turn(1, "trade", ["8h"], ["9c"]),
      want: ["Qs", "9c"],
    },
    {
      name: "an exchange fully reveals the hand regardless of prior knowledge",
      turn: turn(1, "exchange", ["Qs", "9c", "Th"], ["Ac", "Ad", "As"]),
      want: ["Ac", "Ad", "As"],
    },
  ];

  for (const { name, turn: t, want } of steps) {
    applyPublicTurn(held, t);
    assert.deepEqual(held.get(1), want.map(parseCard), name);
  }
  assert.equal(held.get(1)?.length, 3, "hand is fully known after the exchange");
});

test("applyPublicTurn keeps each seat's known-held cards isolated", () => {
  const held = new Map<number, Card[]>();
  applyPublicTurn(held, turn(1, "trade", ["7h"], ["Kd"]));
  applyPublicTurn(held, turn(2, "trade", ["7c"], ["Qh"]));

  assert.deepEqual(held.get(1), [parseCard("Kd")]);
  assert.deepEqual(held.get(2), [parseCard("Qh")]);
});

test("applyPublicTurn on a knock changes nothing", () => {
  const held = new Map<number, Card[]>([[1, [parseCard("Kd")]]]);
  applyPublicTurn(held, turn(1, "knock", [], []));
  assert.deepEqual(held.get(1), [parseCard("Kd")]);
});
