// Shared logic for the bot strategies described in specs/bots.md: swap
// enumeration, knock-threshold constants, and the public-turn replay
// used to track opponents' known-held cards.

import type { Card } from "../card/card.ts";
import { score } from "../card/score.ts";
import type { Action, PlayerView, PublicTurn } from "../game/types.ts";
import { trade } from "../game/types.ts";

export const KNOCK_SCORE_THRESHOLD = 25;
export const KNOCK_TURN_LIMIT = 20;
export const NO_IMPROVE_KNOCK_STREAK = 4;
// INSTANT_KNOCK_SCORE is the lower of the two highest attainable scores
// (31, three-of-a-kind aces at 32 being the other) — at or above it, no
// swap can improve the hand further, so there's nothing to wait for.
export const INSTANT_KNOCK_SCORE = 31;

export interface CandidateSwap {
  potIdx: number;
  handIdx: number;
  score: number;
}

// candidateSwaps enumerates the resulting hand score for every possible
// pot/hand card swap, in pot-major/hand-minor order.
export function candidateSwaps(v: PlayerView): CandidateSwap[] {
  const swaps: CandidateSwap[] = [];
  for (let potIdx = 0; potIdx < 3; potIdx++) {
    for (let handIdx = 0; handIdx < 3; handIdx++) {
      const hand = [...v.hand] as [Card, Card, Card];
      hand[handIdx] = v.pot[potIdx] as Card;
      swaps.push({ potIdx, handIdx, score: score(hand) });
    }
  }
  return swaps;
}

// bestSwaps returns every candidate swap tied for the highest resulting
// score, in candidateSwaps' order.
export function bestSwaps(v: PlayerView): CandidateSwap[] {
  const swaps = candidateSwaps(v);
  const best = Math.max(...swaps.map((s) => s.score));
  return swaps.filter((s) => s.score === best);
}

// bestExchange returns the Trade action that yields the highest-scoring
// hand among all pot/hand card swaps, breaking ties toward the lowest
// (potIdx, handIdx) pair.
export function bestExchange(v: PlayerView): Action {
  const best = bestSwaps(v)[0] as CandidateSwap;
  return trade(best.potIdx, best.handIdx);
}

// applyPublicTurn updates held — a per-seat map of the cards currently
// known to be in that seat's hand — with a newly-observed PublicTurn:
// each given card is removed (if it was known) and each taken card is
// added. A knock changes nothing; an exchange's given/taken always
// cover the seat's entire hand, so this naturally leaves exactly the 3
// taken cards known regardless of what was known before.
//
// held.get(seat)?.length === 3 is exactly "this seat's hand is fully
// known" — not a turn-count heuristic, since a seat can re-trade the
// same hand slot indefinitely without ever revealing the other two.
export function applyPublicTurn(held: Map<number, Card[]>, turn: PublicTurn): void {
  let cards = held.get(turn.seat) ?? [];
  for (const given of turn.given) {
    cards = cards.filter((c) => !(c.rank === given.rank && c.suit === given.suit));
  }
  cards = [...cards, ...turn.taken];
  held.set(turn.seat, cards);
}
