import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCard } from "../card/card.ts";
import type { Hand, Pot, PlayerView, PublicTurn } from "../game/types.ts";
import { RegularBot } from "./regular.ts";

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

test("decide on the first turn", () => {
  const cases: Array<{
    name: string;
    hand: [string, string, string];
    pot: [string, string, string];
    wantAction: string;
  }> = [
    { name: "same-suit pot beats hand score", hand: ["7c", "8d", "9s"], pot: ["Ah", "Kh", "Qh"], wantAction: "exchange" },
    { name: "same-suit pot does not beat hand score", hand: ["Ah", "Kh", "Qh"], pot: ["7c", "8d", "9s"], wantAction: "knock" },
    { name: "mixed-suit pot never triggers exchange", hand: ["7c", "8d", "9s"], pot: ["Ah", "Kc", "Qd"], wantAction: "knock" },
  ];
  for (const { name, hand, pot, wantAction } of cases) {
    const v = baseView({ hand: mustHand(...hand), pot: mustPot(...pot), isFirstTurnOfRound: true, ownTurnNumber: 1 });
    const b = new RegularBot();
    assert.equal(b.decide(v).type, wantAction, name);
  }
});

test("decide knock conditions", () => {
  const cases: Array<{
    name: string;
    bot: RegularBot;
    hand: [string, string, string];
    ownTurnNumber: number;
    wantKnock: boolean;
  }> = [
    { name: "20th own turn forces a knock", bot: new RegularBot(), hand: ["7c", "8d", "9s"], ownTurnNumber: 20, wantKnock: true },
    {
      name: "score of 31 (already maxed) forces an immediate knock",
      bot: new RegularBot(),
      hand: ["Ah", "Kh", "Qh"], // 31
      ownTurnNumber: 2,
      wantKnock: true,
    },
    {
      name: "score over 25 but below the instant-knock threshold still forces a knock",
      bot: new RegularBot(),
      hand: ["Kh", "Qh", "7h"], // 27
      ownTurnNumber: 2,
      wantKnock: true,
    },
    {
      name: "4th consecutive non-improving turn forces a knock",
      bot: new RegularBot({ lastScore: 18, hasLastScore: true, noImproveStreak: 3 }),
      hand: ["7c", "Tc", "9s"], // 17 (clubs), not an improvement over 18
      ownTurnNumber: 5,
      wantKnock: true,
    },
    {
      name: "an improving turn resets the streak and does not knock",
      bot: new RegularBot({ lastScore: 10, hasLastScore: true, noImproveStreak: 3 }),
      hand: ["7c", "Tc", "9s"], // 17 (clubs), improves on 10
      ownTurnNumber: 5,
      wantKnock: false,
    },
    { name: "ordinary turn does not knock", bot: new RegularBot(), hand: ["7c", "8d", "9s"], ownTurnNumber: 2, wantKnock: false },
  ];
  for (const { name, bot, hand, ownTurnNumber, wantKnock } of cases) {
    const v = baseView({ hand: mustHand(...hand), ownTurnNumber });
    const gotKnock = bot.decide(v).type === "knock";
    assert.equal(gotKnock, wantKnock, name);
  }
});

test("the no-improve streak resets after a knock-eligible improvement", () => {
  const b = new RegularBot();
  const view = (hand: [string, string, string], turn: number): PlayerView => baseView({ hand: mustHand(...hand), ownTurnNumber: turn });

  b.decide(view(["7c", "Tc", "9s"], 1)); // establishes lastScore = 17 (clubs)
  b.decide(view(["7c", "Tc", "9s"], 2)); // 17, no improvement, streak = 1
  b.decide(view(["7c", "Tc", "9s"], 3)); // 17, no improvement, streak = 2
  const action = b.decide(view(["8c", "Tc", "9s"], 4)); // 18 (clubs), improves on 17

  assert.notEqual(action.type, "knock");
  assert.equal(b.noImproveStreak, 0);
});

test("chooseSwap avoids feeding an opponent's apparent target suit when scores tie", () => {
  // Both swaps below leave the hand at score 21 (Kc + the taken Ac
  // forms clubs either way); one discards Th (hearts), the other Js
  // (spades). An opponent seen holding two hearts should steer the bot
  // away from the hearts discard.
  const hand = mustHand("Th", "Kc", "Js");
  const pot = mustPot("Ac", "Td", "9c");
  const v = baseView({ hand, pot, seat: 0 });

  const b = new RegularBot();
  b.onRoundStart();
  b.observe(turn(1, "trade", ["7d"], ["Qh"]));
  b.observe(turn(1, "trade", ["8s"], ["Kh"]));

  const action = b.decide(v);
  assert.equal(action.type, "trade");
  assert.equal(action.potIndex, 0);
  assert.equal(action.handIndex, 2, "must discard Js (spades), not Th (hearts)");
});

test("chooseSwap with no observed opponents falls back to the lowest-index tie", () => {
  const hand = mustHand("Th", "Kc", "Js");
  const pot = mustPot("Ac", "Td", "9c");
  const v = baseView({ hand, pot, seat: 0 });

  const b = new RegularBot();
  b.onRoundStart();

  const action = b.decide(v);
  assert.equal(action.type, "trade");
  assert.equal(action.potIndex, 0);
  assert.equal(action.handIndex, 0);
});

test("onRoundStart clears previously observed opponent state", () => {
  const hand = mustHand("Th", "Kc", "Js");
  const pot = mustPot("Ac", "Td", "9c");
  const v = baseView({ hand, pot, seat: 0 });

  const b = new RegularBot();
  b.onRoundStart();
  b.observe(turn(1, "trade", ["7d"], ["Qh"]));
  b.observe(turn(1, "trade", ["8s"], ["Kh"]));

  b.onRoundStart(); // new round: prior opponent tracking must be gone

  const action = b.decide(v);
  assert.equal(action.handIndex, 0, "with no history this round, falls back to the lowest-index tie");
});
