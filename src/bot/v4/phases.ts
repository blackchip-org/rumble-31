// Decision phases shared by the v4 bot strategies, per specs/bots_v4.md's
// Phases section. Each phase takes a PlayerView (and whatever it needs
// to decide) and returns Action | undefined -- undefined meaning the
// phase doesn't act, so the strategy should fall through to its next
// phase -- except Hand Selection and Discard, which always return an
// Action.

import type { Card } from "../../card/card.ts";
import { cardToString } from "../../card/card.ts";
import { score } from "../../card/score.ts";
import type { Action, Hand, PlayerView } from "../../game/types.ts";
import { exchange, knock, trade } from "../../game/types.ts";
import type { Rng } from "../../rng.ts";
import { allDifferentSuits, chance, sortCandidates, tradeCandidates, type CandidateMetrics, type TradeCandidate } from "./candidates.ts";
import { record, recordAction, type Trace } from "./trace.ts";

// mistakePhase rolls once per decide() call, per specs/bots_v4.md's
// Mistake section: whether this turn has a mistake at all. Which
// decision point it lands on is a separate, per-strategy choice (see
// strategies.ts) made uniformly among that turn's strategy's points.
// mistakePhase never itself produces the turn's action (see
// specs/bots_v4.md's Decision Logging), so it only ever records a
// fell-through trace entry.
export function mistakePhase(rng: Rng, mistakeChance: number, trace?: Trace): boolean {
  const mistake = chance(rng, mistakeChance);
  record(trace, "Mistake", mistake ? "mistake made" : `no mistake (chance ${mistakeChance})`);
  return mistake;
}

// PhaseMode is how a mistake (see mistakePhase/specs/bots_v4.md's
// Mistake section) affects one of improveHandPhase/knockPhase/
// discardPhase on a given turn: "normal" (no mistake, or the mistake
// landed elsewhere), "mistake" (this phase is this turn's chosen
// mistake site -- it applies its own mistake behavior, documented on
// each phase below, instead of its normal decision), or "skipped"
// (this phase sits before the chosen site and is forced to fall
// through unconditionally, so the site is always reached).
export type PhaseMode = "normal" | "mistake" | "skipped";

// handSelectionPhase implements specs/bots_v4.md's Hand Selection
// phase: only called on the round's first turn. skillRule is the
// per-skill-level "should I exchange" rule (see strategies.ts), given
// both the hand and the rng since Novice's rule is now a random roll
// rather than a function of the hand. With a mistake, it's consumed
// and the opposite of Expert's own rule (allDifferentSuits) is chosen
// instead, regardless of skillRule.
export function handSelectionPhase(v: PlayerView, mistake: boolean, rng: Rng, skillRule: (hand: Hand, rng: Rng) => boolean, trace?: Trace): Action {
  if (mistake) {
    const exchanging = !allDifferentSuits(v.hand);
    const label = exchanging ? "exchange for pot" : "keeps hand";
    recordAction(trace, "Hand Selection", `mistake -- ${label}`, label);
    return exchanging ? exchange() : knock();
  }
  const exchanging = skillRule(v.hand, rng);
  const label = `${exchanging ? "exchange for pot" : "keeps hand"} (hand score ${score(v.hand)})`;
  recordAction(trace, "Hand Selection", label, label);
  return exchanging ? exchange() : knock();
}

// candidateLine formats one TradeCandidate as specs/bots_v4.md's
// Decision Logging ranked-candidate-list line: the hand card leaving
// and pot card arriving, then its metrics in "Trade Candidates" order.
function candidateLine(v: PlayerView, c: TradeCandidate): string {
  const given = cardToString(v.hand[c.handIdx] as Card);
  const taken = cardToString(v.pot[c.potIdx] as Card);
  return `  [${given}]->[${taken}]: hand ${c.handScore}, danger ${c.dangerScore}, pot ${c.potScore}, pairs ${c.pairs}`;
}

