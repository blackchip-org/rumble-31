// Skill-level -> Strategy construction, shared by the headless
// simulator (src/sim) and the browser GUI (src/web), per specs/bots.md.

import { NoviceBot, type NoviceBotMemory } from "./novice.ts";
import { AdvancedBot, type AdvancedBotMemory } from "./advanced.ts";
import { ExpertBot, type ExpertBotMemory } from "./expert.ts";
import type { Strategy } from "../game/types.ts";
import { Rng } from "../rng.ts";

export const BOT_SKILL_LEVELS = ["novice", "advanced", "expert"] as const;
export type BotSkillLevel = (typeof BOT_SKILL_LEVELS)[number];

// BotMemory is a bot's own snapshot() output, tagged with which skill
// level it came from so createBot can restore it into a matching bot
// (and it round-trips cleanly through JSON, per specs/state.md).
export type BotMemory = ({ name: "novice" } & NoviceBotMemory) | ({ name: "advanced" } & AdvancedBotMemory) | ({ name: "expert" } & ExpertBotMemory);

// createBot returns a freshly constructed strategy for skillLevel, per
// specs/bots.md. rng seeds the bot's own random decisions (e.g. its
// knock-turn range) with an independent sub-seed, so a caller stays
// fully reproducible from its own seed alone. memory, if given and
// tagged for this same skill level, seeds the bot with what it had
// already tracked instead of starting blank -- e.g. to rebuild a bot
// across a page reload (specs/state.md) without losing its accumulated
// opponent knowledge.
export function createBot(skillLevel: BotSkillLevel, rng: Rng, memory?: BotMemory): Strategy {
  switch (skillLevel) {
    case "novice":
      return new NoviceBot({ rng: new Rng(rng.nextSeed()), ...(memory?.name === "novice" ? memory : {}) });
    case "advanced":
      return new AdvancedBot({ rng: new Rng(rng.nextSeed()), ...(memory?.name === "advanced" ? memory : {}) });
    case "expert":
      return new ExpertBot({ rng: new Rng(rng.nextSeed()), ...(memory?.name === "expert" ? memory : {}) });
  }
}

// snapshotBot captures strategy's current memory as a BotMemory tagged
// with skillLevel, the counterpart createBot restores from.
export function snapshotBot(skillLevel: BotSkillLevel, strategy: Strategy): BotMemory {
  switch (skillLevel) {
    case "novice":
      return { name: "novice", ...(strategy as NoviceBot).snapshot() };
    case "advanced":
      return { name: "advanced", ...(strategy as AdvancedBot).snapshot() };
    case "expert":
      return { name: "expert", ...(strategy as ExpertBot).snapshot() };
  }
}
