import type { Suit } from "../card/card.ts";
import { score } from "../card/score.ts";
import type { Action, PlayerView, PublicTurn, Strategy } from "../game/types.ts";
import { exchange, knock, trade } from "../game/types.ts";
import {
  bestImprovingSwap,
  chooseFavorableBySuit,
  choosePairMaker,
  chooseSafeBySuit,
  dominantSuit,
  NeighborTracker,
  randInt,
  resultingScore,
  unnecessaryIndices,
} from "./helpers.ts";
import { Rng } from "../rng.ts";

// KNOCK_TURN_RANGE and BEST_SCORE_ROUNDS_AGO_RANGE are the [lo-hi]
// ranges from the Regular strategy in specs/bots.md.
const KNOCK_TURN_RANGE: [number, number] = [25, 30];
const BEST_SCORE_ROUNDS_AGO_RANGE: [number, number] = [3, 5];

// RegularBot implements the Regular strategy described in specs/bots.md:
// like EasyBot, but it tracks its upstream and downstream neighbors'
// most recent suits from public trade/exchange history, and prefers
// trades that lean on that information over purely random ones.
export class RegularBot implements Strategy {
  private rng: Rng;
  private neighbors = new NeighborTracker();

  private lastSuitUpstreamTook: Suit | undefined;
  private lastSuitUpstreamDiscarded: Suit | undefined;
  private lastSuitDownstreamTook: Suit | undefined;

  // currentRound, bestScore/hasBestScore/bestRound track "best score and
  // round" from specs/bots.md across the bot's whole lifetime (a Game's
  // worth of rounds), not reset in onRoundStart.
  private currentRound: number;
  private bestScore: number;
  private hasBestScore: boolean;
  private bestRound: number;

  constructor(init?: {
    rng?: Rng;
    bestScore?: number;
    hasBestScore?: boolean;
    bestRound?: number;
    currentRound?: number;
    lastSuitUpstreamTook?: Suit;
    lastSuitUpstreamDiscarded?: Suit;
    lastSuitDownstreamTook?: Suit;
  }) {
    this.rng = init?.rng ?? new Rng(Math.floor(Math.random() * 0x100000000));
    this.bestScore = init?.bestScore ?? 0;
    this.hasBestScore = init?.hasBestScore ?? false;
    this.bestRound = init?.bestRound ?? 0;
    this.currentRound = init?.currentRound ?? 0;
    this.lastSuitUpstreamTook = init?.lastSuitUpstreamTook;
    this.lastSuitUpstreamDiscarded = init?.lastSuitUpstreamDiscarded;
    this.lastSuitDownstreamTook = init?.lastSuitDownstreamTook;

    this.neighbors.configure(
      (t) => {
        if (t.taken.length > 0) {
          this.lastSuitUpstreamTook = dominantSuit(t.taken);
        }
        if (t.given.length > 0) {
          this.lastSuitUpstreamDiscarded = dominantSuit(t.given);
        }
      },
      (t) => {
        if (t.taken.length > 0) {
          this.lastSuitDownstreamTook = dominantSuit(t.taken);
        }
      },
    );
  }

  onRoundStart(): void {
    this.neighbors.reset();
    this.lastSuitUpstreamTook = undefined;
    this.lastSuitUpstreamDiscarded = undefined;
    this.lastSuitDownstreamTook = undefined;
    this.currentRound++;
  }

  observe(turn: PublicTurn): void {
    this.neighbors.observe(turn);
  }

  decide(v: PlayerView): Action {
    this.neighbors.setOwnSeat(v.seat);
    const action = this.chooseAction(v);
    this.recordBest(resultingScore(v, action));
    return action;
  }

  private recordBest(resulting: number): void {
    if (!this.hasBestScore || resulting >= this.bestScore) {
      this.bestScore = resulting;
      this.hasBestScore = true;
      this.bestRound = this.currentRound;
    }
  }

  private chooseAction(v: PlayerView): Action {
    if (v.isFirstTurnOfRound) {
      return score(v.pot) > score(v.hand) ? exchange() : knock();
    }

    if (v.ownTurnNumber >= randInt(this.rng, ...KNOCK_TURN_RANGE)) {
      return knock();
    }
    if (score(v.pot) >= 30) {
      return exchange();
    }
    if (
      this.hasBestScore &&
      score(v.hand) === this.bestScore &&
      this.currentRound - this.bestRound > randInt(this.rng, ...BEST_SCORE_ROUNDS_AGO_RANGE)
    ) {
      return knock();
    }

    const improving = bestImprovingSwap(v);
    if (improving) {
      return trade(improving.potIdx, improving.handIdx);
    }

    const unnecessary = unnecessaryIndices(v.hand);

    const favorable = chooseFavorableBySuit(v, unnecessary, this.lastSuitUpstreamTook, this.lastSuitUpstreamDiscarded);
    if (favorable) {
      return trade(favorable.potIdx, favorable.handIdx);
    }

    const pair = choosePairMaker(v, unnecessary);
    if (pair) {
      return trade(pair.potIdx, pair.handIdx);
    }

    const safeHandIdx = chooseSafeBySuit(v, this.lastSuitDownstreamTook);
    if (safeHandIdx !== undefined) {
      return trade(randInt(this.rng, 0, 2), safeHandIdx);
    }

    return trade(randInt(this.rng, 0, 2), randInt(this.rng, 0, 2));
  }
}
