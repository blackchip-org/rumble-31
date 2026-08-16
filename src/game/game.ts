import { newRound } from "./round.ts";
import type { RoundDealOverride } from "./round.ts";
import { Rng } from "../rng.ts";
import type { ParsedStrikes } from "./strikes.ts";
import type { Hand, Pot, Result, Strategy, TurnRecord } from "./types.ts";

// RoundOutcome records one round's result within a game: the seats
// struck this round, any eliminated as a result, and any granted a
// second chance (specs/rules.md) instead of being eliminated.
export interface RoundOutcome {
  result: Result;
  struck: number[];
  eliminated: number[];
  secondChanceGranted: number[];
}

// nextActiveSeatClockwise returns the next seat clockwise from seat
// (seat+1, seat+2, ... mod 4) that appears in active. seat itself need
// not be active — e.g. a dealer who was just eliminated — so this
// can't reuse round.ts's own turn-order wraparound, which only ever
// steps from a seat already known to be active.
export function nextActiveSeatClockwise(seat: number, active: readonly number[]): number {
  for (let i = 1; i <= 4; i++) {
    const candidate = (seat + i) % 4;
    if (active.includes(candidate)) {
      return candidate;
    }
  }
  throw new Error(`nextActiveSeatClockwise: no active seat found from ${seat}`);
}

