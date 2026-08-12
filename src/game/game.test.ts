import { test } from "node:test";
import assert from "node:assert/strict";
import { Game, newGame, nextActiveSeatClockwise, prevActiveSeatCounterClockwise } from "./game.ts";
import { knock, exchange, strategyFunc } from "./types.ts";
import type { Hand, PlayerResult, PlayerView, Result, Strategy } from "./types.ts";
import { Rng } from "../rng.ts";

function resultWithScores(scores: [number, number, number, number]): Result {
  const players = scores.map((score, seat) => ({ seat, hand: undefined, score, rank: 0 })) as unknown as [
    PlayerResult,
    PlayerResult,
    PlayerResult,
    PlayerResult,
  ];
  return { players, winners: [] };
}

test("applyResult", () => {
  const cases: Array<{
    name: string;
    preStrikes?: [number, number, number, number];
    preEliminated?: [boolean, boolean, boolean, boolean];
    active: number[];
    scores: [number, number, number, number];
    wantStruck: number[];
    wantEliminated: number[];
    wantStrikes: [number, number, number, number];
  }> = [
    {
      name: "single lowest seat is struck",
      active: [0, 1, 2, 3],
      scores: [10, 20, 20, 20],
      wantStruck: [0],
      wantEliminated: [],
      wantStrikes: [1, 0, 0, 0],
    },
    {
      name: "tied lowest seats are all struck",
      active: [0, 1, 2, 3],
      scores: [10, 10, 20, 20],
      wantStruck: [0, 1],
      wantEliminated: [],
      wantStrikes: [1, 1, 0, 0],
    },
    {
      name: "an already-eliminated seat is never struck even if it would tie for lowest",
      preStrikes: [3, 0, 0, 0],
      preEliminated: [true, false, false, false],
      active: [1, 2, 3],
      scores: [1, 10, 20, 20],
      wantStruck: [1],
      wantEliminated: [],
      wantStrikes: [3, 1, 0, 0],
    },
    {
      name: "a seat reaching 3 strikes is eliminated",
      preStrikes: [0, 2, 0, 0],
      active: [0, 1, 2, 3],
      scores: [20, 5, 20, 20],
      wantStruck: [1],
      wantEliminated: [1],
      wantStrikes: [0, 3, 0, 0],
    },
  ];

  for (const tt of cases) {
    const g = new Game({ strikes: tt.preStrikes, eliminated: tt.preEliminated });
    const result = resultWithScores(tt.scores);

    const { struck, eliminated } = g.applyResult(tt.active, result);

    assert.deepEqual(struck, tt.wantStruck, tt.name);
    assert.deepEqual(eliminated, tt.wantEliminated, tt.name);
    assert.deepEqual(g.strikes, tt.wantStrikes, tt.name);
  }
});

// Regression test: when the only two remaining active seats tie for
// lowest and both were already on 2 strikes, they both reach 3 strikes
// in the same round. Eliminating both would leave zero active seats and
// no winner at all, contradicting "the last remaining player is the
// winner" — they must end the game tied as co-winners instead.
test("simultaneous elimination of the last two seats ends the game in a tie", () => {
  const g = new Game({ strikes: [3, 3, 2, 2], eliminated: [true, true, false, false] });
  const result = resultWithScores([0, 0, 15, 15]);

  const { struck, eliminated } = g.applyResult([2, 3], result);

  assert.deepEqual(struck, [2, 3]);
  assert.deepEqual(eliminated, []);
  assert.equal(g.eliminated[2], false);
  assert.equal(g.eliminated[3], false);
  assert.equal(g.active(), false);
  assert.deepEqual(g.winners(), [2, 3]);
});

// quickPlay always knocks: Keep on the round's first turn (trade isn't
// legal there), a real knock on any later turn, ending each round
// quickly. It's stateless, so the same value can be shared across all
// four seats.
const quickPlay: Strategy = strategyFunc(() => knock());

