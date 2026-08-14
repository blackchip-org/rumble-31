import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDebugMenuGameState } from "./gameMenu.ts";
import type { DebugParams } from "./params.ts";
import type { Settings } from "./settings.ts";

function params(initialStrikes: [number, number, number, number]): DebugParams {
  return {
    initialStrikes,
    initialDeal: undefined,
    skipDealAnimation: false,
    screen: "menu",
    clear: false,
    platform: undefined,
  };
}

const settings: Settings = { soundsEnabled: true, bot1: "regular", bot2: "difficult", bot3: "easy", swapConfirmCancel: false };

const cases = [
  {
    name: "no strikes: nobody eliminated",
    strikes: [0, 0, 0, 0] as [number, number, number, number],
    wantEliminated: [false, false, false, false],
  },
  {
    name: "a seat with 3+ strikes starts eliminated",
    strikes: [3, 1, 0, 2] as [number, number, number, number],
    wantEliminated: [true, false, false, false],
  },
];

test("buildDebugMenuGameState eliminated status", () => {
  for (const c of cases) {
    const got = buildDebugMenuGameState(params(c.strikes), settings);
    assert.deepEqual(got.eliminated, c.wantEliminated, c.name);
    assert.deepEqual(got.strikes, c.strikes, c.name);
  }
});

test("buildDebugMenuGameState reflects the given Settings' bot difficulties", () => {
  const got = buildDebugMenuGameState(params([0, 0, 0, 0]), settings);
  assert.deepEqual(got.botSeats, ["regular", "difficult", "easy"]);
});

test("buildDebugMenuGameState has no round in progress and no log yet", () => {
  const got = buildDebugMenuGameState(params([0, 0, 0, 0]), settings);
  assert.equal(got.roundNum, 1);
  assert.equal(got.dealerSeat, 0);
  assert.deepEqual(got.log, []);
  assert.equal(got.checkpoint, undefined);
});