// improveHandPhase implements specs/bots_v4.md's Improve Hand phase:
// trade candidates that don't improve the hand are discarded; if
// taking the whole pot beats both the hand's own score and the best
// remaining candidate's resulting hand score, and the pot itself is
// worth exchanging for (score >= the skill level's potExchangeThreshold,
// see SkillConfig in strategies.ts), exchange. Otherwise take the top
// remaining candidate, if any. Returns undefined if nothing here
// improves the hand.
//
// mode "skipped" forces a fall-through without evaluating anything
// (this phase sits before this turn's mistake site). mode "mistake"
// (this phase is the site) ignores the pot-exchange check entirely and
// picks uniformly at random among the same improving candidates
// instead of the top one; with no improving candidates to pick from,
// it falls through same as normal.
export function improveHandPhase(v: PlayerView, rng: Rng, potExchangeThreshold: number, metrics: CandidateMetrics, mode: PhaseMode = "normal", trace?: Trace): Action | undefined {
  if (mode === "skipped") {
    record(trace, "Improve Hand", "skipped (mistake happens at a later phase this turn)");
    return undefined;
  }

  const handScore = score(v.hand);
  const improving = sortCandidates(tradeCandidates(v, rng, metrics).filter((c) => c.handScore > handScore));

  if (mode === "mistake") {
    if (improving.length === 0) {
      record(trace, "Improve Hand", "mistake -- no improving candidate to pick from, falls through");
      return undefined;
    }
    record(trace, "Improve Hand", "candidates ranked --");
    for (const c of improving) {
      record(trace, "Improve Hand", candidateLine(v, c));
    }
    const pick = improving[rng.intn(improving.length)] as TradeCandidate;
    const given = cardToString(v.hand[pick.handIdx] as Card);
    const taken = cardToString(v.pot[pick.potIdx] as Card);
    const detail = `mistake -- trades [${given}] for [${taken}]`;
    recordAction(trace, "Improve Hand", detail, `trades [${given}] for [${taken}] (hand ${handScore} -> ${pick.handScore})`);
    return trade(pick.potIdx, pick.handIdx);
  }

  const potScore = score(v.pot);
  const bestCandidateHandScore = improving.length > 0 ? (improving[0] as TradeCandidate).handScore : -Infinity;
  const potBeatsAll = potScore > handScore && potScore > bestCandidateHandScore;

  if (potBeatsAll && potScore >= potExchangeThreshold) {
    const msg = `exchange for pot (pot score ${potScore})`;
    recordAction(trace, "Improve Hand", msg, msg);
    return exchange();
  }
  if (potBeatsAll) {
    record(trace, "Improve Hand", `pot exchange not eligible (pot score ${potScore} < ${potExchangeThreshold})`);
  }
  if (improving.length > 0) {
    record(trace, "Improve Hand", "candidates ranked --");
    for (const c of improving) {
      record(trace, "Improve Hand", candidateLine(v, c));
    }
    const top = improving[0] as TradeCandidate;
    const given = cardToString(v.hand[top.handIdx] as Card);
    const taken = cardToString(v.pot[top.potIdx] as Card);
    const detail = `trades [${given}] for [${taken}]`;
    recordAction(trace, "Improve Hand", detail, `${detail} (hand ${handScore} -> ${top.handScore})`);
    return trade(top.potIdx, top.handIdx);
  }
  record(trace, "Improve Hand", "no improving trade or pot exchange");
  return undefined;
}

// BestScoreState is a bot's own "best score seen this round, and how
// many turns in a row it's been stuck there" tracking, per
// specs/bots_v4.md's Knock phase: reset at the start of every round,
// then updated at the end of every turn (see updateBestScore) --
// knockPhase's repeat-counter bullet reads it to force a knock once a
// bot's hand has stopped improving.
export interface BestScoreState {
  score: number;
  repeatCount: number;
}

// resultingScore returns the score the hand would have after taking
// action, without mutating v.
export function resultingScore(v: PlayerView, action: Action): number {
  if (action.type === "knock") {
    return score(v.hand);
  }
  if (action.type === "exchange") {
    return score(v.pot);
  }
  const hand = [...v.hand] as Hand;
  hand[action.handIndex] = v.pot[action.potIndex] as Card;
  return score(hand);
}

