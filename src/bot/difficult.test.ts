import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCard } from "../card/card.ts";
import type { Hand, Pot, PlayerView, PublicTurn } from "../game/types.ts";
import { DifficultBot } from "./difficult.ts";

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

function turn(seat: number, type: PublicTurn["type"], given: string[], taken: string[]): PublicTurn {
  return { seat, type, given: given.map(parseCard), taken: taken.map(parseCard) };
}

// fullyKnown feeds a single "exchange" PublicTurn to reveal an
// opponent's entire hand in one shot, for tests that only care about
// the resulting known-held set, not the realism of how it got there.
function fullyKnown(bot: DifficultBot, seat: number, hand: [string, string, string]): void {
  bot.observe(turn(seat, "exchange", [], hand));
}

test("decide on the first turn", () => {
  const cases: Array<{
    name: string;
    hand: [string, string, string];
    pot: [string, string, string];
    wantAction: string;
  }> = [
    { name: "same-suit pot beats hand score", hand: ["7c", "8d", "9s"], pot: ["Ah", "Kh", "Qh"], wantAction: "exchange" },
    { name: "same-suit pot does not beat hand score", hand: ["Ah", "Kh", "Qh"], pot: ["7c", "8d", "9s"], wantAction: "trade" },
    { name: "mixed-suit pot never triggers exchange", hand: ["7c", "8d", "9s"], pot: ["Ah", "Kc", "Qd"], wantAction: "trade" },
  ];
  for (const { name, hand, pot, wantAction } of cases) {
    const v = baseView({ hand: mustHand(...hand), pot: mustPot(...pot), isFirstTurnOfRound: true, ownTurnNumber: 1 });
    const b = new DifficultBot();
    assert.equal(b.decide(v).type, wantAction, name);
  }
});

test("decide knock conditions with no observed opponents", () => {
  const cases: Array<{
    name: string;
    bot: DifficultBot;
    hand: [string, string, string];
    ownTurnNumber: number;
    wantKnock: boolean;
  }> = [
    { name: "20th own turn forces a knock", bot: new DifficultBot(), hand: ["7c", "8d", "9s"], ownTurnNumber: 20, wantKnock: true },
    { name: "score of 31 forces an immediate knock", bot: new DifficultBot(), hand: ["Ah", "Kh", "Qh"], ownTurnNumber: 2, wantKnock: true },
    { name: "score over 25 forces a knock", bot: new DifficultBot(), hand: ["Kh", "Qh", "7h"], ownTurnNumber: 2, wantKnock: true },
    {
      name: "4th consecutive non-improving turn forces a knock",
      bot: new DifficultBot({ lastScore: 18, hasLastScore: true, noImproveStreak: 3 }),
      hand: ["7c", "Tc", "9s"],
      ownTurnNumber: 5,
      wantKnock: true,
    },
    {
      name: "an improving turn resets the streak and does not knock",
      bot: new DifficultBot({ lastScore: 10, hasLastScore: true, noImproveStreak: 3 }),
      hand: ["7c", "Tc", "9s"],
      ownTurnNumber: 5,
      wantKnock: false,
    },
    { name: "ordinary turn does not knock", bot: new DifficultBot(), hand: ["7c", "8d", "9s"], ownTurnNumber: 2, wantKnock: false },
  ];
  for (const { name, bot, hand, ownTurnNumber, wantKnock } of cases) {
    const v = baseView({ hand: mustHand(...hand), ownTurnNumber });
    const gotKnock = bot.decide(v).type === "knock";
    assert.equal(gotKnock, wantKnock, name);
  }
});

test("score >= 31 knocks immediately even with a higher-scoring fully-known opponent", () => {
  const b = new DifficultBot();
  b.onRoundStart();
  fullyKnown(b, 1, ["Ac", "Ad", "As"]); // 32, higher than the bot's 31

  const v = baseView({ hand: mustHand("Ah", "Kh", "Qh"), ownTurnNumber: 2 }); // 31
  assert.equal(b.decide(v).type, "knock");
});

test("a fully-known opponent scoring higher blocks the over-25 knock", () => {
  const b = new DifficultBot();
  b.onRoundStart();
  fullyKnown(b, 1, ["Kc", "Qc", "9c"]); // 29, higher than the bot's 27

  const v = baseView({ hand: mustHand("Kh", "Qh", "7h"), ownTurnNumber: 2 }); // 27
  assert.notEqual(b.decide(v).type, "knock");
});

