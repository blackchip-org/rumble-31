// Randomly seats the three bot skill levels for the currently
// selected Difficulty (specs/screens/difficulty.md, specs/bots_v3.md) at
// the start of a new game. Kept separate from main.ts so it's
// unit-testable without the DOM.

import type { BotSkillLevel } from "../bot/v4/factory.ts";
import { DIFFICULTY_BOT_SKILL_LEVELS, type Difficulty } from "../config.ts";
import type { Rng } from "../rng.ts";
import type { Settings } from "./settings.ts";

// BotSeats[i] is the skill level seated at seat i+1 (West=0, North=1,
// East=2 -- seat 0/South is always the human and never appears here).
export type BotSeats = [BotSkillLevel, BotSkillLevel, BotSkillLevel];

// pickBotSkillLevels randomly draws one of difficulty's weighted bot
// skill level options (config.ts's DIFFICULTY_BOT_SKILL_LEVELS, odds
// documented in specs/bots_v3.md).
export function pickBotSkillLevels(difficulty: Difficulty, rng: Rng): BotSeats {
  const options = DIFFICULTY_BOT_SKILL_LEVELS[difficulty];
  const roll = rng.next() * 100;
  let cumulative = 0;
  for (const option of options) {
    cumulative += option.weight;
    if (roll < cumulative) {
      return [...option.seats];
    }
  }
  return [...options[options.length - 1]!.seats];
}

// assignBotSeats rolls one of settings.difficulty's weighted bot skill
// level options (pickBotSkillLevels) and shuffles it across the three
// bot seats. Persisted for the life of a game (specs/state.md) so a
// resumed game keeps the same bots in the same seats rather than being
// re-rolled.
export function assignBotSeats(settings: Settings, rng: Rng): BotSeats {
  const seats = pickBotSkillLevels(settings.difficulty, rng);
  rng.shuffle(seats);
  return seats;
}

// baselineBotSeats returns difficulty's highest-weight (80%) bot skill
// level tuple, for debug placeholder game states (specs/params.md's
// screen=menu/over) that need *a* tuple to display without rolling the
// full weighted distribution.
export function baselineBotSeats(difficulty: Difficulty): BotSeats {
  return [...DIFFICULTY_BOT_SKILL_LEVELS[difficulty][0]!.seats];
}
