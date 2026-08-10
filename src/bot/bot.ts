import type { Card } from "../card/card.ts";
import { sameSuit, score, sum } from "../card/score.ts";
import type { Action, PlayerView, Strategy } from "../game/types.ts";
import { exchange, knock, trade } from "../game/types.ts";

// Bot implements the basic Rumble-31 bot strategy described in
// specs/bots.md. A Bot carries state across turns (its own score
// history) and is free to be reused across multiple rounds — e.g. for
// the whole of a Game, where it keeps accumulating that tracking from
// one round to the next.
export class Bot implements Strategy {
  lastScore: number;
  hasLastScore: boolean;
  noImproveStreak: number;

  constructor(init?: { lastScore?: number; hasLastScore?: boolean; noImproveStreak?: number }) {
    this.lastScore = init?.lastScore ?? 0;
    this.hasLastScore = init?.hasLastScore ?? false;
    this.noImproveStreak = init?.noImproveStreak ?? 0;
  }

  decide(v: PlayerView): Action {
    const s = score(v.hand);

    if (v.isFirstTurnOfRound) {
      if (sameSuit(v.pot) && sum(v.pot) > s) {
        return exchange();
      }
      return bestExchange(v);
    }

    if (s <= this.lastScore && this.hasLastScore) {
      this.noImproveStreak++;
    } else {
      this.noImproveStreak = 0;
    }
    this.lastScore = s;
    this.hasLastScore = true;

    if (v.ownTurnNumber >= 20) {
      return knock();
    }
    if (s > 25) {
      return knock();
    }
    if (this.noImproveStreak >= 4) {
      return knock();
    }
    return bestExchange(v);
  }
}

// bestExchange returns the Trade action that yields the highest-scoring
// hand among all pot/hand card swaps.
export function bestExchange(v: PlayerView): Action {
  let bestPotIdx = 0;
  let bestHandIdx = 0;
  let bestScore = -1;
  for (let potIdx = 0; potIdx < 3; potIdx++) {
    for (let handIdx = 0; handIdx < 3; handIdx++) {
      const hand = [...v.hand] as [Card, Card, Card];
      hand[handIdx] = v.pot[potIdx] as Card;
      const s = score(hand);
      if (s > bestScore) {
        bestScore = s;
        bestPotIdx = potIdx;
        bestHandIdx = handIdx;
      }
    }
  }
  return trade(bestPotIdx, bestHandIdx);
}
