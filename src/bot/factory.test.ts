import { test } from "node:test";
import assert from "node:assert/strict";
import type { Action, PlayerView, Strategy } from "../game/types.ts";
import { Rng } from "../rng.ts";
import { parseCard } from "../card/card.ts";
import { BOT_NAMES, createBot, snapshotBot, type BotMemory, type BotName } from "./factory.ts";

// decideSync calls decide() and asserts its result is synchronous --
// true of every bot in src/bot, unlike Strategy's own Action |
// Promise<Action> signature (which also covers e.g. a browser click).
function decideSync(bot: Strategy, v: PlayerView): Action {
  const result = bot.decide(v);
  assert.ok(!(result instanceof Promise), "expected a synchronous bot decision");
  return result;
}

function baseView(overrides: Partial<PlayerView>): PlayerView {
  return {
    hand: [parseCard("7c"), parseCard("8d"), parseCard("9s")],
    pot: [parseCard("Kc"), parseCard("Qd"), parseCard("Js")],
    seat: 0,
    isFirstTurnOfRound: false,
    ownTurnNumber: 8,
    ...overrides,
  };
}

test("snapshotBot tags each difficulty's memory with its own name", () => {
  for (const name of BOT_NAMES) {
    const bot = createBot(name, new Rng(1));
    const memory = snapshotBot(name, bot);
    assert.equal(memory.name, name);
  }
});

// staleBestMemory is a bestScore/bestTurn pairing that both RegularBot
// and DifficultBot treat as "stagnant" -- tied with the recorded best,
// long enough after bestTurn to force a knock regardless of hand/pot --
// so restoring it is easy to observe from decide() alone.
// Every field is spelled out explicitly, including ones RegularBot
// leaves undefined -- snapshot() always returns them as present-but-
// undefined keys (never omitted), and the round-trip test below
// compares against this object with assert.deepEqual (deepStrictEqual
// under "node:assert/strict"), which treats a present `undefined` key
// and an absent one as different.
const staleBestMemory: Record<"regular" | "difficult", BotMemory> = {
  regular: {
    name: "regular",
    bestScore: 9,
    bestTurn: 1,
    lastSuitUpstreamTook: undefined,
    lastSuitUpstreamDiscarded: undefined,
    lastSuitDownstreamTook: undefined,
    neighbors: { upstreamSeat: undefined, downstreamSeat: undefined, lastTurn: undefined },
  },
  difficult: {
    name: "difficult",
    bestScore: 9,
    bestTurn: 1,
    upstreamKnown: [],
    downstreamKnown: [],
    neighbors: { upstreamSeat: undefined, downstreamSeat: undefined, lastTurn: undefined },
  },
};

test("createBot restores matching memory, forcing the stagnation knock its bestScore/bestTurn implies", () => {
  for (const name of ["regular", "difficult"] as const) {
    const bot = createBot(name, new Rng(1), staleBestMemory[name]);
    const v = baseView({ hand: [parseCard("7c"), parseCard("8d"), parseCard("9s")], pot: [parseCard("Kc"), parseCard("Qd"), parseCard("Js")] });
    assert.equal(decideSync(bot, v).type, "knock", `${name}: restored bestScore=9 tied at turn 8 (>3-5 past bestTurn=1) should force a knock`);
  }
});

test("createBot ignores memory tagged for a different difficulty", () => {
  const mismatched: Record<BotName, BotMemory> = {
    easy: staleBestMemory.regular,
    regular: staleBestMemory.difficult,
    difficult: { name: "easy" },
  };
  for (const name of BOT_NAMES) {
    // Neither hand/pot nor turn number alone would force a knock --
    // only a restored bestScore/bestTurn would, so if mismatched
    // memory were wrongly applied this would knock instead.
    const bot = createBot(name, new Rng(1), mismatched[name]);
    const v = baseView({ ownTurnNumber: 8 });
    assert.notEqual(decideSync(bot, v).type, "knock", `${name}: memory tagged for a different difficulty must be ignored`);
  }
});

test("snapshotBot/createBot round-trips a bot's tracked memory unchanged", () => {
  for (const name of ["regular", "difficult"] as const) {
    const bot = createBot(name, new Rng(1), staleBestMemory[name]);
    const memory = snapshotBot(name, bot);
    assert.deepEqual(memory, staleBestMemory[name]);
  }
});
