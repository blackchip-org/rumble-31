// Win probability estimation for the v4 Expert bot's Knock phase, per
// specs/bots_v4.md's "Win Probability" section: for each active
// opponent, independently estimate the probability of beating them
// (their best reply to the live pot loses to the bot's current hand
// score), then combine as 1 - product(1 - beatProbability) -- the
// probability of not being beaten by every opponent at once, which is
// what avoiding a strike actually requires (specs/rules.md).

import type { Card } from "../../card/card.ts";
import { cardToString } from "../../card/card.ts";
import { newDeck } from "../../card/deck.ts";
import { score } from "../../card/score.ts";
import type { Hand, PlayerView, Pot } from "../../game/types.ts";
import type { OpponentTracker } from "./opponentTracking.ts";

// bestResponseScore is the best score a hand can reach against the
// live pot in one turn: keeping the hand as-is, each of the nine
// single-card trades, or exchanging for the whole pot -- the same
// options any bot's own turn considers.
function bestResponseScore(hand: readonly Card[], pot: readonly Card[]): number {
  let best = Math.max(score(hand as Hand), score(pot as Pot));
  for (let h = 0; h < 3; h++) {
    for (let p = 0; p < 3; p++) {
      const next = [...hand] as Hand;
      next[h] = pot[p] as Card;
      best = Math.max(best, score(next));
    }
  }
  return best;
}

// combinations enumerates every unordered k-card subset of pool.
function* combinations(pool: readonly Card[], k: number): Generator<Card[]> {
  if (k === 0) {
    yield [];
    return;
  }
  if (pool.length < k) {
    return;
  }
  const [first, ...rest] = pool as [Card, ...Card[]];
  for (const combo of combinations(rest, k - 1)) {
    yield [first, ...combo];
  }
  yield* combinations(rest, k);
}

// beatProbability estimates the chance of beating one opponent: the
// fraction of every possibility for their unknown slots (filled from
// pool) whose best reply to pot scores lower than myScore. Exact, not
// sampled -- with at most 3 unknown cards drawn from a ~24-26 card
// pool, the largest case is a few thousand combinations, cheap enough
// to always enumerate directly (see specs/bots_v4.md's Win
// Probability section).
function beatProbability(myScore: number, pot: readonly Card[], known: readonly Card[], pool: readonly Card[]): number {
  const need = 3 - known.length;
  let total = 0;
  let wins = 0;
  for (const combo of combinations(pool, need)) {
    total++;
    if (bestResponseScore([...known, ...combo], pot) < myScore) {
      wins++;
    }
  }
  return total > 0 ? wins / total : 1;
}

// estimateWinProbability implements specs/bots_v4.md's Win
// Probability section. myScore is the hand score knocking would lock
// in (the bot's current hand, no further trade). tracker holds
// whatever's been deduced about opponents seen acting so far this
// round (specs/bots_v4.md's Opponent Tracking); an opponent v counts
// via opponentCount but tracker has no entry for (not yet observed
// acting this round) is treated the same as one with an entry but
// nothing known -- fully unknown, 3 unknown slots.
export function estimateWinProbability(v: PlayerView, myScore: number, tracker: OpponentTracker): number {
  const excluded = new Set<string>();
  excluded.add(cardToString(v.hand[0] as Card));
  excluded.add(cardToString(v.hand[1] as Card));
  excluded.add(cardToString(v.hand[2] as Card));
  for (const c of v.pot) {
    excluded.add(cardToString(c));
  }

  const knownPerOpponent: Card[][] = [];
  for (const [seat, known] of tracker) {
    if (seat === v.seat) {
      continue;
    }
    for (const c of known) {
      excluded.add(cardToString(c));
    }
    knownPerOpponent.push(known);
  }
  for (let i = knownPerOpponent.length; i < v.opponentCount; i++) {
    knownPerOpponent.push([]); // not yet observed acting this round -- fully unknown
  }

  const pool = newDeck().filter((c) => !excluded.has(cardToString(c)));

  let productOfLosses = 1;
  for (const known of knownPerOpponent) {
    productOfLosses *= 1 - beatProbability(myScore, v.pot, known, pool);
  }
  return 1 - productOfLosses;
}
