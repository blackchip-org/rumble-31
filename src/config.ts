// Developer-tunable constants, per specs/config.md.

import type { BotSkillLevel } from "./bot/factory.ts";

// DIFFICULTIES/Difficulty are the Settings Screen's "Difficulty" option
// (specs/screens/settings.md), each mapping to the three bot skill
// levels (specs/bots.md) seated for a game's three bot seats, per
// DIFFICULTY_BOT_SKILL_LEVELS below.
export const DIFFICULTIES = ["easy", "moderate", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

// DIFFICULTY_BOT_SKILL_LEVELS maps each Difficulty to the three bot
// skill levels assigned to that game's bot seats (specs/bots.md).
export const DIFFICULTY_BOT_SKILL_LEVELS: Record<Difficulty, [BotSkillLevel, BotSkillLevel, BotSkillLevel]> = {
  easy: ["novice", "advanced", "advanced"],
  moderate: ["advanced", "advanced", "expert"],
  hard: ["expert", "expert", "expert"],
};

// MIN_BOT_THINK_TIME/MAX_BOT_THINK_TIME bound the random pause used to
// simulate a bot thinking before it decides, in milliseconds.
export const MIN_BOT_THINK_TIME = 500;
export const MAX_BOT_THINK_TIME = 2000;

// DEAL_ANIMATION_DELAY is the pause, in milliseconds, between each
// card dealt during the round-start dealing animation. With all four
// seats active that's 15 cards (12 hand + 3 pot), so ~75ms lands the
// whole animation a bit over one second; it's proportionally shorter
// with fewer seats active.
export const DEAL_ANIMATION_DELAY = 75;

// STRIKE_HIGHLIGHT_BLINK_INTERVAL is the number of milliseconds each
// on/off phase of the end-of-round red strike highlight is shown
// before toggling.
export const STRIKE_HIGHLIGHT_BLINK_INTERVAL = 400;

// TRADE_ANIMATION_DURATION is the total time, in milliseconds, for one
// card's trade animation: sliding from hand to pot, then the pot's
// card sliding back, split evenly across the two legs. Exchanging a
// whole hand plays this animation three times in sequence (once per
// card), not once for all three.
export const TRADE_ANIMATION_DURATION = 500;

// KNOCK_SOUND_WAIT is how long, in milliseconds, the turn pauses after
// a knock before advancing to the next seat: knock.wav's own ~256ms
// runtime plus a short pause after, so the knock sound is never cut
// off or overlapped by the next seat's turn sound.
export const KNOCK_SOUND_WAIT = 256 + 200;

// ROUND_END_PAUSE is how long, in milliseconds, the round-end recap
// is shown before the next round starts automatically (clicking the
// round-end button ends the pause early).
export const ROUND_END_PAUSE = 6000;