// updateBestScore implements specs/bots_v4.md's end-of-turn Knock
// phase bookkeeping: a new-best resulting score resets the repeat
// counter to zero; a resulting score tying the existing best
// increments it; a resulting score below the existing best leaves
// both untouched (a forced Discard trade can lower the hand's score,
// but that's not itself a new plateau worth counting).
export function updateBestScore(best: BestScoreState, newScore: number): BestScoreState {
  if (newScore > best.score) {
    return { score: newScore, repeatCount: 0 };
  }
  if (newScore === best.score) {
    return { score: best.score, repeatCount: best.repeatCount + 1 };
  }
  return best;
}

// knockPhase implements specs/bots_v4.md's Knock phase: knock once the
// repeat counter (how many turns in a row the hand's score has been
// stuck at its best) reaches the skill level's threshold, else once
// the hand score itself reaches the skill level's knock threshold,
// else once the round's current lap reaches the round's randomized
// failsafe lap (drawn once per round -- see specs/bots_v4.md's
// "knock on lap 10 + rand(3)") -- guaranteeing a bot eventually
// knocks even if its hand never improves, so a round can't run
// forever with no bot willing to end it.
//
// mode "skipped" forces a fall-through without evaluating anything
// (this phase sits before this turn's mistake site). mode "mistake"
// (this phase is the site) never knocks, regardless of whether any of
// the above conditions are met.
export function knockPhase(v: PlayerView, best: BestScoreState, knockRepeatThreshold: number, knockScoreThreshold: number, failsafeLap: number, mode: PhaseMode = "normal", trace?: Trace): Action | undefined {
  if (mode === "skipped") {
    record(trace, "Knock", "skipped (mistake happens at a later phase this turn)");
    return undefined;
  }
  if (mode === "mistake") {
    record(trace, "Knock", "mistake -- fails to knock");
    return undefined;
  }
  if (best.repeatCount >= knockRepeatThreshold) {
    const msg = `knocks (repeat counter ${best.repeatCount} >= ${knockRepeatThreshold})`;
    recordAction(trace, "Knock", msg, msg);
    return knock();
  }
  const handScore = score(v.hand);
  if (handScore >= knockScoreThreshold) {
    const msg = `knocks (hand score ${handScore} >= ${knockScoreThreshold})`;
    recordAction(trace, "Knock", msg, msg);
    return knock();
  }
  if (v.lap >= failsafeLap) {
    const msg = `knocks (failsafe lap ${failsafeLap})`;
    recordAction(trace, "Knock", msg, msg);
    return knock();
  }
  record(trace, "Knock", `repeat counter ${best.repeatCount} < ${knockRepeatThreshold}, hand score ${handScore} < ${knockScoreThreshold}`);
  return undefined;
}

// alwaysKnockPhase implements the Knocked strategy's final phase: with
// nothing left to improve the hand, knock unconditionally.
export function alwaysKnockPhase(trace?: Trace): Action {
  recordAction(trace, "Always Knock", "knocks", "knocks");
  return knock();
}

// discardPhase implements specs/bots_v4.md's Discard phase: a trade is
// forced, so take the topmost (best-sorted) of all nine candidates,
// unfiltered.
//
// mode "mistake" (this phase is the site) picks uniformly at random
// from all nine instead of the topmost one -- Discard is always
// reached with a forced trade to make, so unlike Improve Hand/Knock it
// has no "skipped" mode and its mistake always has candidates to pick
// from.
export function discardPhase(v: PlayerView, rng: Rng, metrics: CandidateMetrics, mode: PhaseMode = "normal", trace?: Trace): Action {
  const sorted = sortCandidates(tradeCandidates(v, rng, metrics));
  record(trace, "Discard", "candidates ranked --");
  for (const c of sorted) {
    record(trace, "Discard", candidateLine(v, c));
  }
  const chosen = mode === "mistake" ? (sorted[rng.intn(sorted.length)] as TradeCandidate) : (sorted[0] as TradeCandidate);
  const given = cardToString(v.hand[chosen.handIdx] as Card);
  const taken = cardToString(v.pot[chosen.potIdx] as Card);
  const detail = mode === "mistake" ? `mistake -- trades [${given}] for [${taken}]` : `trades [${given}] for [${taken}]`;
  const summary = `trades [${given}] for [${taken}]`;
  recordAction(trace, "Discard", detail, summary);
  return trade(chosen.potIdx, chosen.handIdx);
}
