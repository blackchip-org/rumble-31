// Strategy selection and per-skill-level configuration for the v4 bots,
// per specs/bots_v4.md's Strategies and Hand Selection sections.

import { score } from "../../card/score.ts";
import type { Action, Hand, PlayerView } from "../../game/types.ts";
import type { Rng } from "../../rng.ts";
import { allDifferentSuits, chance, type CandidateMetrics } from "./candidates.ts";
import { alwaysKnockPhase, discardPhase, handSelectionPhase, improveHandPhase, knockPhase, mistakePhase, type BestScoreState, type PhaseMode } from "./phases.ts";
import type { Trace } from "./trace.ts";

// SkillConfig is what differs between skill levels right now:
// specs/bots_v4.md's per-turn Mistake chance, the Hand Selection rule
// (whether to exchange for the pot on the round's first turn), the
// Improve Hand phase's pot exchange threshold (the minimum pot score
// worth exchanging the whole hand for), which Trade Candidates metrics
// (Danger score, Pairs) that phase's candidates evaluate, and the
// Knock phase's repeat-counter and hand-score thresholds.
// handSelection takes the rng too since Novice's rule is now a random
// roll rather than a function of the hand.
export interface SkillConfig {
  mistakeChance: number;
  handSelection: (hand: Hand, rng: Rng) => boolean;
  potExchangeThreshold: number;
  candidateMetrics: CandidateMetrics;
  knockRepeatThreshold: number;
  knockScoreThreshold: number;
}

// SKILL_CONFIGS holds each skill level's Mistake chance, Hand Selection
// rule, Improve Hand pot exchange threshold, candidate metrics, and
// Knock phase thresholds, per specs/bots_v4.md.
export const SKILL_CONFIGS: Record<"novice" | "advanced" | "expert", SkillConfig> = {
  novice: {
    mistakeChance: 0.2,
    handSelection: (hand, rng) => score(hand) < 28 && chance(rng, 0.25),
    potExchangeThreshold: 28,
    candidateMetrics: { danger: false, pairs: false },
    knockRepeatThreshold: 2,
    knockScoreThreshold: 27,
  },
  advanced: {
    mistakeChance: 0.05,
    handSelection: (hand) => allDifferentSuits(hand),
    potExchangeThreshold: 27,
    candidateMetrics: { danger: true, pairs: false },
    knockRepeatThreshold: 3,
    knockScoreThreshold: 26,
  },
  expert: {
    mistakeChance: 0,
    handSelection: (hand) => score(hand) <= 16,
    potExchangeThreshold: 26,
    candidateMetrics: { danger: true, pairs: true },
    knockRepeatThreshold: 5,
    knockScoreThreshold: 25,
  },
};

// firstStrategy implements specs/bots_v4.md's First strategy: Mistake,
// Hand Selection. Hand Selection is First's only decision point, so a
// mistake (if any) always lands there.
function firstStrategy(v: PlayerView, mistake: boolean, rng: Rng, cfg: SkillConfig, trace?: Trace): Action {
  return handSelectionPhase(v, mistake, rng, cfg.handSelection, trace);
}

// mistakeSiteModes implements specs/bots_v4.md's Mistake section's
// site selection: when mistake is true, it picks a site uniformly
// among pointCount decision points and returns each point's PhaseMode
// in strategy order -- "skipped" before the site, "mistake" at the
// site, "normal" after it -- so every point before the chosen one
// falls through regardless of what it would have normally decided and
// the site is always reached. When mistake is false, every point is
// "normal". Always draws from rng when mistake is true, even for a
// single-point strategy (Knocked's Improve Hand), so the rng stream
// doesn't vary by how many points a strategy has.
function mistakeSiteModes(rng: Rng, mistake: boolean, pointCount: number): PhaseMode[] {
  if (!mistake) {
    return new Array<PhaseMode>(pointCount).fill("normal");
  }
  const site = rng.intn(pointCount);
  return Array.from({ length: pointCount }, (_, i) => (i < site ? "skipped" : i === site ? "mistake" : "normal"));
}

