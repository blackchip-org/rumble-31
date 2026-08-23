// Guards the "clean upgrade" contract state.ts/stats.ts/settings.ts each
// promise (specs/state.md, specs/stats.md): a player who upgrades to a
// new release with an old, differently-shaped value already sitting in
// local storage must never see a thrown error -- at worst, that one
// value is discarded and defaults take over. Rather than hand-picking a
// few old shapes, this mutates a known-valid saved blob one field at a
// time (deleting it, or swapping in a value of the wrong type) and
// checks every single-field corruption survives a load, and, for stats,
// that every function the app actually calls on the loaded result still
// runs without error.

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadState, type GameState, type OverState, type SavedState } from "./state.ts";
import { loadStats, ratingFor, totalWinLossTie, gamesPlayedFor, sumPerDifficulty, recordGameStarted, recordGamePlace, type StatsStore } from "./stats.ts";
import { loadSettings, type Settings } from "./settings.ts";
import { DIFFICULTIES } from "../config.ts";
import { SUIT_COLORS } from "./cardSheet.ts";
import { FOCUS_FIRSTS } from "./focusNav.ts";
import type { BotResult } from "./overScreen.ts";

// memoryStorage returns a minimal in-memory Storage, same helper as the
// other web/*.test.ts files -- Node's test runner has no browser
// localStorage.
function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    clear: () => data.clear(),
    key: (index: number) => Array.from(data.keys())[index] ?? null,
    get length() {
      return data.size;
    },
  } as Storage;
}

// STATE_SCREEN_IDS mirrors state.ts's own (unexported) list -- every
// screen loadState is willing to hand back.
const STATE_SCREEN_IDS = ["main", "difficulty", "settings", "about", "licenses", "htp", "stats", "game", "over", "menu"];

// A single-field mutation of some JSON-compatible value: either that
// field deleted, or replaced with a value of an unrelated type.
interface Mutation {
  path: string;
  value: unknown;
}

const WRONG_TYPE_SENTINELS: unknown[] = [null, 0, "wrong-type", true, [], {}];

// singleFieldMutations walks value recursively and returns one variant
// per corrupted field: every object key deleted one at a time, every
// object/array element replaced with each sentinel one at a time, plus
// the same recursively for nested objects/arrays. Each returned value
// differs from the input in exactly one place, mimicking a single field
// that changed shape (renamed, retyped, or dropped) between releases.
function singleFieldMutations(value: unknown, path = "$"): Mutation[] {
  const out: Mutation[] = [];
  if (Array.isArray(value)) {
    value.forEach((element, i) => {
      out.push({ path: `${path}[${i}] deleted`, value: value.filter((_, j) => j !== i) });
      for (const sentinel of WRONG_TYPE_SENTINELS) {
        out.push({ path: `${path}[${i}] = ${JSON.stringify(sentinel)}`, value: value.map((v, j) => (j === i ? sentinel : v)) });
      }
      for (const child of singleFieldMutations(element, `${path}[${i}]`)) {
        out.push({ path: child.path, value: value.map((v, j) => (j === i ? child.value : v)) });
      }
    });
  } else if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      const withoutKey = { ...obj };
      delete withoutKey[key];
      out.push({ path: `${path}.${key} deleted`, value: withoutKey });
      for (const sentinel of WRONG_TYPE_SENTINELS) {
        out.push({ path: `${path}.${key} = ${JSON.stringify(sentinel)}`, value: { ...obj, [key]: sentinel } });
      }
      for (const child of singleFieldMutations(obj[key], `${path}.${key}`)) {
        out.push({ path: child.path, value: { ...obj, [key]: child.value } });
      }
    }
  }
  return out;
}

