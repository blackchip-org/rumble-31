import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCard } from "../card/card.ts";
import { score } from "../card/score.ts";
import type { Hand, Pot, PlayerView } from "../game/types.ts";
import { EasyBot } from "./easy.ts";
import { bestImprovingSwap, unnecessaryIndices } from "./helpers.ts";

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

test("decide on the first turn: take pot only if it improves the hand", () => {
  const cases: Array<{ name: string; hand: [string, string, string]; pot: [string, string, string]; wantAction: string }> = [
    { name: "same-suit pot beats hand score", hand: ["7c", "8d", "9s"], pot: ["Ah", "Kh", "Qh"], wantAction: "exchange" },
    { name: "pot does not beat hand score", hand: ["Ah", "Kh", "Qh"], pot: ["7c", "8d", "9s"], wantAction: "knock" },
    { name: "a mixed-suit pot can beat the hand too", hand: ["7c", "8d", "9s"], pot: ["Ah", "Kc", "Qd"], wantAction: "exchange" },
    { name: "a tied score does not count as an improvement", hand: ["7c", "8d", "9s"], pot: ["9h", "8c", "7d"], wantAction: "knock" },
  ];
  for (const { name, hand, pot, wantAction } of cases) {
    const v = baseView({ hand: mustHand(...hand), pot: mustPot(...pot), isFirstTurnOfRound: true, ownTurnNumber: 1 });
    const b = new EasyBot();
    assert.equal(b.decide(v).type, wantAction, name);
  }
});

test("knocks once the bot's own turn number reaches the [18-22] range, regardless of hand/pot", () => {
  const v = baseView({ ownTurnNumber: 100 });
  const b = new EasyBot();
  assert.equal(b.decide(v).type, "knock");
});

test("does not force a turn-limit knock below the [18-22] range", () => {
  const v = baseView({ ownTurnNumber: 1 });
  const b = new EasyBot();
  assert.notEqual(b.decide(v).type, "knock");
});

test("exchanges all cards whenever the pot's score is >= 30", () => {
  const v = baseView({ hand: mustHand("7c", "8d", "9s"), pot: mustPot("Ah", "Kh", "Qh"), ownTurnNumber: 2 });
  const b = new EasyBot();
  const action = b.decide(v);
  assert.equal(action.type, "exchange");
});

test("does not exchange when the pot scores below 30", () => {
  const v = baseView({ hand: mustHand("7c", "8d", "9s"), pot: mustPot("7h", "8s", "9c"), ownTurnNumber: 2 });
  const b = new EasyBot();
  assert.notEqual(b.decide(v).type, "exchange");
});

test("trades to improve the hand when a pot card would help it", () => {
  const hand = mustHand("7c", "8d", "9s");
  const pot = mustPot("Ah", "Kd", "7s");
  const v = baseView({ hand, pot, ownTurnNumber: 2 });
  const b = new EasyBot();
  const action = b.decide(v);

  const want = bestImprovingSwap(v);
  assert.ok(want);
  assert.equal(action.type, "trade");
  assert.equal(action.potIndex, want?.potIdx);
  assert.equal(action.handIndex, want?.handIdx);
});

test("knocks once the hand score reaches 30, when no swap improves it further", () => {
  const v = baseView({ hand: mustHand("Ah", "Kh", "9h"), pot: mustPot("7c", "8d", "9s"), ownTurnNumber: 2 });
  assert.equal(score(v.hand), 30);
  assert.equal(bestImprovingSwap(v), undefined);
  const b = new EasyBot();
  assert.equal(b.decide(v).type, "knock");
});

test("does not force a score-threshold knock below 30", () => {
  const v = baseView({ hand: mustHand("Ah", "Kh", "8h"), pot: mustPot("7c", "8d", "9s"), ownTurnNumber: 2 });
  assert.equal(score(v.hand), 29);
  assert.equal(bestImprovingSwap(v), undefined);
  const b = new EasyBot();
  assert.notEqual(b.decide(v).type, "knock");
});

test("trades a random unnecessary card for a random pot card when nothing improves the hand", () => {
  // 7c/8d/9h ties nothing, 9h is the sole best suit (hearts); every
  // 7s/8s/9s pot swap only ties the current score, never beats it, so
  // no card "improves" the hand and 7c/8d remain unnecessary.
  const hand = mustHand("7c", "8d", "9h");
  const pot = mustPot("7s", "8s", "9s");
  const v = baseView({ hand, pot, ownTurnNumber: 2 });
  assert.equal(bestImprovingSwap(v), undefined);
  const unnecessary = unnecessaryIndices(hand);
  assert.deepEqual(unnecessary, [0, 1]);

  const b = new EasyBot();
  const action = b.decide(v);
  assert.equal(action.type, "trade");
  assert.ok(unnecessary.includes(action.handIndex), "handIndex must be one of the unnecessary cards");
  assert.ok(action.potIndex >= 0 && action.potIndex <= 2);
});

test("trades fully at random when nothing improves the hand and no card is unnecessary", () => {
  // Tc/Jd/Qh ties 3 ways at 10 -- unnecessaryIndices treats all 3 as
  // necessary -- and 7s/8s/9s never beats that tie either.
  const hand = mustHand("Tc", "Jd", "Qh");
  const pot = mustPot("7s", "8s", "9s");
  const v = baseView({ hand, pot, ownTurnNumber: 2 });
  assert.equal(bestImprovingSwap(v), undefined);
  assert.deepEqual(unnecessaryIndices(hand), []);
  assert.ok(score(v.pot) < 30 && score(hand) < 28);

  const b = new EasyBot();
  const action = b.decide(v);
  assert.equal(action.type, "trade");
  assert.ok(action.potIndex >= 0 && action.potIndex <= 2);
  assert.ok(action.handIndex >= 0 && action.handIndex <= 2);
});
