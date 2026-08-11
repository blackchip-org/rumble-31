import { newRound } from "./round.ts";
import type { RoundDealOverride } from "./round.ts";
import { Rng } from "../rng.ts";
import type { Hand, Pot, Result, Strategy, TurnRecord } from "./types.ts";

// RoundOutcome records one round's result within a game: the seats
// struck this round, and any eliminated as a result.
export interface RoundOutcome {
  result: Result;
  struck: number[];
  eliminated: number[];
}

// Game plays a series of rounds among four fixed seats until only one
// remains active, per specs/rules.md. Once a seat is eliminated it is
// left out of every later round entirely — not dealt in, never takes a
// turn, never touches the pot — matching "play continues without that
// player."
export class Game {
  strategies: [Strategy, Strategy, Strategy, Strategy] | undefined;
  strikes: [number, number, number, number];
  eliminated: [boolean, boolean, boolean, boolean];

  // onDeal, if set, is called (and awaited, if it returns a Promise)
  // with each round's freshly dealt pot, and every dealt-in seat's
  // hand, before that round's first turn — e.g. to let a UI animate
  // the deal before play continues.
  onDeal: ((pot: Pot, hands: ReadonlyMap<number, Hand>) => void | Promise<void>) | undefined;
  // onTurn, if set, is passed through to each round's own onTurn (and
  // awaited the same way, if it returns a Promise).
  onTurn: ((rec: TurnRecord) => void | Promise<void>) | undefined;

  // over is set when a round would otherwise eliminate every remaining
  // active seat at once, ending the game in a tie instead of
  // eliminating everyone down to no winner at all.
  private over: boolean;
  private rng: Rng | undefined;
  // pendingInitialDeal, if set, is applied to (and cleared by) whichever
  // round is played first — e.g. to pre-populate hands/the pot or fix
  // the first seat for debugging (specs/params.md). Every later round
  // deals normally.
  private pendingInitialDeal: RoundDealOverride | undefined;

  constructor(init?: {
    strategies?: [Strategy, Strategy, Strategy, Strategy];
    strikes?: [number, number, number, number];
    eliminated?: [boolean, boolean, boolean, boolean];
    rng?: Rng;
    initialDeal?: RoundDealOverride;
  }) {
    this.strategies = init?.strategies;
    this.strikes = init?.strikes ?? [0, 0, 0, 0];
    this.eliminated = init?.eliminated ?? [false, false, false, false];
    this.onDeal = undefined;
    this.onTurn = undefined;
    this.over = false;
    this.rng = init?.rng;
    this.pendingInitialDeal = init?.initialDeal;
  }

  // active reports whether more than one seat remains — i.e. whether the
  // game isn't over yet.
  active(): boolean {
    return !this.over && this.activeSeats().length > 1;
  }

  // winners returns the seat(s) that were never eliminated (more than
  // one only if a round simultaneously eliminated the last contenders).
  // Only meaningful once active() is false.
  winners(): number[] {
    return this.activeSeats();
  }

  // playRound plays one round of the game, using the current strategies,
  // and applies its strikes and eliminations. It must only be called
  // while active() is true.
  async playRound(): Promise<RoundOutcome> {
    if (!this.strategies || !this.rng) {
      throw new Error("Game.playRound: strategies and rng are required (use newGame)");
    }
    const active = this.activeSeats();
    const strategies = this.strategies;
    const seats = active.map((seat) => ({ seat, strategy: strategies[seat] as Strategy }));

    const override = this.pendingInitialDeal;
    this.pendingInitialDeal = undefined;
    const r = newRound(this.rng.nextSeed(), seats, override);
    await this.onDeal?.(
      r.pot,
      new Map(r.players.map((p) => [p.seat, p.hand])),
    );
    r.onTurn = this.onTurn;

    const { result } = await r.run();

    const { struck, eliminated } = this.applyResult(active, result);
    return { result, struck, eliminated };
  }

  // run plays rounds until the game is over, for callers that don't need
  // to observe each round as it happens.
  async run(): Promise<{ winners: number[]; log: RoundOutcome[] }> {
    const log: RoundOutcome[] = [];
    while (this.active()) {
      log.push(await this.playRound());
    }
    return { winners: this.winners(), log };
  }

  private activeSeats(): number[] {
    const active: number[] = [];
    for (let seat = 0; seat < 4; seat++) {
      if (!this.eliminated[seat]) {
        active.push(seat);
      }
    }
    return active;
  }

  // applyResult finds the lowest score among active seats in result,
  // strikes every seat tied for it, and eliminates any that reach 3
  // strikes. Already-eliminated seats are never struck. If this round
  // would eliminate every remaining active seat at once, none of them
  // are actually eliminated — the game ends instead with them tied as
  // co-winners, since eliminating everyone would leave no winner at all.
  applyResult(active: readonly number[], result: Result): { struck: number[]; eliminated: number[] } {
    const scoreOf = new Map(result.players.map((pr) => [pr.seat, pr.score]));

    const first = active[0] as number;
    let lowest = scoreOf.get(first) as number;
    for (const seat of active.slice(1)) {
      const s = scoreOf.get(seat) as number;
      if (s < lowest) {
        lowest = s;
      }
    }

    const struck: number[] = [];
    const reaching3: number[] = [];
    for (const seat of active) {
      if (scoreOf.get(seat) !== lowest) {
        continue;
      }
      this.strikes[seat] = (this.strikes[seat] as number) + 1;
      struck.push(seat);
      if ((this.strikes[seat] as number) >= 3) {
        reaching3.push(seat);
      }
    }

    if (reaching3.length === active.length) {
      this.over = true;
      return { struck, eliminated: [] };
    }

    for (const seat of reaching3) {
      this.eliminated[seat] = true;
    }
    return { struck, eliminated: reaching3 };
  }
}

// newGame returns a Game ready to play, deriving every round's seed
// from seed so a game is fully reproducible. initialStrikes seeds each
// seat's strike count (for -strikes debugging); a seat starting at 3 or
// more strikes begins the game already eliminated, per applyResult's
// own threshold. initialDeal, if given, is applied only to the game's
// first round (for the web GUI's debug params — specs/params.md).
export function newGame(
  seed: number,
  strategies: [Strategy, Strategy, Strategy, Strategy],
  initialStrikes: [number, number, number, number] = [0, 0, 0, 0],
  initialDeal?: RoundDealOverride,
): Game {
  const eliminated = initialStrikes.map((s) => s >= 3) as [boolean, boolean, boolean, boolean];
  return new Game({ strategies, rng: new Rng(seed), strikes: [...initialStrikes], eliminated, initialDeal });
}
