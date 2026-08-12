import type { Card } from "../card/card.ts";
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

// DifficultBot implements the Difficult strategy described in
// specs/bots.md: it tracks the exact set of cards known to be in each
// opponent's hand from public trade/exchange history, avoids handing an
// opponent a card that would let them beat the bot's own hand, and
// factors known opponent scores into when it knocks.
export class DifficultBot implements Strategy {
  lastScore: number;
  hasLastScore: boolean;
  noImproveStreak: number;

  // delayedKnock records that the no-improve-streak knock was already
  // deferred once (because a fully-known opponent currently scored
  // lower) — the next time the streak condition fires, it knocks
  // unconditionally rather than deferring again. Public, like
  // lastScore/noImproveStreak, so a test can seed or inspect it
  // directly.
  delayedKnock: boolean;

  // held maps seat -> the cards currently known to be in that seat's
  // hand, built up via observe(). Reset every round in onRoundStart().
  private held: Map<number, Card[]>;

  constructor(init?: {
    lastScore?: number;
    hasLastScore?: boolean;
    noImproveStreak?: number;
    delayedKnock?: boolean;
  }) {
    this.lastScore = init?.lastScore ?? 0;
    this.hasLastScore = init?.hasLastScore ?? false;
    this.noImproveStreak = init?.noImproveStreak ?? 0;
    this.delayedKnock = init?.delayedKnock ?? false;
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
      // Trading a single card isn't legal on the round's first turn
      // (specs/rules.md) — Keep instead of taking the pot.
      return knock();
    }

    if (s <= this.lastScore && this.hasLastScore) {
      this.noImproveStreak++;
    } else {
      this.noImproveStreak = 0;
      this.delayedKnock = false;
    }
    this.lastScore = s;
    this.hasLastScore = true;

    if (s >= INSTANT_KNOCK_SCORE) {
      return knock();
    }

    const opponentScores = this.fullyKnownOpponentScores(v.seat);
    if (s > KNOCK_SCORE_THRESHOLD && !opponentScores.some((os) => os > s)) {
      return knock();
    }

    if (this.noImproveStreak >= NO_IMPROVE_KNOCK_STREAK) {
      if (opponentScores.some((os) => os < s) && !this.delayedKnock) {
        this.delayedKnock = true;
      } else {
        return knock();
      }
    }

    if (v.ownTurnNumber >= KNOCK_TURN_LIMIT) {
      return knock();
    }
    return this.chooseSwap(v);
  }

  // chooseSwap picks among the swaps tied for the highest resulting
  // score: first it drops any swap that would hand an opponent a card
  // completing a known-held pair into a hand beating the bot's own
  // (unless doing so would leave no swap at all); then, among what's
  // left, it prefers the discard whose suit matches the fewest
  // opponents' known-held cards. Remaining ties keep candidateSwaps'
  // order, same as bestExchange.
  private chooseSwap(v: PlayerView): Action {
    const tied = bestSwaps(v);
    if (tied.length === 1) {
      const only = tied[0] as CandidateSwap;
      return trade(only.potIdx, only.handIdx);
    }

    const nonFeeding = tied.filter((cand) => !this.feedsAnOpponent(v, cand));
    const survivors = nonFeeding.length > 0 ? nonFeeding : tied;

    let best = survivors[0] as CandidateSwap;
    let bestConflicts = Infinity;
    for (const cand of survivors) {
      const discardSuit = (v.hand[cand.handIdx] as Card).suit;
      let conflicts = 0;
      for (const [seat, cards] of this.held) {
        if (seat === v.seat) {
          continue;
        }
        if (cards.some((c) => c.suit === discardSuit)) {
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

  // feedsAnOpponent reports whether discarding cand's card would, for
  // some opponent with exactly 2 known-held cards, complete a 3-card
  // hand scoring higher than the bot's own resulting hand.
  private feedsAnOpponent(v: PlayerView, cand: CandidateSwap): boolean {
    const discard = v.hand[cand.handIdx] as Card;
    for (const [seat, cards] of this.held) {
      if (seat === v.seat || cards.length !== 2) {
        continue;
      }
      const hypothetical = [...cards, discard] as [Card, Card, Card];
      if (score(hypothetical) > cand.score) {
        return true;
      }
    }
    return false;
  }

  // fullyKnownOpponentScores returns the current score of every other
  // seat whose entire hand is known (held.length === 3).
  private fullyKnownOpponentScores(ownSeat: number): number[] {
    const scores: number[] = [];
    for (const [seat, cards] of this.held) {
      if (seat !== ownSeat && cards.length === 3) {
        scores.push(score(cards as [Card, Card, Card]));
      }
    }
    return scores;
  }
}
