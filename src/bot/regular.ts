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
  type NeighborSnapshot,
} from "./helpers.ts";
import { Rng } from "../rng.ts";

// RegularBotMemory is everything RegularBot tracks across a round --
// what snapshot() returns and the constructor init accepts back, so a
// bot can be torn down and rebuilt (e.g. across a page reload,
// specs/state.md) without losing what it's learned so far this round.
export interface RegularBotMemory {
  bestScore: number;
  bestTurn: number;
  lastSuitUpstreamTook?: Suit;
  lastSuitUpstreamDiscarded?: Suit;
  lastSuitDownstreamTook?: Suit;
  neighbors: NeighborSnapshot;
}

// KNOCK_TURN_RANGE and BEST_SCORE_TURNS_AGO_RANGE are [lo-hi] ranges,
// and KNOCK_SCORE is the fixed score threshold, from the Regular
// strategy in specs/bots.md.
const KNOCK_TURN_RANGE: [number, number] = [25, 30];
const BEST_SCORE_TURNS_AGO_RANGE: [number, number] = [3, 5];
const KNOCK_SCORE = 29;

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

  // bestScore/bestTurn track "best score and turn" from specs/bots.md:
  // reset to 0 at the start of every round (onRoundStart), then updated
  // with the bot's own turn number whenever its score reaches a new
  // best within that round.
  private bestScore: number;
  private bestTurn: number;

  constructor(init?: {
    rng?: Rng;
    bestScore?: number;
    bestTurn?: number;
    lastSuitUpstreamTook?: Suit;
    lastSuitUpstreamDiscarded?: Suit;
    lastSuitDownstreamTook?: Suit;
    neighbors?: NeighborSnapshot;
  }) {
    this.rng = init?.rng ?? new Rng(Math.floor(Math.random() * 0x100000000));
    this.bestScore = init?.bestScore ?? 0;
    this.bestTurn = init?.bestTurn ?? 0;
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
    if (init?.neighbors) {
      this.neighbors.restore(init.neighbors);
    }
  }

  // snapshot returns everything this bot has tracked so far this round,
  // per RegularBotMemory.
  snapshot(): RegularBotMemory {
    return {
      bestScore: this.bestScore,
      bestTurn: this.bestTurn,
      lastSuitUpstreamTook: this.lastSuitUpstreamTook,
      lastSuitUpstreamDiscarded: this.lastSuitUpstreamDiscarded,
      lastSuitDownstreamTook: this.lastSuitDownstreamTook,
      neighbors: this.neighbors.snapshot(),
    };
  }

  onRoundStart(): void {
    this.neighbors.reset();
    this.lastSuitUpstreamTook = undefined;
    this.lastSuitUpstreamDiscarded = undefined;
    this.lastSuitDownstreamTook = undefined;
    this.bestScore = 0;
    this.bestTurn = 0;
  }

  observe(turn: PublicTurn): void {
    this.neighbors.observe(turn);
  }

  decide(v: PlayerView): Action {
    this.neighbors.setOwnSeat(v.seat);
    const action = this.chooseAction(v);
    this.recordBest(resultingScore(v, action), v.ownTurnNumber);
    return action;
  }

  private recordBest(resulting: number, ownTurnNumber: number): void {
    if (resulting >= this.bestScore) {
      this.bestScore = resulting;
      this.bestTurn = ownTurnNumber;
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
      score(v.hand) === this.bestScore &&
      v.ownTurnNumber - this.bestTurn > randInt(this.rng, ...BEST_SCORE_TURNS_AGO_RANGE)
    ) {
      return knock();
    }

    const improving = bestImprovingSwap(v);
    if (improving) {
      return trade(improving.potIdx, improving.handIdx);
    }

    if (score(v.hand) >= KNOCK_SCORE) {
      return knock();
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
