import type { Action, PlayerView, Strategy } from "../../game/types.ts";
import { exchange, knock } from "../../game/types.ts";
import { allDifferentSuits, chance, choosePairMaker, chooseSkeletonAction, resultingScore } from "./helpers.ts";
import { Rng } from "../../rng.ts";

// AdvancedBotMemory is everything AdvancedBot tracks across a round --
// what snapshot() returns and the constructor init accepts back, so a
// bot can be torn down and rebuilt (e.g. across a page reload,
// specs/state.md) without losing what it's learned so far this round.
export interface AdvancedBotMemory {
  bestScore: number;
  bestLap: number;
}

// KNOCK_LAP_RANGE and BEST_SCORE_LAPS_AGO_RANGE are [lo-hi] ranges,
// and KNOCK_SCORE is the fixed score threshold, from the Advanced
// strategy in specs/bots_v3.md.
const KNOCK_LAP_RANGE: [number, number] = [25, 30];
const BEST_SCORE_LAPS_AGO_RANGE: [number, number] = [3, 5];
const KNOCK_SCORE = 26;
// PAIR_MAKER_CHANCE is the odds Advanced actually takes a pair-maker
// trade once it finds one, per specs/bots_v3.md -- unlike Expert, which
// always takes one it finds, Advanced only sometimes does, continuing to
// the next bullet otherwise.
const PAIR_MAKER_CHANCE = 0.5;
// BLUNDER_CHANCE is the odds Advanced ignores its own checklist on any
// given turn and trades a random card instead, per specs/bots_v3.md's
// Blunder mechanic.
const BLUNDER_CHANCE = 0.07;

// AdvancedBot implements the Advanced strategy described in specs/bots_v3.md,
// via the decision skeleton shared with ExpertBot
// (helpers.ts:chooseSkeletonAction). It doesn't track anything about its
// neighbors -- a suit-based version of that was tried and deliberately
// dropped (it didn't earn its keep; see git history), leaving only its
// own best score and lap. Its first-turn take-pot-or-keep bullet uses
// the suit-shape rule (allDifferentSuits) rather than a blind score
// gamble.
export class AdvancedBot implements Strategy {
  private rng: Rng;

  // bestScore/bestLap track "best score and lap" from specs/bots_v3.md:
  // reset to 0 at the start of every round (onRoundStart), then updated
  // with the current lap (specs/rules.md) whenever its score reaches a
  // new best within that round.
  private bestScore: number;
  private bestLap: number;

  constructor(init?: { rng?: Rng; bestScore?: number; bestLap?: number }) {
    this.rng = init?.rng ?? new Rng(Math.floor(Math.random() * 0x100000000));
    this.bestScore = init?.bestScore ?? 0;
    this.bestLap = init?.bestLap ?? 0;
  }

  // snapshot returns everything this bot has tracked so far this round,
  // per AdvancedBotMemory.
  snapshot(): AdvancedBotMemory {
    return { bestScore: this.bestScore, bestLap: this.bestLap };
  }

  onRoundStart(): void {
    this.bestScore = 0;
    this.bestLap = 0;
  }

  decide(v: PlayerView): Action {
    const action = chooseSkeletonAction(
      v,
      this.rng,
      {
        chooseFirstTurn: (view) => (allDifferentSuits(view.hand) ? exchange() : knock()),
        blunderChance: BLUNDER_CHANCE,
        knockLapRange: KNOCK_LAP_RANGE,
        bestScoreLapsAgoRange: BEST_SCORE_LAPS_AGO_RANGE,
        knockScore: KNOCK_SCORE,
        choosePair: (view, unnecessary) => {
          const pair = choosePairMaker(view, unnecessary);
          return pair && chance(this.rng, PAIR_MAKER_CHANCE) ? pair : undefined;
        },
      },
      { score: this.bestScore, lap: this.bestLap },
    );
    this.recordBest(resultingScore(v, action), v.lap);
    return action;
  }

  private recordBest(resulting: number, lap: number): void {
    if (resulting >= this.bestScore) {
      this.bestScore = resulting;
      this.bestLap = lap;
    }
  }
}