test("run plays a full game to a valid conclusion", async () => {
  for (const seed of [1, 2, 3, 42]) {
    const strategies: [Strategy, Strategy, Strategy, Strategy] = [quickPlay, quickPlay, quickPlay, quickPlay];
    const g = newGame(seed, strategies);

    const { winners, log } = await g.run();

    assert.ok(winners.length > 0, `seed=${seed}: winners is empty`);
    for (const seat of winners) {
      assert.ok((g.strikes[seat] as number) < 3, `seed=${seed}: winner seat ${seat} has 3+ strikes`);
    }
    for (let seat = 0; seat < 4; seat++) {
      if (g.eliminated[seat]) {
        assert.equal(g.strikes[seat], 3, `seed=${seed}: eliminated seat ${seat} strikes`);
      }
    }
    assert.ok(log.length > 0, `seed=${seed}: log is empty`);
    // At most 4 seats * 3 strikes each can ever be handed out, and
    // every round hands out at least one strike.
    assert.ok(log.length <= 12, `seed=${seed}: log.length = ${log.length}, want <= 12`);
    for (const outcome of log) {
      for (const seat of outcome.eliminated) {
        assert.ok(outcome.struck.includes(seat), `seed=${seed}: eliminated seat ${seat} not in struck`);
      }
    }
  }
});

test("playRound deals once, narrates turns, and picks up strategy swaps next round", async () => {
  const strategies: [Strategy, Strategy, Strategy, Strategy] = [quickPlay, quickPlay, quickPlay, quickPlay];
  const g = newGame(1, strategies);

  let dealtCalls = 0;
  g.onDeal = () => {
    dealtCalls++;
  };
  let turnCalls = 0;
  g.onTurn = () => {
    turnCalls++;
  };

  await g.playRound();
  assert.equal(dealtCalls, 1);
  assert.ok(turnCalls > 0);

  // No single round can hand out more than one strike per seat, so the
  // game is guaranteed to still be active after exactly one round —
  // safe to play a second without picking a special seed.
  assert.ok(g.active(), "game ended after a single round");

  // Swapping strategies between rounds must take effect starting with
  // the very next round.
  const alwaysExchange: Strategy = strategyFunc((v: PlayerView) => (v.isFirstTurnOfRound ? exchange() : knock()));
  g.strategies = [alwaysExchange, alwaysExchange, alwaysExchange, alwaysExchange];

  let firstActionType: string | undefined;
  g.onTurn = (rec) => {
    if (firstActionType === undefined) {
      firstActionType = rec.action.type;
    }
  };

  await g.playRound();
  assert.equal(firstActionType, "exchange");
});

// Regression test: onDeal can return a Promise (e.g. a UI animating
// the deal), and playRound must await it before the round's first
// turn — otherwise an async onDeal and the first onTurn call could
// race, and a UI animation could be interrupted by play starting.
test("playRound awaits an async onDeal before the round's first turn", async () => {
  const strategies: [Strategy, Strategy, Strategy, Strategy] = [quickPlay, quickPlay, quickPlay, quickPlay];
  const g = newGame(1, strategies);

  let dealResolved = false;
  let firstTurnSawDealResolved: boolean | undefined;
  g.onDeal = () =>
    new Promise<void>((resolve) => {
      setTimeout(() => {
        dealResolved = true;
        resolve();
      }, 0);
    });
  g.onTurn = () => {
    if (firstTurnSawDealResolved === undefined) {
      firstTurnSawDealResolved = dealResolved;
    }
  };

  await g.playRound();
  assert.equal(firstTurnSawDealResolved, true);
});

