import { score } from "../card/score.ts";
import type { Action, PlayerView, Strategy } from "../game/types.ts";
import { exchange, knock, trade } from "../game/types.ts";
import { bestImprovingSwap, randInt, unnecessaryIndices } from "./helpers.ts";
import { Rng } from "../rng.ts";

// KNOCK_TURN_RANGE is the [lo-hi] range, and KNOCK_SCORE is the fixed
// score threshold, from the Easy strategy in specs/bots.md.
const KNOCK_TURN_RANGE: [number, number] = [18, 22];
const KNOCK_SCORE = 30;

// EasyBot implements the Easy strategy described in specs/bots.md. It
// mimics a new player: it never looks at what other players are doing,
// so it carries no state across turns beyond its own random rolls.
export class EasyBot implements Strategy {
  private rng: Rng;

  constructor(init?: { rng?: Rng }) {
    this.rng = init?.rng ?? new Rng(Math.floor(Math.random() * 0x100000000));
  }

  decide(v: PlayerView): Action {
    if (v.isFirstTurnOfRound) {
      return score(v.pot) > score(v.hand) ? exchange() : knock();
    }

    if (v.ownTurnNumber >= randInt(this.rng, ...KNOCK_TURN_RANGE)) {
      return knock();
    }
    if (score(v.pot) >= 30) {
      return exchange();
    }

    const improving = bestImprovingSwap(v);
    if (improving) {
      return trade(improving.potIdx, improving.handIdx);
    }

    if (score(v.hand) >= KNOCK_SCORE) {
      return knock();
    }

    const unnecessary = unnecessaryIndices(v.hand);
    if (unnecessary.length > 0) {
      const handIdx = unnecessary[randInt(this.rng, 0, unnecessary.length - 1)] as number;
      return trade(randInt(this.rng, 0, 2), handIdx);
    }

    return trade(randInt(this.rng, 0, 2), randInt(this.rng, 0, 2));
  }
}