// standardStrategy implements specs/bots_v4.md's Standard strategy
// (2-3 opponents remain): Mistake, Improve Hand, Knock, Discard.
function standardStrategy(v: PlayerView, mistake: boolean, rng: Rng, cfg: SkillConfig, best: BestScoreState, failsafeLap: number, trace?: Trace): Action {
  const [improveMode, knockMode, discardMode] = mistakeSiteModes(rng, mistake, 3) as [PhaseMode, PhaseMode, PhaseMode];
  return (
    improveHandPhase(v, rng, cfg.potExchangeThreshold, cfg.candidateMetrics, improveMode, trace) ??
    knockPhase(v, best, cfg.knockRepeatThreshold, cfg.knockScoreThreshold, failsafeLap, knockMode, trace) ??
    discardPhase(v, rng, cfg.candidateMetrics, discardMode, trace)
  );
}

// headsUpStrategy implements specs/bots_v4.md's Heads Up strategy (1
// opponent remains): Mistake, Improve Hand, Knock, Discard. Currently
// identical to standardStrategy -- kept as its own function since the
// spec models these as distinct strategies expected to diverge later.
function headsUpStrategy(v: PlayerView, mistake: boolean, rng: Rng, cfg: SkillConfig, best: BestScoreState, failsafeLap: number, trace?: Trace): Action {
  const [improveMode, knockMode, discardMode] = mistakeSiteModes(rng, mistake, 3) as [PhaseMode, PhaseMode, PhaseMode];
  return (
    improveHandPhase(v, rng, cfg.potExchangeThreshold, cfg.candidateMetrics, improveMode, trace) ??
    knockPhase(v, best, cfg.knockRepeatThreshold, cfg.knockScoreThreshold, failsafeLap, knockMode, trace) ??
    discardPhase(v, rng, cfg.candidateMetrics, discardMode, trace)
  );
}

// knockedStrategy implements specs/bots_v4.md's Knocked strategy
// (another player has already knocked): Mistake, Improve Hand, Always
// Knock. Improve Hand is Knocked's only mistake-eligible point --
// Always Knock never hosts a mistake, since there's no wrong way to
// unconditionally knock.
function knockedStrategy(v: PlayerView, mistake: boolean, rng: Rng, cfg: SkillConfig, trace?: Trace): Action {
  const [improveMode] = mistakeSiteModes(rng, mistake, 1) as [PhaseMode];
  return improveHandPhase(v, rng, cfg.potExchangeThreshold, cfg.candidateMetrics, improveMode, trace) ?? alwaysKnockPhase(trace);
}

// decideV4 picks and runs the strategy for the current turn, per
// specs/bots_v4.md's Strategies section: First on the round's own
// first turn, Knocked once another player has knocked, Heads Up with
// exactly one opponent remaining, Standard otherwise. Mistake is
// rolled once per turn regardless of which strategy runs, matching
// every strategy listing it as their first phase; which of that
// strategy's points the mistake actually lands on is then chosen
// uniformly by each strategy function itself (see mistakeSiteModes).
// best and failsafeLap are the bot's own end-of-turn Knock phase
// bookkeeping (see phases.ts:BestScoreState/updateBestScore), owned
// and updated by the caller (factory.ts) -- decideV4 only reads them.
// trace, if given, collects this call's decision trace (specs/
// bots_v4.md's Decision Logging).
export function decideV4(v: PlayerView, rng: Rng, cfg: SkillConfig, best: BestScoreState, failsafeLap: number, trace?: Trace): Action {
  const mistake = mistakePhase(rng, cfg.mistakeChance, trace);

  if (v.isFirstTurnOfRound) {
    return firstStrategy(v, mistake, rng, cfg, trace);
  }
  if (v.isLastTurn) {
    return knockedStrategy(v, mistake, rng, cfg, trace);
  }
  if (v.opponentCount === 1) {
    return headsUpStrategy(v, mistake, rng, cfg, best, failsafeLap, trace);
  }
  return standardStrategy(v, mistake, rng, cfg, best, failsafeLap, trace);
}