// Regression test: a seat eliminated in an earlier round must not be
// dealt a hand, take a turn, or appear in the result of a later round —
// only bookkeeping (strikes/eliminated) should persist for it.
test("playRound excludes an already-eliminated seat from dealing, turns, and results", async () => {
  const strategies: [Strategy, Strategy, Strategy, Strategy] = [quickPlay, quickPlay, quickPlay, quickPlay];
  const g = new Game({
    strategies,
    rng: new Rng(1),
    strikes: [3, 0, 0, 0],
    eliminated: [true, false, false, false],
  });

  const turnSeats = new Set<number>();
  g.onTurn = (rec) => {
    turnSeats.add(rec.seat);
  };

  const outcome = await g.playRound();

  assert.deepEqual(
    outcome.result.players.map((pr) => pr.seat).sort((a, b) => a - b),
    [1, 2, 3],
  );
  assert.equal(turnSeats.has(0), false);
});

// newGame's initialStrikes (for the CLI's -strikes debug flag) seeds
// each seat's strike count directly, and a seat starting at 3 or more
// must already be eliminated — consistent with applyResult's own
// threshold for strikes earned through play.
test("newGame seeds initial strikes, eliminating any seat starting at 3 or more", async () => {
  const strategies: [Strategy, Strategy, Strategy, Strategy] = [quickPlay, quickPlay, quickPlay, quickPlay];
  const g = newGame(1, strategies, [3, 1, 0, 4]);

  assert.deepEqual(g.strikes, [3, 1, 0, 4]);
  assert.deepEqual(g.eliminated, [true, false, false, true]);

  const outcome = await g.playRound();
  assert.deepEqual(
    outcome.result.players.map((pr) => pr.seat).sort((a, b) => a - b),
    [1, 2],
  );
});

// Regression test: onDeal's firstSeat argument must match the round it
// actually deals, so a caller building a resumable checkpoint
// (specs/state.md) knows who acts first without re-deriving it.
test("playRound's onDeal reports the round's actual firstSeat", async () => {
  const strategies: [Strategy, Strategy, Strategy, Strategy] = [quickPlay, quickPlay, quickPlay, quickPlay];
  const g = newGame(1, strategies, undefined, { firstSeat: 2 });

  let reportedFirstSeat: number | undefined;
  g.onDeal = (_pot, _hands, firstSeat) => {
    reportedFirstSeat = firstSeat;
  };

  await g.playRound();
  assert.equal(reportedFirstSeat, 2);
});

// newGame's initialDeal (for the web GUI's debug URL params) must only
// apply to whichever round is played first — every later round deals
// normally, otherwise a debug hand would keep reappearing every round.
test("newGame's initialDeal applies only to the first round played", async () => {
  const strategies: [Strategy, Strategy, Strategy, Strategy] = [quickPlay, quickPlay, quickPlay, quickPlay];
  const assignedHand: Hand = [
    { rank: "7", suit: "s" },
    { rank: "8", suit: "s" },
    { rank: "9", suit: "s" },
  ];
  const g = newGame(1, strategies, undefined, { assignedHands: new Map([[0, assignedHand]]) });

  let round1Hand: Hand | undefined;
  g.onDeal = (_pot, hands) => {
    round1Hand = hands.get(0);
  };
  await g.playRound();
  assert.deepEqual(round1Hand, assignedHand);

  let round2Hand: Hand | undefined;
  g.onDeal = (_pot, hands) => {
    round2Hand = hands.get(0);
  };
  await g.playRound();
  assert.notDeepEqual(round2Hand, assignedHand);
});

test("nextActiveSeatClockwise skips eliminated seats and wraps", () => {
  assert.equal(nextActiveSeatClockwise(0, [0, 1, 2, 3]), 1);
  assert.equal(nextActiveSeatClockwise(3, [0, 1, 2, 3]), 0);
  assert.equal(nextActiveSeatClockwise(0, [0, 2, 3]), 2, "must skip eliminated seat 1");
  assert.equal(nextActiveSeatClockwise(2, [0, 2]), 0, "must wrap past eliminated seats 1 and 3");
});

