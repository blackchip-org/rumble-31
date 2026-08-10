import { test } from "node:test";
import assert from "node:assert/strict";
import { Match, newMatch } from "./match.ts";
import { trade, knock, exchange, strategyFunc } from "./types.ts";
import type { PlayerResult, PlayerView, Result, Strategy } from "./types.ts";
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
    const m = new Match({ strikes: tt.preStrikes, eliminated: tt.preEliminated });
    const result = resultWithScores(tt.scores);

    const { struck, eliminated } = m.applyResult(tt.active, result);

    assert.deepEqual(struck, tt.wantStruck, tt.name);
    assert.deepEqual(eliminated, tt.wantEliminated, tt.name);
    assert.deepEqual(m.strikes, tt.wantStrikes, tt.name);
  }
});

// Regression test: when the only two remaining active seats tie for
// lowest and both were already on 2 strikes, they both reach 3 strikes
// in the same round. Eliminating both would leave zero active seats and
// no winner at all, contradicting "the last remaining player is the
// winner" — they must end the match tied as co-winners instead.
test("simultaneous elimination of the last two seats ends the match in a tie", () => {
  const m = new Match({ strikes: [3, 3, 2, 2], eliminated: [true, true, false, false] });
  const result = resultWithScores([0, 0, 15, 15]);

  const { struck, eliminated } = m.applyResult([2, 3], result);

  assert.deepEqual(struck, [2, 3]);
  assert.deepEqual(eliminated, []);
  assert.equal(m.eliminated[2], false);
  assert.equal(m.eliminated[3], false);
  assert.equal(m.active(), false);
  assert.deepEqual(m.winners(), [2, 3]);
});

// quickPlay trades once on the first turn and knocks every turn after,
// ending each game quickly. It's stateless, so the same value can be
// shared across all four seats.
const quickPlay: Strategy = strategyFunc((v: PlayerView) => (v.isFirstTurnOfGame ? trade(0, 0) : knock()));

test("run plays a full match to a valid conclusion", () => {
  for (const seed of [1, 2, 3, 42]) {
    const strategies: [Strategy, Strategy, Strategy, Strategy] = [quickPlay, quickPlay, quickPlay, quickPlay];
    const m = newMatch(seed, strategies);

    const { winners, log } = m.run();

    assert.ok(winners.length > 0, `seed=${seed}: winners is empty`);
    for (const seat of winners) {
      assert.ok((m.strikes[seat] as number) < 3, `seed=${seed}: winner seat ${seat} has 3+ strikes`);
    }
    for (let seat = 0; seat < 4; seat++) {
      if (m.eliminated[seat]) {
        assert.equal(m.strikes[seat], 3, `seed=${seed}: eliminated seat ${seat} strikes`);
      }
    }
    assert.ok(log.length > 0, `seed=${seed}: log is empty`);
    // At most 4 seats * 3 strikes each can ever be handed out, and
    // every game hands out at least one strike.
    assert.ok(log.length <= 12, `seed=${seed}: log.length = ${log.length}, want <= 12`);
    for (const outcome of log) {
      for (const seat of outcome.eliminated) {
        assert.ok(outcome.struck.includes(seat), `seed=${seed}: eliminated seat ${seat} not in struck`);
      }
    }
  }
});

test("playGame deals once, narrates turns, and picks up strategy swaps next game", () => {
  const strategies: [Strategy, Strategy, Strategy, Strategy] = [quickPlay, quickPlay, quickPlay, quickPlay];
  const m = newMatch(1, strategies);

  let dealtCalls = 0;
  m.onDeal = () => dealtCalls++;
  let turnCalls = 0;
  m.onTurn = () => turnCalls++;

  m.playGame();
  assert.equal(dealtCalls, 1);
  assert.ok(turnCalls > 0);

  // No single game can hand out more than one strike per seat, so the
  // match is guaranteed to still be active after exactly one game —
  // safe to play a second without picking a special seed.
  assert.ok(m.active(), "match ended after a single game");

  // Swapping strategies between games must take effect starting with
  // the very next game.
  const alwaysExchange: Strategy = strategyFunc((v: PlayerView) => (v.isFirstTurnOfGame ? exchange() : knock()));
  m.strategies = [alwaysExchange, alwaysExchange, alwaysExchange, alwaysExchange];

  let firstActionType: string | undefined;
  m.onTurn = (rec) => {
    if (firstActionType === undefined) {
      firstActionType = rec.action.type;
    }
  };

  m.playGame();
  assert.equal(firstActionType, "exchange");
});

// Regression test: a seat eliminated in an earlier game must not be
// dealt a hand, take a turn, or appear in the result of a later game —
// only bookkeeping (strikes/eliminated) should persist for it.
test("playGame excludes an already-eliminated seat from dealing, turns, and results", () => {
  const strategies: [Strategy, Strategy, Strategy, Strategy] = [quickPlay, quickPlay, quickPlay, quickPlay];
  const m = new Match({
    strategies,
    rng: new Rng(1),
    strikes: [3, 0, 0, 0],
    eliminated: [true, false, false, false],
  });

  const turnSeats = new Set<number>();
  m.onTurn = (rec) => turnSeats.add(rec.seat);

  const outcome = m.playGame();

  assert.deepEqual(
    outcome.result.players.map((pr) => pr.seat).sort((a, b) => a - b),
    [1, 2, 3],
  );
  assert.equal(turnSeats.has(0), false);
});

// newMatch's initialStrikes (for the CLI's -strikes debug flag) seeds
// each seat's strike count directly, and a seat starting at 3 or more
// must already be eliminated — consistent with applyResult's own
// threshold for strikes earned through play.
test("newMatch seeds initial strikes, eliminating any seat starting at 3 or more", () => {
  const strategies: [Strategy, Strategy, Strategy, Strategy] = [quickPlay, quickPlay, quickPlay, quickPlay];
  const m = newMatch(1, strategies, [3, 1, 0, 4]);

  assert.deepEqual(m.strikes, [3, 1, 0, 4]);
  assert.deepEqual(m.eliminated, [true, false, false, true]);

  const outcome = m.playGame();
  assert.deepEqual(
    outcome.result.players.map((pr) => pr.seat).sort((a, b) => a - b),
    [1, 2],
  );
});
