// Randomly seats the three bot strategies for the settings-configured
// Difficulty (specs/gui.md's Settings Screen, specs/bots.md) at the
// start of a new game. Kept separate from main.ts so it's
// unit-testable without the DOM.

import type { BotName } from "../bot/factory.ts";
import { DIFFICULTY_BOT_STRATEGIES } from "../config.ts";
import type { Rng } from "../rng.ts";
import type { Settings } from "./settings.ts";

// BotSeats[i] is the difficulty seated at seat i+1 (West=0, North=1,
// East=2 -- seat 0/South is always the human and never appears here).
export type BotSeats = [BotName, BotName, BotName];

// assignBotSeats shuffles the three bot strategies configured for
// settings.difficulty (config.ts's DIFFICULTY_BOT_STRATEGIES) across
// the three bot seats. Persisted for the life of a game
// (specs/state.md) so a resumed game keeps the same bots in the same
// seats rather than being reshuffled.
export function assignBotSeats(settings: Settings, rng: Rng): BotSeats {
  const seats: BotSeats = [...DIFFICULTY_BOT_STRATEGIES[settings.difficulty]];
  rng.shuffle(seats);
  return seats;
}
