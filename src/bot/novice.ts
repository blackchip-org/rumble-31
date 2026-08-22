import type { Action, PlayerView, Strategy } from "../game/types.ts";
import { chooseSkeletonAction, resultingScore } from "./helpers.ts";
import { Rng } from "../rng.ts";

// NoviceBotMemory is everything NoviceBot tracks across a round -- what
// snapshot() returns and the constructor init accepts back, so a bot
// can be torn down and rebuilt (e.g. across a page reload,
// specs/state.md) without losing what it's learned so far this round.
export interface NoviceBotMemory {
  bestScore: number;
  bestTurn: number;
}

// KNOCK_TURN_RANGE is a [lo-hi] range, from the Novice strategy in
// specs/bots.md.
const KNOCK_TURN_RANGE: [number, number] = [25, 30];
// BEST_SCORE_TURNS_AGO_RANGE is a fixed 5-turn wait rather than
// Advanced/Expert's randomized [3-5] range -- unlike theirs, Novice's
// stagnation knock always waits the full 5 turns, per specs/bots.md,
// so it keeps chasing a better hand longer before giving up.
const BEST_SCORE_TURNS_AGO_RANGE: [number, number] = [5, 5];
// KNOCK_SCORE_RANGE is a [lo-hi] range rolled once per turn, rather
// than Advanced/Expert's single fixed knock score -- per
// specs/bots.md, this feeds both the exchange-all and score-threshold
// knock bullets (helpers.ts:chooseSkeletonAction resolves it once and
// reuses it for both).
const KNOCK_SCORE_RANGE: [number, number] = [27, 29];
// TAKE_POT_SCORE_RANGE is the [lo-hi] range for the blind first-turn
// gamble: take the unseen pot when the bot's own hand score is below a
// number randomly rolled from this range.
const TAKE_POT_SCORE_RANGE: [number, number] = [13, 16];

// NoviceBot implements the Novice strategy described in specs/bots.md,
// via the decision skeleton shared with AdvancedBot and ExpertBot
// (helpers.ts:chooseSkeletonAction). It's Advanced's skeleton and tuned
// thresholds with the pair-maker bullet left out -- it tracks its own
// best score and turn, but never looks for a pot card that would pair
// with its hand.
export class NoviceBot implements Strategy {
  private rng: Rng;

  // bestScore/bestTurn track "best score and turn" from specs/bots.md:
  // reset to 0 at the start of every round (onRoundStart), then updated
  // with the bot's own turn number whenever its score reaches a new
  // best within that round.
  private bestScore: number;
  private bestTurn: number;

  constructor(init?: { rng?: Rng; bestScore?: number; bestTurn?: number }) {
    this.rng = init?.rng ?? new Rng(Math.floor(Math.random() * 0x100000000));
    this.bestScore = init?.bestScore ?? 0;
    this.bestTurn = init?.bestTurn ?? 0;
  }

  // snapshot returns everything this bot has tracked so far this round,
  // per NoviceBotMemory.
  snapshot(): NoviceBotMemory {
    return { bestScore: this.bestScore, bestTurn: this.bestTurn };
  }

  onRoundStart(): void {
    this.bestScore = 0;
    this.bestTurn = 0;
  }

  decide(v: PlayerView): Action {
    const action = chooseSkeletonAction(
      v,
      this.rng,
      {
        takePotScoreRange: TAKE_POT_SCORE_RANGE,
        knockTurnRange: KNOCK_TURN_RANGE,
        bestScoreTurnsAgoRange: BEST_SCORE_TURNS_AGO_RANGE,
        knockScore: KNOCK_SCORE_RANGE,
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
