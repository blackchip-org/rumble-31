import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCard } from "../card/card.ts";
import { score } from "../card/score.ts";
import type { Hand, Pot, PlayerView } from "../game/types.ts";
import { NoviceBot } from "./novice.ts";
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
    isLastTurn: false,
    ...overrides,
  };
}

test("decide on the first turn: blind gamble on the pot based on the hand's own score, per the [13-16] range", () => {
  // The pot is private on the first turn (specs/rules.md), so the bot
  // can't compare its score against the hand -- only a hand score well
  // outside the [13-16] threshold range is deterministic regardless of
  // the random roll.
  const cases: Array<{ name: string; hand: [string, string, string]; wantAction: string }> = [
    { name: "hand score well below the range: always gambles on the pot", hand: ["7c", "8d", "9s"], wantAction: "exchange" },
    { name: "hand score well above the range: always keeps it", hand: ["Th", "Jh", "Qh"], wantAction: "knock" },
  ];
  for (const { name, hand, wantAction } of cases) {
    const v = baseView({ hand: mustHand(...hand), isFirstTurnOfRound: true, ownTurnNumber: 1 });
    const b = new NoviceBot();
    assert.equal(b.decide(v).type, wantAction, name);
  }
});

test("knocks once the bot's own turn number reaches the [25-30] range, regardless of hand/pot", () => {
  const v = baseView({ ownTurnNumber: 100 });
  const b = new NoviceBot();
  assert.equal(b.decide(v).type, "knock");
});

test("does not force a turn-limit knock below the [25-30] range", () => {
  const v = baseView({ ownTurnNumber: 1 });
  const b = new NoviceBot();
  assert.notEqual(b.decide(v).type, "knock");
});

test("on the last turn (another player has knocked), takes whichever of knock/exchange/trade scores highest", () => {
  const cases: Array<{
    name: string;
    hand: [string, string, string];
    pot: [string, string, string];
    wantType: string;
    wantPotIndex?: number;
    wantHandIndex?: number;
  }> = [
    {
      name: "no exchange or trade beats the hand: knocks even below every other knock threshold",
      hand: ["7h", "Ah", "8s"],
      pot: ["7c", "8d", "9c"],
      wantType: "knock",
    },
    {
      name: "the whole pot clearly beats both the hand and every single-card trade: exchanges",
      hand: ["7c", "8d", "9s"],
      pot: ["Ah", "Kh", "9h"],
      wantType: "exchange",
    },
    {
      name: "a single pot card completes a better suit than the hand or the whole pot: trades that card",
      hand: ["7h", "8h", "9s"],
      pot: ["Th", "7d", "8d"],
      wantType: "trade",
      wantPotIndex: 0,
      wantHandIndex: 2,
    },
  ];
  for (const c of cases) {
    const v = baseView({ hand: mustHand(...c.hand), pot: mustPot(...c.pot), isLastTurn: true, ownTurnNumber: 1 });
    const b = new NoviceBot();
    const action = b.decide(v);
    assert.equal(action.type, c.wantType, c.name);
    if (c.wantPotIndex !== undefined) {
      assert.equal(action.potIndex, c.wantPotIndex, c.name);
      assert.equal(action.handIndex, c.wantHandIndex, c.name);
    }
  }
});

test("exchanges only when the pot is both knock-worthy (>= [27-29]) and beats the hand", () => {
  // Exchanging is itself a knock from the round's second turn on
  // (specs/rules.md), so "the pot beats my hand" alone isn't enough --
  // a pot that's merely better than a bad hand would otherwise lock in
  // a likely-losing score. Both conditions must hold. The threshold is
  // now a random [27-29] roll rather than a fixed number, so these
  // cases stick to the range's extremes for a deterministic outcome
  // regardless of the roll.
  const cases: Array<{ name: string; hand: [string, string, string]; pot: [string, string, string]; wantExchange: boolean }> = [
    { name: "pot well above the range's top and above the hand: always exchanges", hand: ["7c", "8d", "9s"], pot: ["Ah", "Kh", "Qh"], wantExchange: true },
    { name: "pot exactly at the range's top (29) and beats the hand: always exchanges regardless of the roll", hand: ["7c", "8d", "9s"], pot: ["9h", "Th", "Jh"], wantExchange: true },
    { name: "pot beats the hand but is below even the range's bottom (20 < 27): never exchanges", hand: ["7c", "8d", "9s"], pot: ["Kc", "Qc", "7d"], wantExchange: false },
    { name: "pot ties the hand's score instead of beating it: does not exchange", hand: ["Ah", "Kh", "8h"], pot: ["Ad", "Kd", "8d"], wantExchange: false },
  ];
  for (const c of cases) {
    const v = baseView({ hand: mustHand(...c.hand), pot: mustPot(...c.pot), ownTurnNumber: 2 });
    const b = new NoviceBot();
    assert.equal(b.decide(v).type === "exchange", c.wantExchange, c.name);
  }
});

test("knocks when the hand ties its best-ever score and more than 5 of its own turns have passed since the best turn", () => {
  // Unlike Advanced/Expert's randomized [3-5] wait, Novice's wait is a
  // fixed 5 turns, so the boundary is exact: 6 turns past the best
  // turn (bestTurn=1, ownTurnNumber=7) always knocks.
  const v = baseView({ hand: mustHand("7c", "8d", "9s"), pot: mustPot("Kc", "Qd", "Js"), ownTurnNumber: 7 });
  const b = new NoviceBot({ bestScore: 9, bestTurn: 1 });
  assert.equal(b.decide(v).type, "knock");
});

