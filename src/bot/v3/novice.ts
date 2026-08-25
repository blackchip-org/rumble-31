import type { Action, PlayerView, Strategy } from "../../game/types.ts";
import { chooseSkeletonAction, resultingScore } from "./helpers.ts";
import { Rng } from "../../rng.ts";

// NoviceBotMemory is everything NoviceBot tracks across a round -- what
// snapshot() returns and the constructor init accepts back, so a bot
// can be torn down and rebuilt (e.g. across a page reload,
// specs/state.md) without losing what it's learned so far this round.
export interface NoviceBotMemory {
  bestScore: number;
  bestLap: number;
}

// KNOCK_LAP_RANGE is a [lo-hi] range, from the Novice strategy in
// specs/bots_v3.md.
const KNOCK_LAP_RANGE: [number, number] = [25, 30];
// BEST_SCORE_LAPS_AGO_RANGE is a fixed 5-lap wait rather than
// Advanced/Expert's randomized [3-5] range -- unlike theirs, Novice's
// stagnation knock always waits the full 5 laps, per specs/bots_v3.md,
// so it keeps chasing a better hand longer before giving up.
const BEST_SCORE_LAPS_AGO_RANGE: [number, number] = [5, 5];
// KNOCK_SCORE_RANGE is a [lo-hi] range rolled once per turn, rather
// than Advanced/Expert's single fixed knock score -- per
// specs/bots_v3.md, this feeds both the exchange-all and score-threshold
// knock bullets (helpers.ts:chooseSkeletonAction resolves it once and
// reuses it for both).
const KNOCK_SCORE_RANGE: [number, number] = [27, 29];
// TAKE_POT_SCORE_RANGE is the [lo-hi] range for the blind first-turn
// gamble: take the unseen pot when the bot's own hand score is below a
// number randomly rolled from this range.
const TAKE_POT_SCORE_RANGE: [number, number] = [13, 16];
// BLUNDER_CHANCE is the odds Novice ignores its own checklist on any
// given turn and trades a random card instead, per specs/bots_v3.md's
// Blunder mechanic.
const BLUNDER_CHANCE = 0.14;

// NoviceBot implements the Novice strategy described in specs/bots_v3.md,
// via the decision skeleton shared with AdvancedBot and ExpertBot
// (helpers.ts:chooseSkeletonAction). It's Advanced's skeleton and tuned
// thresholds with the pair-maker bullet left out -- it tracks its own
// best score and lap, but never looks for a pot card that would pair
// with its hand.
export class NoviceBot implements Strategy {
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
  // per NoviceBotMemory.
  snapshot(): NoviceBotMemory {
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
        takePotScoreRange: TAKE_POT_SCORE_RANGE,
        blunderChance: BLUNDER_CHANCE,
        knockLapRange: KNOCK_LAP_RANGE,
        bestScoreLapsAgoRange: BEST_SCORE_LAPS_AGO_RANGE,
        knockScore: KNOCK_SCORE_RANGE,
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