const sampleGame: GameState = {
  strikes: [0, 1, 0, 2],
  eliminated: [false, false, false, false],
  secondChance: [false, false, false, false],
  roundNum: 3,
  dealerSeat: 0,
  botSeats: ["novice", "advanced", "expert"],
  log: ["", "=== Round 3 ===", "Pot is dealt [7s 8h 9c]"],
  checkpoint: {
    hands: [
      [
        0,
        [
          { rank: "7", suit: "s" },
          { rank: "8", suit: "s" },
          { rank: "9", suit: "s" },
        ],
      ],
    ],
    pot: [
      { rank: "7", suit: "d" },
      { rank: "8", suit: "d" },
      { rank: "9", suit: "d" },
    ],
    firstSeat: 1,
    turnIndex: 2,
    knocked: true,
    knockerSeat: 0,
    botMemory: [
      [1, { name: "novice", bestScore: 15, bestTurn: 3 }],
      [
        3,
        {
          name: "expert",
          bestScore: 18,
          bestTurn: 2,
          upstreamKnown: [{ rank: "7", suit: "h" }],
          downstreamKnown: [],
          neighbors: { upstreamSeat: 2, downstreamSeat: 1, lastTurn: { seat: 2, type: "knock", given: [], taken: [] } },
        },
      ],
    ],
  },
};

const sampleOver: OverState = {
  strikes: sampleGame.strikes,
  eliminated: sampleGame.eliminated,
  secondChance: sampleGame.secondChance,
  roundNum: sampleGame.roundNum,
  dealerSeat: sampleGame.dealerSeat,
  botSeats: sampleGame.botSeats,
  log: sampleGame.log,
  southWon: true,
  botResults: ["win", "win", "win"] as [BotResult, BotResult, BotResult],
};

test("loadState never errors on a single-field-corrupted saved game/over screen -- it's accepted as-is or rejected outright, never thrown", () => {
  const envelopes = [
    { version: 8, state: { screen: "game", game: sampleGame, savedAt: 100 } },
    { version: 8, state: { screen: "over", game: sampleOver, savedAt: 100 } },
  ];
  for (const envelope of envelopes) {
    for (const mutation of singleFieldMutations(envelope)) {
      const storage = memoryStorage({ "rumble31.state": JSON.stringify(mutation.value) });
      let got: SavedState | undefined;
      assert.doesNotThrow(() => {
        got = loadState(storage);
      }, mutation.path);
      if (got !== undefined) {
        assert.ok(STATE_SCREEN_IDS.includes(got.screen), `${mutation.path}: unrecognized screen ${JSON.stringify(got.screen)}`);
        assert.equal(typeof got.savedAt, "number", mutation.path);
      }
    }
  }
});

const sampleStatsStore = {
  byBotVersion: {
    "3": {
      global: {
        gamesPlayed: 12,
        gamesAbandoned: 2,
        recordsBySkill: { novice: { wins: 5, losses: 1, ties: 0 }, advanced: { wins: 3, losses: 2, ties: 1 }, expert: { wins: 1, losses: 4, ties: 0 } },
      },
      perDifficulty: {
        easy: {
          winsPerPlace: [4, 2, 1, 0],
          recordsBySkill: { novice: { wins: 4, losses: 0, ties: 0 }, advanced: { wins: 2, losses: 1, ties: 0 }, expert: { wins: 0, losses: 2, ties: 0 } },
          firstPlaceStreak: { current: { count: 2, startDate: "2026-08-20" }, best: { count: 3, endDate: "2026-08-15" } },
          topTwoStreak: { current: { count: 4, startDate: "2026-08-18" }, best: { count: 4, endDate: "2026-08-22" } },
          notLastStreak: { current: { count: 6, startDate: "2026-08-16" }, best: { count: 6, endDate: "2026-08-22" } },
          roundsPlayed: 30,
          zeroStrikeWins: 2,
          oneStrikeWins: 1,
          twoStrikeWins: 1,
          secondChanceWins: 0,
          best: 5,
          bestWith32: 1,
          bestWith31: 2,
          bestWith305: 0,
        },
        moderate: {
          winsPerPlace: [1, 1, 1, 1],
          recordsBySkill: { novice: { wins: 1, losses: 1, ties: 1 }, advanced: { wins: 1, losses: 1, ties: 0 }, expert: { wins: 1, losses: 2, ties: 0 } },
          firstPlaceStreak: { current: { count: 0 }, best: { count: 1, endDate: "2026-08-10" } },
          topTwoStreak: { current: { count: 0 }, best: { count: 2, endDate: "2026-08-11" } },
          notLastStreak: { current: { count: 1, startDate: "2026-08-22" }, best: { count: 3, endDate: "2026-08-05" } },
          roundsPlayed: 10,
          zeroStrikeWins: 0,
          oneStrikeWins: 1,
          twoStrikeWins: 0,
          secondChanceWins: 0,
          best: 1,
          bestWith32: 0,
          bestWith31: 0,
          bestWith305: 1,
        },
        hard: {
          winsPerPlace: [0, 0, 0, 0],
          recordsBySkill: { novice: { wins: 0, losses: 0, ties: 0 }, advanced: { wins: 0, losses: 0, ties: 0 }, expert: { wins: 0, losses: 0, ties: 0 } },
          firstPlaceStreak: { current: { count: 0 }, best: { count: 0 } },
          topTwoStreak: { current: { count: 0 }, best: { count: 0 } },
          notLastStreak: { current: { count: 0 }, best: { count: 0 } },
          roundsPlayed: 0,
          zeroStrikeWins: 0,
          oneStrikeWins: 0,
          twoStrikeWins: 0,
          secondChanceWins: 0,
          best: 0,
          bestWith32: 0,
          bestWith31: 0,
          bestWith305: 0,
        },
      },
    },
  },
};

