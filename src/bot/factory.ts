// Difficulty-name -> Strategy construction, shared by the headless
// simulator (src/sim) and the browser GUI (src/web), per specs/bots.md.

import { EasyBot } from "./easy.ts";
import { RegularBot } from "./regular.ts";
import { DifficultBot } from "./difficult.ts";
import type { Strategy } from "../game/types.ts";
import { Rng } from "../rng.ts";

export const BOT_NAMES = ["easy", "regular", "difficult"] as const;
export type BotName = (typeof BOT_NAMES)[number];

// createBot returns a freshly constructed strategy for name, per
// specs/bots.md. rng seeds the bot's own random decisions (e.g. its
// knock-turn range) with an independent sub-seed, so a caller stays
// fully reproducible from its own seed alone.
export function createBot(name: BotName, rng: Rng): Strategy {
  switch (name) {
    case "easy":
      return new EasyBot({ rng: new Rng(rng.nextSeed()) });
    case "regular":
      return new RegularBot({ rng: new Rng(rng.nextSeed()) });
    case "difficult":
      return new DifficultBot({ rng: new Rng(rng.nextSeed()) });
  }
}