// prevActiveSeatCounterClockwise is nextActiveSeatClockwise's mirror,
// walking seat-1, seat-2, ... mod 4 instead — used to derive a
// notional dealer for a debug-forced first seat (specs/params.md's
// turn parameter), so later rounds still rotate sensibly from it.
export function prevActiveSeatCounterClockwise(seat: number, active: readonly number[]): number {
  for (let i = 1; i <= 4; i++) {
    const candidate = (seat - i + 4) % 4;
    if (active.includes(candidate)) {
      return candidate;
    }
  }
  throw new Error(`prevActiveSeatCounterClockwise: no active seat found from ${seat}`);
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
  // secondChance marks seats already granted the one-time-per-game
  // second chance (specs/rules.md): the first seat(s) to reach three
  // strikes keep playing instead of being eliminated, and are only
  // eliminated on a fourth strike.
  secondChance: [boolean, boolean, boolean, boolean];

  // dealerSeat is the dealer for whichever round is currently in
  // progress, or about to be dealt next — advanced (skipping
  // eliminated seats) at the end of playRound, once that round's
  // outcome is known, rather than at the start of the next call. That
  // way it always holds the right value for a caller to persist at
  // any point (deal time, mid-round, between rounds) and hand back via
  // init.dealerSeat to resume correctly, per specs/state.md.
  dealerSeat: number | undefined;

  // onDeal, if set, is called (and awaited, if it returns a Promise)
  // with each round's freshly dealt pot, every dealt-in seat's hand,
  // and who acts first, before that round's first turn — e.g. to let a
  // UI animate the deal before play continues, or persist a resumable
  // checkpoint (specs/state.md).
  onDeal: ((pot: Pot, hands: ReadonlyMap<number, Hand>, firstSeat: number) => void | Promise<void>) | undefined;
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
    secondChance?: [boolean, boolean, boolean, boolean];
    rng?: Rng;
    initialDeal?: RoundDealOverride;
    dealerSeat?: number;
  }) {
    this.strategies = init?.strategies;
    this.strikes = init?.strikes ?? [0, 0, 0, 0];
    this.eliminated = init?.eliminated ?? [false, false, false, false];
    this.secondChance = init?.secondChance ?? [false, false, false, false];
    this.onDeal = undefined;
    this.onTurn = undefined;
    this.over = false;
    this.rng = init?.rng;
    this.pendingInitialDeal = init?.initialDeal;

    if (init?.dealerSeat !== undefined) {
      this.dealerSeat = init.dealerSeat;
    } else if (this.rng) {
      const active = this.activeSeats();
      const forcedFirst = init?.initialDeal?.firstSeat;
      this.dealerSeat = forcedFirst !== undefined ? prevActiveSeatCounterClockwise(forcedFirst, active) : (active[this.rng.intn(active.length)] as number);
    }
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
    const firstSeat = override?.firstSeat ?? nextActiveSeatClockwise(this.dealerSeat as number, active);

    const r = newRound(this.rng.nextSeed(), seats, firstSeat, override);
    await this.onDeal?.(
      r.pot,
      new Map(r.players.map((p) => [p.seat, p.hand])),
      r.firstSeat,
    );
    r.onTurn = this.onTurn;

    const { result } = await r.run();

    const { struck, eliminated, secondChanceGranted } = this.applyResult(active, result);

    const stillActive = this.activeSeats();
    if (stillActive.length > 1) {
      this.dealerSeat = nextActiveSeatClockwise(this.dealerSeat as number, stillActive);
    }

    return { result, struck, eliminated, secondChanceGranted };
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
  // strikes every seat tied for it, and eliminates any that reach
  // their elimination threshold — normally 3 strikes, or 4 for a seat
  // already holding a second chance (specs/rules.md). Already-
  // eliminated seats are never struck.
  //
  // The very first time any seat(s) ever reach 3 strikes in this game
  // (nobody yet holds a second chance), they're granted one instead of
  // being eliminated — this can only happen once per game, since after
  // it does, every seat's threshold is fixed (4 if it got the grant, 3
  // otherwise) for the rest of the game.
  //
  // If a round's true eliminations would eliminate every remaining
  // active seat at once, none of them are actually eliminated — the
  // game ends instead with them tied as co-winners, since eliminating
  // everyone would leave no winner at all.
  applyResult(active: readonly number[], result: Result): { struck: number[]; eliminated: number[]; secondChanceGranted: number[] } {
    const scoreOf = new Map(result.players.map((pr) => [pr.seat, pr.score]));

    const first = active[0] as number;
    let lowest = scoreOf.get(first) as number;
    for (const seat of active.slice(1)) {
      const s = scoreOf.get(seat) as number;
      if (s < lowest) {
        lowest = s;
      }
    }

    const grantAlreadyUsed = this.secondChance.some(Boolean);

    const struck: number[] = [];
    const reachingThreshold: number[] = [];
    for (const seat of active) {
      if (scoreOf.get(seat) !== lowest) {
        continue;
      }
      this.strikes[seat] = (this.strikes[seat] as number) + 1;
      struck.push(seat);
      const threshold = this.secondChance[seat] ? 4 : 3;
      if ((this.strikes[seat] as number) >= threshold) {
        reachingThreshold.push(seat);
      }
    }

    if (!grantAlreadyUsed && reachingThreshold.length > 0) {
      for (const seat of reachingThreshold) {
        this.secondChance[seat] = true;
      }
      return { struck, eliminated: [], secondChanceGranted: reachingThreshold };
    }

    if (reachingThreshold.length === active.length) {
      this.over = true;
      return { struck, eliminated: [], secondChanceGranted: [] };
    }

    for (const seat of reachingThreshold) {
      this.eliminated[seat] = true;
    }
    return { struck, eliminated: reachingThreshold, secondChanceGranted: [] };
  }
}

// newGame returns a Game ready to play, deriving every round's seed
// from seed so a game is fully reproducible. initial seeds each seat's
// starting strikes/second-chance state (for the web GUI's strikes=
// debug param — specs/params.md); a seat with strikes >= 3 and no
// second chance begins the game already eliminated, per applyResult's
// own threshold. initialDeal, if given, is applied only to the game's
// first round. dealerSeat, if given, fixes the game's starting dealer
// instead of picking one randomly (or deriving it from
// initialDeal.firstSeat).
export function newGame(
  seed: number,
  strategies: [Strategy, Strategy, Strategy, Strategy],
  initial: ParsedStrikes = { strikes: [0, 0, 0, 0], secondChance: [false, false, false, false], eliminated: [false, false, false, false] },
  initialDeal?: RoundDealOverride,
  dealerSeat?: number,
): Game {
  return new Game({
    strategies,
    rng: new Rng(seed),
    strikes: [...initial.strikes],
    eliminated: [...initial.eliminated],
    secondChance: [...initial.secondChance],
    initialDeal,
    dealerSeat,
  });
}
