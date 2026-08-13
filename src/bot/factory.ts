// Difficulty-name -> Strategy construction, shared by the headless
// simulator (src/sim) and the browser GUI (src/web), per specs/bots.md.

import { EasyBot } from "./easy.ts";
import { RegularBot, type RegularBotMemory } from "./regular.ts";
import { DifficultBot, type DifficultBotMemory } from "./difficult.ts";
import type { Strategy } from "../game/types.ts";
import { Rng } from "../rng.ts";

export const BOT_NAMES = ["easy", "regular", "difficult"] as const;
export type BotName = (typeof BOT_NAMES)[number];

// BotMemory is a bot's own snapshot() output, tagged with which
// difficulty it came from so createBot can restore it into a matching
// bot (and it round-trips cleanly through JSON, per specs/state.md).
// Easy carries no cross-turn state (src/bot/easy.ts), so its memory is
// just the tag.
export type BotMemory = { name: "easy" } | ({ name: "regular" } & RegularBotMemory) | ({ name: "difficult" } & DifficultBotMemory);

// createBot returns a freshly constructed strategy for name, per
// specs/bots.md. rng seeds the bot's own random decisions (e.g. its
// knock-turn range) with an independent sub-seed, so a caller stays
// fully reproducible from its own seed alone. memory, if given and
// tagged for this same name, seeds the bot with what it had already
// tracked instead of starting blank -- e.g. to rebuild a bot across a
// page reload (specs/state.md) without losing its accumulated
// opponent knowledge.
export function createBot(name: BotName, rng: Rng, memory?: BotMemory): Strategy {
  switch (name) {
    case "easy":
      return new EasyBot({ rng: new Rng(rng.nextSeed()) });
    case "regular":
      return new RegularBot({ rng: new Rng(rng.nextSeed()), ...(memory?.name === "regular" ? memory : {}) });
    case "difficult":
      return new DifficultBot({ rng: new Rng(rng.nextSeed()), ...(memory?.name === "difficult" ? memory : {}) });
  }
}

// snapshotBot captures strategy's current memory as a BotMemory tagged
// with name, the counterpart createBot restores from.
export function snapshotBot(name: BotName, strategy: Strategy): BotMemory {
  switch (name) {
    case "easy":
      return { name: "easy" };
    case "regular":
      return { name: "regular", ...(strategy as RegularBot).snapshot() };
    case "difficult":
      return { name: "difficult", ...(strategy as DifficultBot).snapshot() };
  }
}