test("own turn 20 knocks unconditionally even with a higher-scoring fully-known opponent", () => {
  const b = new DifficultBot();
  b.onRoundStart();
  fullyKnown(b, 1, ["Kc", "Qc", "9c"]); // 29, higher than the bot's 27

  const v = baseView({ hand: mustHand("Kh", "Qh", "7h"), ownTurnNumber: 20 }); // 27
  assert.equal(b.decide(v).type, "knock");
});

test("a fully-known opponent scoring lower delays the streak knock by exactly one turn", () => {
  const b = new DifficultBot({ lastScore: 17, hasLastScore: true, noImproveStreak: 3 });
  b.onRoundStart();
  fullyKnown(b, 1, ["7d", "8s", "9h"]); // 9, lower than the bot's 17

  const v = () => baseView({ hand: mustHand("7c", "Tc", "9s"), ownTurnNumber: 5 }); // 17, no improvement

  const first = b.decide(v());
  assert.notEqual(first.type, "knock", "the first streak trigger should be deferred, not knocked");
  assert.equal(b.delayedKnock, true);

  const second = b.decide(v());
  assert.equal(second.type, "knock", "the deferred knock must fire unconditionally next time");
});

test("chooseSwap avoids a discard that would let a 2-known-card opponent beat the bot's own score", () => {
  // Both swaps below leave the hand at score 21 (Kc + the taken Ac
  // forms clubs either way); one discards Th (hearts), the other Js
  // (spades). An opponent known to hold Qh+Kh would score 30 (all
  // hearts) if handed the Th discard — well above the bot's 21 — so
  // that swap must be avoided.
  const v = baseView({ hand: mustHand("Th", "Kc", "Js"), pot: mustPot("Ac", "Td", "9c"), seat: 0 });

  const b = new DifficultBot();
  b.onRoundStart();
  b.observe(turn(1, "trade", ["7d"], ["Qh"]));
  b.observe(turn(1, "trade", ["8s"], ["Kh"]));

  const action = b.decide(v);
  assert.equal(action.type, "trade");
  assert.equal(action.potIndex, 0);
  assert.equal(action.handIndex, 2, "must discard Js, not the feeding Th");
});

test("chooseSwap falls back to the suit-conflict filter when no opponent has exactly 2 known cards", () => {
  // Same tied swaps as above, but the opponent has only 1 known card
  // (Qh) — too few to trigger the feeding check — so the choice must
  // come from the suit-conflict filter alone.
  const v = baseView({ hand: mustHand("Th", "Kc", "Js"), pot: mustPot("Ac", "Td", "9c"), seat: 0 });

  const b = new DifficultBot();
  b.onRoundStart();
  b.observe(turn(1, "trade", ["7d"], ["Qh"]));

  const action = b.decide(v);
  assert.equal(action.handIndex, 2, "must avoid the heart discard even without a feeding opponent");
});

test("chooseSwap falls back to the lowest-index tie when every candidate feeds someone", () => {
  const v = baseView({ hand: mustHand("Th", "Kc", "Js"), pot: mustPot("Ac", "Td", "9c"), seat: 0 });

  const b = new DifficultBot();
  b.onRoundStart();
  // Seat 1 would be fed by the Th discard (all hearts, 30 > 21).
  b.observe(turn(1, "trade", ["7d"], ["Qh"]));
  b.observe(turn(1, "trade", ["8s"], ["Kh"]));
  // Seat 2 would be fed by the Js discard (all spades, 30 > 21).
  b.observe(turn(2, "trade", ["7c"], ["Qs"]));
  b.observe(turn(2, "trade", ["8c"], ["Ks"]));

  const action = b.decide(v);
  assert.equal(action.potIndex, 0);
  assert.equal(action.handIndex, 0, "with every candidate feeding someone, the lowest-index tie wins");
});

test("onRoundStart clears previously observed opponent state", () => {
  const v = baseView({ hand: mustHand("Th", "Kc", "Js"), pot: mustPot("Ac", "Td", "9c"), seat: 0 });

  const b = new DifficultBot();
  b.onRoundStart();
  b.observe(turn(1, "trade", ["7d"], ["Qh"]));
  b.observe(turn(1, "trade", ["8s"], ["Kh"]));

  b.onRoundStart(); // new round: prior opponent tracking must be gone

  const action = b.decide(v);
  assert.equal(action.handIndex, 0, "with no history this round, falls back to the lowest-index tie");
});
