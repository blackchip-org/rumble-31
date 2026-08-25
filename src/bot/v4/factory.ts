// Skill-level -> Strategy construction for the v4 bots, per
// specs/bots_v4.md. Mirrors src/bot/v3/factory.ts's shape so this is a
// drop-in replacement once v4 is wired into the simulator/web GUI --
// unlike v3's bots, nothing here tracks turn history or opponent
// hands, so a single Strategy (parameterized by SkillConfig) covers
// all three skill levels instead of three separate classes; it does
// need per-round instance state now, though, for the Knock phase's
// best-score/repeat-counter tracking and its once-per-round failsafe
// lap (specs/bots_v4.md's Knock phase).

import { randInt } from "./candidates.ts";
import { resultingScore, updateBestScore, type BestScoreState } from "./phases.ts";
import type { DecisionTraceEntry, Strategy } from "../../game/types.ts";
import { Rng } from "../../rng.ts";
import { decideV4, SKILL_CONFIGS } from "./strategies.ts";
import type { LogDetail } from "./trace.ts";

export const BOT_SKILL_LEVELS = ["novice", "advanced", "expert"] as const;
export type BotSkillLevel = (typeof BOT_SKILL_LEVELS)[number];

// FAILSAFE_LAP_RANGE is the [lo-hi] range specs/bots_v4.md's Knock
// phase failsafe ("knock on lap 10 + rand(3)") draws from, once per
// round.
const FAILSAFE_LAP_RANGE: [number, number] = [10, 13];

// BotState is a v4 bot's own round-scoped Knock bookkeeping (specs/
// bots_v4.md's Knock phase): its best score seen this round, repeat
// counter, and randomized failsafe lap. Unlike v3's BotMemory, this
// doesn't persist across rounds -- onRoundStart always resets it -- it
// exists purely so a mid-round page reload (specs/state.md) can
// restore a bot to exactly where its Knock bookkeeping stood, via
// createBot's state param and snapshotBot below.
export interface BotState {
  best: BestScoreState;
  failsafeLap: number;
}

// createBot returns a freshly constructed strategy for skillLevel, per
// specs/bots_v4.md. rng seeds the bot's own random decisions with an
// independent sub-seed, so a caller stays fully reproducible from its
// own seed alone. best and failsafeLap are reset/redrawn by
// onRoundStart, per specs/bots_v4.md's Knock phase; decide() updates
// best after every turn (not just ones the Knock phase itself decides)
// with the resulting hand score, mirroring src/bot/v3's own
// best-score bookkeeping. state, if given, restores a previously
// snapshotted BotState (see snapshotBot) instead of starting blank --
// e.g. to rebuild a bot across a page reload mid-round (specs/
// state.md); safe because onRoundStart never re-fires for a round
// that's merely resuming (src/game/round.ts). logDetail, if given,
// makes decide() populate the returned Strategy's lastTrace with that
// turn's decision trace (specs/bots_v4.md's Decision Logging).
export function createBot(skillLevel: BotSkillLevel, rng: Rng, state?: BotState, logDetail?: LogDetail): Strategy {
  const botRng = new Rng(rng.nextSeed());
  const cfg = SKILL_CONFIGS[skillLevel];

  let best: BestScoreState = state?.best ?? { score: 0, repeatCount: 0 };
  let failsafeLap = state?.failsafeLap ?? randInt(botRng, ...FAILSAFE_LAP_RANGE);

  const strategy: Strategy & { getState?: () => BotState } = {
    onRoundStart: () => {
      best = { score: 0, repeatCount: 0 };
      failsafeLap = randInt(botRng, ...FAILSAFE_LAP_RANGE);
    },
    decide: (view) => {
      const trace: DecisionTraceEntry[] | undefined = logDetail ? [] : undefined;
      const action = decideV4(view, botRng, cfg, best, failsafeLap, trace);
      best = updateBestScore(best, resultingScore(view, action));
      strategy.lastTrace = trace;
      return action;
    },
  };
  strategy.getState = () => ({ best, failsafeLap });
  return strategy;
}

// snapshotBot captures strategy's current round-scoped Knock
// bookkeeping as a BotState, the counterpart createBot's state param
// restores from. Only meaningful for a Strategy this module created.
export function snapshotBot(strategy: Strategy): BotState {
  return (strategy as Strategy & { getState: () => BotState }).getState();
}