test("does not force that knock at exactly 5 turns since the best score was set", () => {
  const v = baseView({ hand: mustHand("7c", "8d", "9s"), pot: mustPot("Kc", "Qd", "Js"), ownTurnNumber: 6 });
  const b = new NoviceBot({ bestScore: 9, bestTurn: 1 });
  assert.notEqual(b.decide(v).type, "knock");
});

test("resets best score and turn at the start of each round", () => {
  // Simulate having reached a best of 9 at turn 1 of a prior round --
  // if this carried over unreset, turn 8 below would be far enough
  // past turn 1 to trigger the stagnation knock.
  const b = new NoviceBot({ bestScore: 9, bestTurn: 1 });
  b.onRoundStart();

  const v = baseView({ hand: mustHand("7c", "8d", "9s"), pot: mustPot("Kc", "Qd", "Js"), ownTurnNumber: 8 });
  assert.notEqual(b.decide(v).type, "knock");
});

test("trades to improve the hand when a pot card would help it", () => {
  const hand = mustHand("7c", "8d", "9s");
  const pot = mustPot("Ah", "Kd", "7s");
  const v = baseView({ hand, pot, ownTurnNumber: 2 });
  const b = new NoviceBot();
  const action = b.decide(v);

  const want = bestImprovingSwap(v);
  assert.ok(want);
  assert.equal(action.type, "trade");
  assert.equal(action.potIndex, want?.potIdx);
  assert.equal(action.handIndex, want?.handIdx);
});

test("knocks once the hand score reaches the top of the [27-29] range, regardless of the roll", () => {
  const v = baseView({ hand: mustHand("9h", "Th", "Jh"), pot: mustPot("7c", "8d", "9s"), ownTurnNumber: 2 });
  assert.equal(score(v.hand), 29);
  assert.equal(bestImprovingSwap(v), undefined);
  const b = new NoviceBot();
  assert.equal(b.decide(v).type, "knock");
});

test("does not force a score-threshold knock below the [27-29] range's bottom", () => {
  const v = baseView({ hand: mustHand("7h", "9h", "Th"), pot: mustPot("7c", "8d", "9s"), ownTurnNumber: 2 });
  assert.equal(score(v.hand), 26);
  assert.equal(bestImprovingSwap(v), undefined);
  const b = new NoviceBot();
  assert.notEqual(b.decide(v).type, "knock");
});

test("records the resulting score as its best even from the round's first turn", () => {
  const b = new NoviceBot();
  b.onRoundStart();

  // Hand score (9, mismatched suits) is well below the [13-16] blind-gamble
  // range, so the pot is always taken regardless of the random roll.
  const first = b.decide(baseView({ hand: mustHand("7c", "8d", "9s"), pot: mustPot("7s", "8s", "9s"), isFirstTurnOfRound: true }));
  assert.equal(first.type, "exchange"); // resulting score = score(pot) = 24, at turn 1

  // Later in the same round -- turn 8 is more than [3-5] turns past
  // the turn-1 best of 24 -- tying it with no better swap available
  // triggers the stagnation knock.
  const v = baseView({ hand: mustHand("7s", "8s", "9s"), pot: mustPot("Kd", "Qh", "Jc"), ownTurnNumber: 8 });
  assert.equal(bestImprovingSwap(v), undefined, "tying the recorded best of 24 with no better swap available");
  assert.equal(b.decide(v).type, "knock");
});

test("trades fully at random when nothing improves the hand, unlike Advanced it never looks for a pair", () => {
  // 7c/8d remain unnecessary (9h is the sole best suit), no pot swap
  // improves the hand, and 7s (potIdx 0) would pair with 7c -- Advanced
  // sometimes takes that pair-maker trade, but Novice has no pair-maker
  // bullet at all, so it always falls straight through to the
  // fully-random trade regardless of the pairing opportunity.
  const hand = mustHand("7c", "8d", "9h");
  const pot = mustPot("7s", "8s", "9s");
  const v = baseView({ hand, pot, ownTurnNumber: 2 });
  assert.equal(bestImprovingSwap(v), undefined);

  const b = new NoviceBot();
  const action = b.decide(v);
  assert.equal(action.type, "trade");
  assert.ok(action.potIndex >= 0 && action.potIndex <= 2);
  assert.ok(action.handIndex >= 0 && action.handIndex <= 2);
});

test("trades fully at random when nothing improves the hand and no card is unnecessary", () => {
  // Tc/Jd/Qh ties 3 ways at 10 -- unnecessaryIndices treats all 3 as
  // necessary -- and 7s/8s/9s never beats that tie either.
  const hand = mustHand("Tc", "Jd", "Qh");
  const pot = mustPot("7s", "8s", "9s");
  const v = baseView({ hand, pot, ownTurnNumber: 2 });
  assert.equal(bestImprovingSwap(v), undefined);
  assert.deepEqual(unnecessaryIndices(hand), []);
  assert.ok(score(v.pot) < 27 && score(hand) < 27);

  const b = new NoviceBot();
  const action = b.decide(v);
  assert.equal(action.type, "trade");
  assert.ok(action.potIndex >= 0 && action.potIndex <= 2);
  assert.ok(action.handIndex >= 0 && action.handIndex <= 2);
});
