import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCard } from "../card/card.ts";
import type { Hand, Pot, PlayerView } from "../game/types.ts";
import { EasyBot } from "./easy.ts";

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

test("decide on the first turn", () => {
  const cases: Array<{
    name: string;
    hand: [string, string, string];
    pot: [string, string, string];
    wantAction: string;
  }> = [
    {
      name: "same-suit pot beats hand score",
      hand: ["7c", "8d", "9s"],
      pot: ["Ah", "Kh", "Qh"],
      wantAction: "exchange",
    },
    {
      name: "same-suit pot does not beat hand score",
      hand: ["Ah", "Kh", "Qh"],
      pot: ["7c", "8d", "9s"],
      wantAction: "trade",
    },
    {
      name: "mixed-suit pot never triggers exchange",
      hand: ["7c", "8d", "9s"],
      pot: ["Ah", "Kc", "Qd"],
      wantAction: "trade",
    },
  ];
  for (const { name, hand, pot, wantAction } of cases) {
    const v = baseView({
      hand: mustHand(...hand),
      pot: mustPot(...pot),
      isFirstTurnOfRound: true,
      ownTurnNumber: 1,
    });
    const b = new EasyBot();
    assert.equal(b.decide(v).type, wantAction, name);
  }
});

test("decide knock conditions", () => {
  const cases: Array<{
    name: string;
    bot: EasyBot;
    hand: [string, string, string];
    ownTurnNumber: number;
    wantKnock: boolean;
  }> = [
    {
      name: "20th own turn forces a knock",
      bot: new EasyBot(),
      hand: ["7c", "8d", "9s"],
      ownTurnNumber: 20,
      wantKnock: true,
    },
    {
      name: "score over 25 forces a knock",
      bot: new EasyBot(),
      hand: ["Ah", "Kh", "Qh"], // 31
      ownTurnNumber: 2,
      wantKnock: true,
    },
    {
      name: "4th consecutive non-improving turn forces a knock",
      bot: new EasyBot({ lastScore: 18, hasLastScore: true, noImproveStreak: 3 }),
      hand: ["7c", "Tc", "9s"], // 17 (clubs), not an improvement over 18
      ownTurnNumber: 5,
      wantKnock: true,
    },
    {
      name: "an improving turn resets the streak and does not knock",
      bot: new EasyBot({ lastScore: 10, hasLastScore: true, noImproveStreak: 3 }),
      hand: ["7c", "Tc", "9s"], // 17 (clubs), improves on 10
      ownTurnNumber: 5,
      wantKnock: false,
    },
    {
      name: "ordinary turn does not knock",
      bot: new EasyBot(),
      hand: ["7c", "8d", "9s"],
      ownTurnNumber: 2,
      wantKnock: false,
    },
  ];
  for (const { name, bot, hand, ownTurnNumber, wantKnock } of cases) {
    const v = baseView({ hand: mustHand(...hand), ownTurnNumber });
    const gotKnock = bot.decide(v).type === "knock";
    assert.equal(gotKnock, wantKnock, name);
  }
});

test("the no-improve streak resets after a knock-eligible improvement", () => {
  const b = new EasyBot();
  const view = (hand: [string, string, string], turn: number): PlayerView =>
    baseView({ hand: mustHand(...hand), ownTurnNumber: turn });

  // A baseline turn, two non-improving turns after it (streak reaches
  // 2), then an improving turn: the streak must reset to 0 rather than
  // carrying forward toward a false knock.
  b.decide(view(["7c", "Tc", "9s"], 1)); // establishes lastScore = 17 (clubs)
  b.decide(view(["7c", "Tc", "9s"], 2)); // 17, no improvement, streak = 1
  b.decide(view(["7c", "Tc", "9s"], 3)); // 17, no improvement, streak = 2
  const action = b.decide(view(["8c", "Tc", "9s"], 4)); // 18 (clubs), improves on 17

  assert.notEqual(action.type, "knock");
  assert.equal(b.noImproveStreak, 0);
});
