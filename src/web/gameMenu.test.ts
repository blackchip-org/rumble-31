import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDebugMenuGameState } from "./gameMenu.ts";
import type { DebugParams } from "./params.ts";
import { parseStrikesDigits } from "../game/strikes.ts";
import type { Settings } from "./settings.ts";

function params(strikesRaw: string): DebugParams {
  return {
    initialStrikes: parseStrikesDigits(strikesRaw),
    initialDeal: undefined,
    skipDealAnimation: false,
    screen: "menu",
    clear: false,
    platform: undefined,
    ageMinutes: undefined,
  };
}

const settings: Settings = { soundsEnabled: true, bot1: "regular", bot2: "difficult", bot3: "easy", swapConfirmCancel: false };

const cases = [
  {
    name: "no strikes: nobody eliminated",
    strikesRaw: "0000",
    wantStrikes: [0, 0, 0, 0],
    wantEliminated: [false, false, false, false],
    wantSecondChance: [false, false, false, false],
  },
  {
    name: "a seat with 3+ strikes starts eliminated",
    strikesRaw: "3102",
    wantStrikes: [3, 1, 0, 2],
    wantEliminated: [true, false, false, false],
    wantSecondChance: [false, false, false, false],
  },
  {
    name: "a seat given s starts with an active second chance, not eliminated",
    strikesRaw: "s102",
    wantStrikes: [3, 1, 0, 2],
    wantEliminated: [false, false, false, false],
    wantSecondChance: [true, false, false, false],
  },
];

test("buildDebugMenuGameState strikes/eliminated/secondChance status", () => {
  for (const c of cases) {
    const got = buildDebugMenuGameState(params(c.strikesRaw), settings);
    assert.deepEqual(got.strikes, c.wantStrikes, c.name);
    assert.deepEqual(got.eliminated, c.wantEliminated, c.name);
    assert.deepEqual(got.secondChance, c.wantSecondChance, c.name);
  }
});

test("buildDebugMenuGameState reflects the given Settings' bot difficulties", () => {
  const got = buildDebugMenuGameState(params("0000"), settings);
  assert.deepEqual(got.botSeats, ["regular", "difficult", "easy"]);
});

test("buildDebugMenuGameState has no round in progress and no log yet", () => {
  const got = buildDebugMenuGameState(params("0000"), settings);
  assert.equal(got.roundNum, 1);
  assert.equal(got.dealerSeat, 0);
  assert.deepEqual(got.log, []);
  assert.equal(got.checkpoint, undefined);
});
