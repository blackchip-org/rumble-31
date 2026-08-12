import { sameSuit, score, sum } from "../card/score.ts";
import type { Action, PlayerView, Strategy } from "../game/types.ts";
import { exchange, knock } from "../game/types.ts";
import { bestExchange, KNOCK_SCORE_THRESHOLD, KNOCK_TURN_LIMIT, NO_IMPROVE_KNOCK_STREAK } from "./helpers.ts";

// EasyBot implements the Easy strategy described in specs/bots.md. It
// carries state across turns (its own score history) and is free to be
// reused across multiple rounds — e.g. for the whole of a Game, where
// it keeps accumulating that tracking from one round to the next.
export class EasyBot implements Strategy {
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

    if (v.ownTurnNumber >= KNOCK_TURN_LIMIT) {
      return knock();
    }
    if (s > KNOCK_SCORE_THRESHOLD) {
      return knock();
    }
    if (this.noImproveStreak >= NO_IMPROVE_KNOCK_STREAK) {
      return knock();
    }
    return bestExchange(v);
  }
}