test("prevActiveSeatCounterClockwise skips eliminated seats and wraps", () => {
  assert.equal(prevActiveSeatCounterClockwise(1, [0, 1, 2, 3]), 0);
  assert.equal(prevActiveSeatCounterClockwise(0, [0, 1, 2, 3]), 3);
  assert.equal(prevActiveSeatCounterClockwise(3, [0, 3]), 0, "must skip eliminated seats 1 and 2");
});

// Regression test: specs/rules.md's dealer rotation must skip a seat
// eliminated before this round was played, not just seats eliminated
// by it — the dealer should never land on a seat no longer in the game.
test("playRound advances the dealer clockwise, skipping an eliminated seat", async () => {
  const strategies: [Strategy, Strategy, Strategy, Strategy] = [quickPlay, quickPlay, quickPlay, quickPlay];
  const g = new Game({
    strategies,
    rng: new Rng(1),
    eliminated: [false, true, false, false],
    dealerSeat: 0,
  });

  await g.playRound();

  assert.equal(g.dealerSeat, 2, "dealer must skip eliminated seat 1");
});

test("playRound wraps the dealer from seat 3 back to seat 0", async () => {
  const strategies: [Strategy, Strategy, Strategy, Strategy] = [quickPlay, quickPlay, quickPlay, quickPlay];
  const g = new Game({ strategies, rng: new Rng(1), dealerSeat: 3 });

  await g.playRound();

  assert.equal(g.dealerSeat, 0);
});

// The seat clockwise of the dealer acts first, per specs/rules.md —
// not the dealer itself.
test("playRound deals to the seat clockwise of the dealer first", async () => {
  const strategies: [Strategy, Strategy, Strategy, Strategy] = [quickPlay, quickPlay, quickPlay, quickPlay];
  const g = new Game({ strategies, rng: new Rng(1), dealerSeat: 1 });

  let reportedFirstSeat: number | undefined;
  g.onDeal = (_pot, _hands, firstSeat) => {
    reportedFirstSeat = firstSeat;
  };

  await g.playRound();
  assert.equal(reportedFirstSeat, 2);
});

// A resumed game (specs/state.md) restores its dealer exactly, with no
// rotation applied on the first playRound() call of the new instance —
// only a genuinely new round advances the dealer.
test("a restored dealerSeat is used as-is for the resumed round, then advances normally", async () => {
  const strategies: [Strategy, Strategy, Strategy, Strategy] = [quickPlay, quickPlay, quickPlay, quickPlay];
  const g = new Game({ strategies, rng: new Rng(1), dealerSeat: 2 });
  assert.equal(g.dealerSeat, 2);

  let firstRoundFirstSeat: number | undefined;
  g.onDeal = (_pot, _hands, firstSeat) => {
    firstRoundFirstSeat = firstSeat;
  };
  await g.playRound();
  assert.equal(firstRoundFirstSeat, 3, "the restored dealer's round must not have been advanced first");
  assert.equal(g.dealerSeat, 3, "the dealer must advance once this round is over");
});

// newGame with no explicit dealerSeat and no debug-forced firstSeat
// picks a dealer at random among the initially active seats, up front
// (available even before the first round is dealt).
test("newGame picks a random initial dealer among active seats", () => {
  const strategies: [Strategy, Strategy, Strategy, Strategy] = [quickPlay, quickPlay, quickPlay, quickPlay];
  const g = newGame(1, strategies);
  assert.ok(g.dealerSeat !== undefined && g.dealerSeat >= 0 && g.dealerSeat < 4);
});

// The debug turn parameter (specs/params.md) forces round 1's
// firstSeat directly; the notional dealer it implies is derived as the
// active seat counter-clockwise of that forced seat, so later rounds
// still rotate sensibly.
test("a debug-forced firstSeat derives a matching notional dealer", () => {
  const strategies: [Strategy, Strategy, Strategy, Strategy] = [quickPlay, quickPlay, quickPlay, quickPlay];
  const g = newGame(1, strategies, undefined, { firstSeat: 2 });
  assert.equal(g.dealerSeat, 1);
});
