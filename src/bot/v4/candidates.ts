// Trade candidate generation and sorting for the bot strategies
// described in specs/bots_v4.md, plus the small pure helpers (suit
// shape, ranged/percentage rolls) those strategies need. Kept
// self-contained from src/bot/v3/helpers.ts -- v3 and v4 are
// independent strategy generations, not layers on a shared base.

import type { Card } from "../../card/card.ts";
import { score } from "../../card/score.ts";
import type { Hand, PlayerView, Pot } from "../../game/types.ts";
import type { Rng } from "../../rng.ts";

// CandidateMetrics selects which of specs/bots_v4.md's Trade
// Candidates metrics a skill level evaluates -- danger and pairs are
// forced to 0 for a disabled metric rather than computed.
export interface CandidateMetrics {
  danger: boolean;
  pairs: boolean;
}

// TradeCandidate is one of the nine possible pot-card/hand-card swaps,
// with the metrics specs/bots_v4.md's Trade Candidates section sorts
// on.
export interface TradeCandidate {
  potIdx: number;
  handIdx: number;
  handScore: number;
  dangerScore: number;
  potScore: number;
  pairs: number;
  random: number;
}

// dangerScoreFor implements specs/bots_v4.md's Danger score tiers for
// the pot resulting from a trade: the most severe applicable tier
// wins, from 5 (pot would score 31, an instant win for whoever takes
// it next) down to 0 (no special consideration).
function dangerScoreFor(potScore: number, givenCard: Card): number {
  if (potScore === 31) {
    return 5;
  }
  if (potScore === 32) {
    return 4;
  }
  if (potScore === 30.5) {
    return 3;
  }
  if (potScore >= 27) {
    return 2;
  }
  if (givenCard.rank === "A") {
    return 1;
  }
  return 0;
}

// hasPair reports whether any two of a hand's three cards share a rank.
function hasPair(hand: Hand): boolean {
  const [a, b, c] = hand;
  return a.rank === b.rank || b.rank === c.rank || a.rank === c.rank;
}

// tradeCandidates enumerates all nine pot/hand swaps, in pot-major/
// hand-minor order, per specs/bots_v4.md's "each card in the hand can
// be traded with any three cards in the pot making nine". metrics
// gates Danger score and Pairs per specs/bots_v4.md's Improve Hand
// per-skill breakdown -- a disabled metric is forced to 0 rather than
// computed.
export function tradeCandidates(v: PlayerView, rng: Rng, metrics: CandidateMetrics): TradeCandidate[] {
  const candidates: TradeCandidate[] = [];
  for (let potIdx = 0; potIdx < 3; potIdx++) {
    for (let handIdx = 0; handIdx < 3; handIdx++) {
      const hand = [...v.hand] as Hand;
      const pot = [...v.pot] as Pot;
      const potCard = v.pot[potIdx] as Card;
      const handCard = v.hand[handIdx] as Card;
      hand[handIdx] = potCard;
      pot[potIdx] = handCard;
      const potScoreAfter = score(pot);
      candidates.push({
        potIdx,
        handIdx,
        handScore: score(hand),
        dangerScore: metrics.danger ? dangerScoreFor(potScoreAfter, handCard) : 0,
        potScore: potScoreAfter,
        pairs: metrics.pairs ? (hasPair(hand) ? 1 : 0) : 0,
        random: rng.next(),
      });
    }
  }
  return candidates;
}

// sortCandidates orders candidates best-first, per specs/bots_v4.md:
// handScore, pairs, and random sort with higher values first; potScore
// and dangerScore sort with lower values first (dangerScore is a risk
// scale -- 0 is safest, 5 is worst).
export function sortCandidates(candidates: readonly TradeCandidate[]): TradeCandidate[] {
  return [...candidates].sort(
    (a, b) =>
      b.handScore - a.handScore ||
      a.dangerScore - b.dangerScore ||
      a.potScore - b.potScore ||
      b.pairs - a.pairs ||
      b.random - a.random,
  );
}

// excludeDangerous drops candidates scoring danger 4 or 5, per
// specs/bots_v4.md's Heads Up strategy -- those trades would leave
// the pot at 31 or 32, letting the sole remaining opponent win the
// round immediately. No-op for Novice, whose danger score is always
// forced to zero.
export function excludeDangerous(candidates: readonly TradeCandidate[]): TradeCandidate[] {
  return candidates.filter((c) => c.dangerScore < 4);
}

// forcedTradePool applies excludeDangerous for a phase that must pick
// something no matter what (Discard's forced trade): the danger-4/5
// exclusion is dropped -- and fellBack reports true -- when it would
// otherwise leave nothing to choose from.
export function forcedTradePool(candidates: readonly TradeCandidate[]): { pool: TradeCandidate[]; fellBack: boolean } {
  const safe = excludeDangerous(candidates);
  return safe.length > 0 ? { pool: safe, fellBack: false } : { pool: [...candidates], fellBack: true };
}

// allDifferentSuits reports whether a hand's three cards each belong
// to a distinct suit -- the weakest possible hand shape, since no two
// cards can share a suit to sum together (specs/bots_v4.md, Expert's
// Hand Selection rule).
export function allDifferentSuits(hand: Hand): boolean {
  return new Set(hand.map((c) => c.suit)).size === 3;
}

// randInt returns a pseudo-random integer in [lo, hi], inclusive, per
// specs/bots_v4.md's "[18-20]" notation.
export function randInt(rng: Rng, lo: number, hi: number): number {
  return lo + rng.intn(hi - lo + 1);
}

// chance reports true with the given probability (0-1), per
// specs/bots_v4.md's Mistake phase.
export function chance(rng: Rng, probability: number): boolean {
  return rng.next() < probability;
}
