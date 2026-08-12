import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCard } from "../card/card.ts";
import type { Hand, Pot, PlayerView, PublicTurn } from "../game/types.ts";
import { RegularBot } from "./regular.ts";
import { bestImprovingSwap } from "./helpers.ts";

function mustHand(...notation: [string, string, string]): Hand {
  return [parseCard(notation[0]), parseCard(notation[1]), parseCard(notation[2])];
}
function mustPot(...notation: [string, string, string]): Pot {
  return mustHand(...notation);
}

function baseView(overrides: Partial<PlayerView>): PlayerView {
  return {
    hand: mustHand("7c", "8d", "9s"),
    pot: mustPot("Kc", "Qd", "Js"),
    seat: 0,
    isFirstTurnOfRound: false,
    ownTurnNumber: 1,
    ...overrides,
  };
}

function turn(seat: number, type: PublicTurn["type"], given: string[], taken: string[]): PublicTurn {
  return { seat, type, given: given.map(parseCard), taken: taken.map(parseCard) };
}

test("decide on the first turn: take pot only if it improves the hand", () => {
  const cases: Array<{ name: string; hand: [string, string, string]; pot: [string, string, string]; wantAction: string }> = [
    { name: "same-suit pot beats hand score", hand: ["7c", "8d", "9s"], pot: ["Ah", "Kh", "Qh"], wantAction: "exchange" },
    { name: "pot does not beat hand score", hand: ["Ah", "Kh", "Qh"], pot: ["7c", "8d", "9s"], wantAction: "knock" },
    { name: "a mixed-suit pot can beat the hand too", hand: ["7c", "8d", "9s"], pot: ["Ah", "Kc", "Qd"], wantAction: "exchange" },
  ];
  for (const { name, hand, pot, wantAction } of cases) {
    const v = baseView({ hand: mustHand(...hand), pot: mustPot(...pot), isFirstTurnOfRound: true, ownTurnNumber: 1 });
    const b = new RegularBot();
    assert.equal(b.decide(v).type, wantAction, name);
  }
});

test("knocks once the bot's own turn number reaches the [25-30] range, regardless of hand/pot", () => {
  const v = baseView({ ownTurnNumber: 100 });
  const b = new RegularBot();
  assert.equal(b.decide(v).type, "knock");
});

test("does not force a turn-limit knock below the [25-30] range", () => {
  const v = baseView({ ownTurnNumber: 1 });
  const b = new RegularBot();
  assert.notEqual(b.decide(v).type, "knock");
});

test("exchanges all cards whenever the pot's score is >= 30", () => {
  const v = baseView({ hand: mustHand("7c", "8d", "9s"), pot: mustPot("Ah", "Kh", "Qh"), ownTurnNumber: 2 });
  const b = new RegularBot();
  assert.equal(b.decide(v).type, "exchange");
});

test("knocks when the hand ties its best-ever score and that best was reached more than [3-5] rounds ago", () => {
  const v = baseView({ hand: mustHand("7c", "8d", "9s"), pot: mustPot("Kc", "Qd", "Js"), ownTurnNumber: 2 });
  const b = new RegularBot({ bestScore: 9, hasBestScore: true, bestRound: 1, currentRound: 8 });
  assert.equal(b.decide(v).type, "knock");
});

test("does not force that knock in the same round the best score was set", () => {
  const v = baseView({ hand: mustHand("7c", "8d", "9s"), pot: mustPot("Kc", "Qd", "Js"), ownTurnNumber: 2 });
  const b = new RegularBot({ bestScore: 9, hasBestScore: true, bestRound: 1, currentRound: 1 });
  assert.notEqual(b.decide(v).type, "knock");
});

test("trades to improve the hand when a pot card would help it", () => {
  const hand = mustHand("7c", "8d", "9s");
  const pot = mustPot("Ah", "Kd", "7s");
  const v = baseView({ hand, pot, ownTurnNumber: 2 });
  const b = new RegularBot();
  const action = b.decide(v);

  const want = bestImprovingSwap(v);
  assert.ok(want);
  assert.equal(action.type, "trade");
  assert.equal(action.potIndex, want?.potIdx);
  assert.equal(action.handIndex, want?.handIdx);
});

test("records the resulting score as its best even from the round's first turn", () => {
  const b = new RegularBot();
  b.onRoundStart(); // currentRound = 1

  const first = b.decide(baseView({ hand: mustHand("7c", "8d", "9s"), pot: mustPot("7s", "8s", "9s"), isFirstTurnOfRound: true }));
  assert.equal(first.type, "exchange"); // resulting score = score(pot) = 24

  for (let i = 0; i < 7; i++) {
    b.onRoundStart(); // currentRound = 8, more than [3-5] rounds past round 1
  }

  const v = baseView({ hand: mustHand("7s", "8s", "9s"), pot: mustPot("Kd", "Qh", "Jc"), ownTurnNumber: 2 });
  assert.equal(bestImprovingSwap(v), undefined, "tying the recorded best of 24 with no better swap available");
  assert.equal(b.decide(v).type, "knock");
});

test("wires observed neighbor turns through to the favorable-pickup preference", () => {
  const b = new RegularBot();
  b.onRoundStart();

  // Seat 0 is the bot, turn order 0, 1, 2, 3. Replay the round the way
  // the engine actually broadcasts it: every turn, including the bot's
  // own, goes through observe().
  const priming = b.decide(
    baseView({ seat: 0, isFirstTurnOfRound: true, hand: mustHand("Ah", "Kh", "Qh"), pot: mustPot("7c", "8d", "9s") }),
  );
  assert.equal(priming.type, "knock");
  b.observe(turn(0, "knock", [], []));

  b.observe(turn(1, "trade", ["7h"], ["7s"]));
  b.observe(turn(2, "trade", ["8h"], ["9d"]));
  // Seat 3 acts immediately before the bot's next turn -- it becomes
  // upstream once decide() runs below, and its taken suit (hearts)
  // becomes the suit to avoid.
  b.observe(turn(3, "trade", ["9h"], ["Qh"]));

  // Hand: 7c/8c necessary (clubs, 15), 9s unnecessary. Pot: Th (hearts
  // -- upstream's collecting suit, unfavorable), Td and 7d (diamonds,
  // favorable). No swap improves 15 here, so the favorable-pickup
  // bullet is what decides the trade.
  const hand = mustHand("7c", "8c", "9s");
  const pot = mustPot("Th", "Td", "7d");
  const v = baseView({ seat: 0, hand, pot, ownTurnNumber: 2 });
  assert.equal(bestImprovingSwap(v), undefined);

  const action = b.decide(v);
  assert.equal(action.type, "trade");
  assert.notEqual(action.potIndex, 0, "must avoid Th, the suit upstream just took");
  assert.equal(action.potIndex, 1);
  assert.equal(action.handIndex, 2);
});
