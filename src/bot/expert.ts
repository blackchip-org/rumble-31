import type { Card } from "../card/card.ts";
import type { Action, PlayerView, PublicTurn, Strategy } from "../game/types.ts";
import { exchange, knock } from "../game/types.ts";
import {
  allDifferentSuits,
  applyKnownCards,
  bestImprovingSwapDenying,
  chooseDenialTrade,
  chooseFavorableByKnownHand,
  choosePairMaker,
  chooseSafeByKnownHand,
  chooseSkeletonAction,
  downstreamRiskAdjustedKnockScore,
  hasConfirmedEdge,
  NeighborTracker,
  resultingScore,
  type NeighborSnapshot,
} from "./helpers.ts";
import { Rng } from "../rng.ts";

// ExpertBotMemory is everything ExpertBot tracks across a round --
// what snapshot() returns and the constructor init accepts back, so a
// bot can be torn down and rebuilt (e.g. across a page reload,
// specs/state.md) without losing what it's learned so far this round.
export interface ExpertBotMemory {
  bestScore: number;
  bestTurn: number;
  upstreamKnown: Card[];
  downstreamKnown: Card[];
  neighbors: NeighborSnapshot;
}

// KNOCK_TURN_RANGE and BEST_SCORE_TURNS_AGO_RANGE are [lo-hi] ranges,
// and KNOCK_SCORE is the fixed score threshold, from the Expert
// strategy in specs/bots.md.
const KNOCK_TURN_RANGE: [number, number] = [25, 30];
const BEST_SCORE_TURNS_AGO_RANGE: [number, number] = [3, 5];
const KNOCK_SCORE = 24;
// CONFIRMED_EDGE_MARGIN is how much the hand's current score must beat
// a fully-known neighbor's exact score by before that's trusted as a
// confirmed edge worth an immediate knock (helpers.ts:hasConfirmedEdge).
const CONFIRMED_EDGE_MARGIN = 5;
// DOWNSTREAM_DANGER_MARGIN and DOWNSTREAM_RISK_DISCOUNT tune the
// score-threshold-knock bar's downstream-risk discount
// (helpers.ts:downstreamRiskAdjustedKnockScore): downstream counts as
// dangerous once their known score is within DOWNSTREAM_DANGER_MARGIN
// of KNOCK_SCORE, at which point the bar drops by
// DOWNSTREAM_RISK_DISCOUNT.
const DOWNSTREAM_DANGER_MARGIN = 4;
const DOWNSTREAM_RISK_DISCOUNT = 3;

// ExpertBot implements the Expert strategy described in
// specs/bots.md, via the decision skeleton shared with AdvancedBot
// (helpers.ts:chooseSkeletonAction). Where Advanced tracks nothing about
// its neighbors, Expert tracks their exact known-held cards (adding
// what they collect, removing what they discard) and judges
// favorable/safe pot and hand cards by whether they'd actually improve
// that known -- possibly incomplete -- hand, per the incomplete-hand
// scoring rule in specs/bots.md.
export class ExpertBot implements Strategy {
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
  // per ExpertBotMemory.
  snapshot(): ExpertBotMemory {
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
    const action = chooseSkeletonAction(
      v,
      this.rng,
      {
        chooseFirstTurn: (view) => (allDifferentSuits(view.hand) ? exchange() : knock()),
        knockTurnRange: KNOCK_TURN_RANGE,
        bestScoreTurnsAgoRange: BEST_SCORE_TURNS_AGO_RANGE,
        knockScore: KNOCK_SCORE,
        confirmedEdge: (view) => hasConfirmedEdge(view, this.upstreamKnown, this.downstreamKnown, CONFIRMED_EDGE_MARGIN),
        riskAdjustedKnockScore: () => downstreamRiskAdjustedKnockScore(this.downstreamKnown, KNOCK_SCORE, DOWNSTREAM_DANGER_MARGIN, DOWNSTREAM_RISK_DISCOUNT),
        chooseImproving: (view) => bestImprovingSwapDenying(view, this.upstreamKnown),
        chooseDeny: (view, unnecessary) => chooseDenialTrade(view, unnecessary, this.upstreamKnown),
        chooseFavorable: (view, unnecessary) => chooseFavorableByKnownHand(view, unnecessary, this.upstreamKnown),
        choosePair: choosePairMaker,
        chooseSafe: (view) => chooseSafeByKnownHand(view, this.downstreamKnown),
      },
      { score: this.bestScore, turn: this.bestTurn },
    );
    this.recordBest(resultingScore(v, action), v.ownTurnNumber);
    return action;
  }

  private recordBest(resulting: number, ownTurnNumber: number): void {
    if (resulting >= this.bestScore) {
      this.bestScore = resulting;
      this.bestTurn = ownTurnNumber;
    }
  }
}