test("loadStats never errors on a single-field-corrupted saved store, and every stats function the app calls on the result still runs cleanly", () => {
  const envelope = { version: 1, store: sampleStatsStore };
  for (const mutation of singleFieldMutations(envelope)) {
    const storage = memoryStorage({ "rumble31.stats": JSON.stringify(mutation.value) });
    let got: StatsStore | undefined;
    assert.doesNotThrow(() => {
      got = loadStats(storage);
    }, mutation.path);

    assert.doesNotThrow(() => {
      for (const botVersion of Object.keys(got!.byBotVersion)) {
        const bvStats = got!.byBotVersion[botVersion]!;
        totalWinLossTie(bvStats.global.recordsBySkill);
        for (const difficulty of DIFFICULTIES) {
          const dStats = bvStats.perDifficulty[difficulty];
          ratingFor(dStats);
          gamesPlayedFor(dStats);
          totalWinLossTie(dStats.recordsBySkill);
        }
        sumPerDifficulty(bvStats.perDifficulty, (d) => d.roundsPlayed);
      }
      // Also exercise the write path -- playing (and finishing) a game
      // against a store that was just loaded from a corrupted value
      // must be just as safe as reading it.
      recordGameStarted(got!, "3");
      recordGamePlace(got!, "3", "easy", 1, "2026-08-23");
    }, mutation.path);
  }
});

const sampleSettings: Settings = { soundsEnabled: false, difficulty: "hard", swapConfirmCancel: true, suitColor: "two", focusFirst: "hand" };

test("loadSettings never errors on a single-field-corrupted saved settings blob -- each field falls back to a valid value independently", () => {
  for (const mutation of singleFieldMutations(sampleSettings)) {
    const storage = memoryStorage({ "rumble31.settings": JSON.stringify(mutation.value) });
    let got: Settings | undefined;
    assert.doesNotThrow(() => {
      got = loadSettings(storage);
    }, mutation.path);
    assert.equal(typeof got!.soundsEnabled, "boolean", mutation.path);
    assert.ok((DIFFICULTIES as readonly string[]).includes(got!.difficulty), mutation.path);
    assert.equal(typeof got!.swapConfirmCancel, "boolean", mutation.path);
    assert.ok((SUIT_COLORS as readonly string[]).includes(got!.suitColor), mutation.path);
    assert.ok((FOCUS_FIRSTS as readonly string[]).includes(got!.focusFirst), mutation.path);
  }
});
