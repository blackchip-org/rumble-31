import type { Card } from "../card/card.ts";
import { score } from "../card/score.ts";
import type { Action, PlayerView, PublicTurn, Strategy } from "../game/types.ts";
import { exchange, knock, trade } from "../game/types.ts";
import {
  applyKnownCards,
  bestImprovingSwap,
  chooseFavorableByKnownHand,
  choosePairMaker,
  chooseSafeByKnownHand,
  NeighborTracker,
  randInt,
  resultingScore,
  unnecessaryIndices,
  type NeighborSnapshot,
} from "./helpers.ts";
import { Rng } from "../rng.ts";

// DifficultBotMemory is everything DifficultBot tracks across a round --
// what snapshot() returns and the constructor init accepts back, so a
// bot can be torn down and rebuilt (e.g. across a page reload,
// specs/state.md) without losing what it's learned so far this round.
export interface DifficultBotMemory {
  bestScore: number;
  bestTurn: number;
  upstreamKnown: Card[];
  downstreamKnown: Card[];
  neighbors: NeighborSnapshot;
}

// KNOCK_TURN_RANGE and BEST_SCORE_TURNS_AGO_RANGE are [lo-hi] ranges,
// and KNOCK_SCORE is the fixed score threshold, from the Difficult
// strategy in specs/bots.md.
const KNOCK_TURN_RANGE: [number, number] = [25, 30];
const BEST_SCORE_TURNS_AGO_RANGE: [number, number] = [3, 5];
const KNOCK_SCORE = 27;

// DifficultBot implements the Difficult strategy described in
// specs/bots.md. It's identical in shape to RegularBot, but where
// Regular only remembers its neighbors' most recent suit, Difficult
// tracks their exact known-held cards (adding what they collect,
// removing what they discard) and judges favorable/safe by whether a
// card would actually improve that known -- possibly incomplete --
// hand, per the incomplete-hand scoring rule in specs/bots.md.
export class DifficultBot implements Strategy {
  private rng: Rng;
  private neighbors = new NeighborTracker();

  private upstreamKnown: Card[] = [];
  private downstreamKnown: Card[] = [];

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
    upstreamKnown?: Card[];
    downstreamKnown?: Card[];
    neighbors?: NeighborSnapshot;
  }) {
    this.rng = init?.rng ?? new Rng(Math.floor(Math.random() * 0x100000000));
    this.bestScore = init?.bestScore ?? 0;
    this.bestTurn = init?.bestTurn ?? 0;
    this.upstreamKnown = init?.upstreamKnown ?? [];
    this.downstreamKnown = init?.downstreamKnown ?? [];

    this.neighbors.configure(
      (t) => {
        this.upstreamKnown = applyKnownCards(this.upstreamKnown, t);
      },
      (t) => {
        this.downstreamKnown = applyKnownCards(this.downstreamKnown, t);
      },
    );
    if (init?.neighbors) {
      this.neighbors.restore(init.neighbors);
    }
  }

  // snapshot returns everything this bot has tracked so far this round,
  // per DifficultBotMemory.
  snapshot(): DifficultBotMemory {
    return {
      bestScore: this.bestScore,
      bestTurn: this.bestTurn,
      upstreamKnown: this.upstreamKnown,
      downstreamKnown: this.downstreamKnown,
      neighbors: this.neighbors.snapshot(),
    };
  }

  onRoundStart(): void {
    this.neighbors.reset();
    this.upstreamKnown = [];
    this.downstreamKnown = [];
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

    const favorable = chooseFavorableByKnownHand(v, unnecessary, this.upstreamKnown);
    if (favorable) {
      return trade(favorable.potIdx, favorable.handIdx);
    }

    const pair = choosePairMaker(v, unnecessary);
    if (pair) {
      return trade(pair.potIdx, pair.handIdx);
    }

    const safeHandIdx = chooseSafeByKnownHand(v, this.downstreamKnown);
    if (safeHandIdx !== undefined) {
      return trade(randInt(this.rng, 0, 2), safeHandIdx);
    }

    return trade(randInt(this.rng, 0, 2), randInt(this.rng, 0, 2));
  }
}
