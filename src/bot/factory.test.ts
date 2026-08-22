import { test } from "node:test";
import assert from "node:assert/strict";
import type { Action, PlayerView, Strategy } from "../game/types.ts";
import { Rng } from "../rng.ts";
import { parseCard } from "../card/card.ts";
import { BOT_SKILL_LEVELS, createBot, snapshotBot, type BotMemory, type BotSkillLevel } from "./factory.ts";

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
    isLastTurn: false,
    ...overrides,
  };
}

test("snapshotBot tags each skill level's memory with its own name", () => {
  for (const skillLevel of BOT_SKILL_LEVELS) {
    const bot = createBot(skillLevel, new Rng(1));
    const memory = snapshotBot(skillLevel, bot);
    assert.equal(memory.name, skillLevel);
  }
});

// staleBestMemory is a bestScore/bestTurn pairing that NoviceBot,
// AdvancedBot, and ExpertBot all treat as "stagnant" -- tied with the
// recorded best, long enough after bestTurn to force a knock regardless
// of hand/pot -- so restoring it is easy to observe from decide() alone.
const staleBestMemory: Record<"novice" | "advanced" | "expert", BotMemory> = {
  novice: {
    name: "novice",
    bestScore: 9,
    bestTurn: 1,
  },
  advanced: {
    name: "advanced",
    bestScore: 9,
    bestTurn: 1,
  },
  expert: {
    name: "expert",
    bestScore: 9,
    bestTurn: 1,
    upstreamKnown: [],
    downstreamKnown: [],
    neighbors: { upstreamSeat: undefined, downstreamSeat: undefined, lastTurn: undefined },
  },
};

test("createBot restores matching memory, forcing the stagnation knock its bestScore/bestTurn implies", () => {
  for (const skillLevel of BOT_SKILL_LEVELS) {
    const bot = createBot(skillLevel, new Rng(1), staleBestMemory[skillLevel]);
    const v = baseView({ hand: [parseCard("7c"), parseCard("8d"), parseCard("9s")], pot: [parseCard("Kc"), parseCard("Qd"), parseCard("Js")] });
    assert.equal(decideSync(bot, v).type, "knock", `${skillLevel}: restored bestScore=9 tied at turn 8 (>3-5 past bestTurn=1) should force a knock`);
  }
});

test("createBot ignores memory tagged for a different skill level", () => {
  const mismatched: Record<BotSkillLevel, BotMemory> = {
    novice: staleBestMemory.advanced,
    advanced: staleBestMemory.expert,
    expert: staleBestMemory.novice,
  };
  for (const skillLevel of BOT_SKILL_LEVELS) {
    // Neither hand/pot nor turn number alone would force a knock --
    // only a restored bestScore/bestTurn would, so if mismatched
    // memory were wrongly applied this would knock instead.
    const bot = createBot(skillLevel, new Rng(1), mismatched[skillLevel]);
    const v = baseView({ ownTurnNumber: 8 });
    assert.notEqual(decideSync(bot, v).type, "knock", `${skillLevel}: memory tagged for a different skill level must be ignored`);
  }
});

test("snapshotBot/createBot round-trips a bot's tracked memory unchanged", () => {
  for (const skillLevel of BOT_SKILL_LEVELS) {
    const bot = createBot(skillLevel, new Rng(1), staleBestMemory[skillLevel]);
    const memory = snapshotBot(skillLevel, bot);
    assert.deepEqual(memory, staleBestMemory[skillLevel]);
  }
});
