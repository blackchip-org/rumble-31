import type { Card, Suit } from "../card/card.ts";
import { sameSuit, score, sum } from "../card/score.ts";
import type { Action, PlayerView, PublicTurn, Strategy } from "../game/types.ts";
import { exchange, knock, trade } from "../game/types.ts";
import type { CandidateSwap } from "./helpers.ts";
import {
  applyPublicTurn,
  bestSwaps,
  INSTANT_KNOCK_SCORE,
  KNOCK_SCORE_THRESHOLD,
  KNOCK_TURN_LIMIT,
  NO_IMPROVE_KNOCK_STREAK,
} from "./helpers.ts";

// RegularBot implements the Regular strategy described in specs/bots.md:
// like EasyBot, but it tracks opponents' apparent target suit from
// public trade/exchange history and avoids feeding it back to them when
// a trade would otherwise be an even choice.
export class RegularBot implements Strategy {
  lastScore: number;
  hasLastScore: boolean;
  noImproveStreak: number;

  // held maps seat -> the cards currently known to be in that seat's
  // hand, built up via observe(). Reset every round in onRoundStart().
  private held: Map<number, Card[]>;

  constructor(init?: { lastScore?: number; hasLastScore?: boolean; noImproveStreak?: number }) {
    this.lastScore = init?.lastScore ?? 0;
    this.hasLastScore = init?.hasLastScore ?? false;
    this.noImproveStreak = init?.noImproveStreak ?? 0;
    this.held = new Map();
  }

  onRoundStart(): void {
    this.held = new Map();
  }

  observe(turn: PublicTurn): void {
    applyPublicTurn(this.held, turn);
  }

  decide(v: PlayerView): Action {
    const s = score(v.hand);

    if (v.isFirstTurnOfRound) {
      if (sameSuit(v.pot) && sum(v.pot) > s) {
        return exchange();
      }
      return this.chooseSwap(v);
    }

    if (s <= this.lastScore && this.hasLastScore) {
      this.noImproveStreak++;
    } else {
      this.noImproveStreak = 0;
    }
    this.lastScore = s;
    this.hasLastScore = true;

    if (s >= INSTANT_KNOCK_SCORE) {
      return knock();
    }
    if (s > KNOCK_SCORE_THRESHOLD) {
      return knock();
    }
    if (this.noImproveStreak >= NO_IMPROVE_KNOCK_STREAK) {
      return knock();
    }
    if (v.ownTurnNumber >= KNOCK_TURN_LIMIT) {
      return knock();
    }
    return this.chooseSwap(v);
  }

  // chooseSwap picks among the swaps tied for the highest resulting
  // score, preferring to discard a card whose suit matches the fewest
  // opponents' apparent target suit (the suit(s) tied for most common
  // among that opponent's known-held cards). Remaining ties keep
  // candidateSwaps' order, same as bestExchange.
  private chooseSwap(v: PlayerView): Action {
    const tied = bestSwaps(v);
    if (tied.length === 1) {
      const only = tied[0] as CandidateSwap;
      return trade(only.potIdx, only.handIdx);
    }

    const targetSuits = this.apparentTargetSuits(v.seat);

    let best = tied[0] as CandidateSwap;
    let bestConflicts = Infinity;
    for (const cand of tied) {
      const discardSuit = (v.hand[cand.handIdx] as Card).suit;
      let conflicts = 0;
      for (const targets of targetSuits.values()) {
        if (targets.has(discardSuit)) {
          conflicts++;
        }
      }
      if (conflicts < bestConflicts) {
        bestConflicts = conflicts;
        best = cand;
      }
    }
    return trade(best.potIdx, best.handIdx);
  }

  // apparentTargetSuits computes, for every other seat with known-held
  // cards, the suit(s) tied for most common among them.
  private apparentTargetSuits(ownSeat: number): Map<number, Set<Suit>> {
    const result = new Map<number, Set<Suit>>();
    for (const [seat, cards] of this.held) {
      if (seat === ownSeat || cards.length === 0) {
        continue;
      }
      const counts = new Map<Suit, number>();
      for (const c of cards) {
        counts.set(c.suit, (counts.get(c.suit) ?? 0) + 1);
      }
      const max = Math.max(...counts.values());
      const targets = new Set<Suit>();
      for (const [suit, n] of counts) {
        if (n === max) {
          targets.add(suit);
        }
      }
      result.set(seat, targets);
    }
    return result;
  }
}
