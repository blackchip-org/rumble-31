import { test } from "node:test";
import assert from "node:assert/strict";
import {
  loadStats,
  saveStats,
  recordGameStarted,
  recordGameAbandoned,
  recordRoundElimination,
  recordGamePlace,
  ratingFor,
  totalWinLossTie,
  gamesPlayedFor,
  viewStats,
  type StatsStore,
  type WinLossTie,
  type DifficultyStats,
} from "./stats.ts";
import type { BotSkillLevel } from "../bot/factory.ts";
import type { BotSeats } from "./botAssignment.ts";

// memoryStorage returns a minimal in-memory Storage, same as
// state.test.ts's own helper -- Node's test runner has no browser
// localStorage, and stats.ts only needs getItem/setItem.
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

function wlt(wins: number, losses: number, ties: number): WinLossTie {
  return { wins, losses, ties };
}

function emptyRecords(): Record<BotSkillLevel, WinLossTie> {
  return { novice: wlt(0, 0, 0), advanced: wlt(0, 0, 0), expert: wlt(0, 0, 0) };
}

test("saveStats/loadStats round-trips", () => {
  const storage = memoryStorage();
  const store = loadStats(storage);
  recordGameStarted(store, "2");
  saveStats(store, storage);

  const reloaded = loadStats(storage);
  assert.equal(reloaded.byBotVersion["2"]?.global.gamesPlayed, 1);
});

test("loadStats falls back to an empty store", () => {
  const cases: Array<{ name: string; raw: string | null }> = [
    { name: "nothing stored", raw: null },
    { name: "not JSON", raw: "not json" },
    { name: "wrong schema version", raw: JSON.stringify({ version: 999, store: { byBotVersion: {} } }) },
    { name: "not an object", raw: JSON.stringify(42) },
  ];
  for (const { name, raw } of cases) {
    const storage = memoryStorage(raw === null ? {} : { "rumble31.stats": raw });
    assert.deepEqual(loadStats(storage), { byBotVersion: {} }, name);
  }
});

test("recordGameStarted/recordGameAbandoned increment Global Stats per bot version", () => {
  const store = loadStats(memoryStorage());
  recordGameStarted(store, "2");
  recordGameStarted(store, "2");
  recordGameAbandoned(store, "2");
  recordGameStarted(store, "3");

  assert.equal(store.byBotVersion["2"]?.global.gamesPlayed, 2);
  assert.equal(store.byBotVersion["2"]?.global.gamesAbandoned, 1);
  assert.equal(store.byBotVersion["3"]?.global.gamesPlayed, 1);
  assert.equal(store.byBotVersion["3"]?.global.gamesAbandoned, 0);
});

const BOT_SEATS: BotSeats = ["novice", "advanced", "expert"];
const NOT_ELIMINATED = [false, false, false, false];

test("recordRoundElimination applies specs/stats.md's win/loss/tie rule", () => {
  const cases: Array<{
    name: string;
    eliminatedBeforeRound: readonly boolean[];
    eliminatedThisRound: readonly number[];
    wantNovice: WinLossTie;
    wantAdvanced: WinLossTie;
    wantExpert: WinLossTie;
  }> = [
    {
      name: "South eliminated alone -> loss against every active bot",
      eliminatedBeforeRound: NOT_ELIMINATED,
      eliminatedThisRound: [0],
      wantNovice: wlt(0, 1, 0),
      wantAdvanced: wlt(0, 1, 0),
      wantExpert: wlt(0, 1, 0),
    },
    {
      name: "South and West (novice) eliminated together -> tie for West, loss for the rest",
      eliminatedBeforeRound: NOT_ELIMINATED,
      eliminatedThisRound: [0, 1],
      wantNovice: wlt(0, 0, 1),
      wantAdvanced: wlt(0, 1, 0),
      wantExpert: wlt(0, 1, 0),
    },
    {
      name: "North (advanced) eliminated alone, South remains -> win",
      eliminatedBeforeRound: NOT_ELIMINATED,
      eliminatedThisRound: [2],
      wantNovice: wlt(0, 0, 0),
      wantAdvanced: wlt(1, 0, 0),
      wantExpert: wlt(0, 0, 0),
    },
    {
      name: "a bot already eliminated before this round is skipped",
      eliminatedBeforeRound: [false, true, false, false],
      eliminatedThisRound: [0],
      wantNovice: wlt(0, 0, 0),
      wantAdvanced: wlt(0, 1, 0),
      wantExpert: wlt(0, 1, 0),
    },
  ];

  for (const { name, eliminatedBeforeRound, eliminatedThisRound, wantNovice, wantAdvanced, wantExpert } of cases) {
    const store = loadStats(memoryStorage());
    recordRoundElimination(store, "2", "moderate", BOT_SEATS, eliminatedBeforeRound, eliminatedThisRound);

    const bvStats = store.byBotVersion["2"];
    assert.ok(bvStats, name);
    assert.deepEqual(bvStats.global.recordsBySkill.novice, wantNovice, `${name} (global novice)`);
    assert.deepEqual(bvStats.global.recordsBySkill.advanced, wantAdvanced, `${name} (global advanced)`);
    assert.deepEqual(bvStats.global.recordsBySkill.expert, wantExpert, `${name} (global expert)`);
    // Per-difficulty mirrors global for the difficulty the round was
    // played at, and other difficulties/bot versions stay untouched.
    assert.deepEqual(bvStats.perDifficulty.moderate.recordsBySkill.novice, wantNovice, `${name} (moderate novice)`);
    assert.deepEqual(bvStats.perDifficulty.easy.recordsBySkill, emptyRecords(), `${name} (easy untouched)`);
    assert.equal(store.byBotVersion["3"], undefined, `${name} (other bot version untouched)`);
  }
});

test("recordGamePlace tracks Wins per place and the three streaks", () => {
  const store = loadStats(memoryStorage());
  const dates = ["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04", "2026-01-05"];
  const places: Array<1 | 2 | 3 | 4> = [1, 1, 2, 4, 1];

  const wantWinsPerPlace: Array<[number, number, number, number]> = [
    [1, 0, 0, 0],
    [2, 0, 0, 0],
    [2, 1, 0, 0],
    [2, 1, 0, 1],
    [3, 1, 0, 1],
  ];
  const wantFirstPlace: Array<{ current: [number, string?]; best: [number, string?] }> = [
    { current: [1, "2026-01-01"], best: [1, "2026-01-01"] },
    { current: [2, "2026-01-01"], best: [2, "2026-01-02"] },
    { current: [0, undefined], best: [2, "2026-01-02"] },
    { current: [0, undefined], best: [2, "2026-01-02"] },
    { current: [1, "2026-01-05"], best: [2, "2026-01-02"] },
  ];
  const wantTopTwo: Array<{ current: [number, string?]; best: [number, string?] }> = [
    { current: [1, "2026-01-01"], best: [1, "2026-01-01"] },
    { current: [2, "2026-01-01"], best: [2, "2026-01-02"] },
    { current: [3, "2026-01-01"], best: [3, "2026-01-03"] },
    { current: [0, undefined], best: [3, "2026-01-03"] },
    { current: [1, "2026-01-05"], best: [3, "2026-01-03"] },
  ];
  const wantNotLast: Array<{ current: [number, string?]; best: [number, string?] }> = [
    { current: [1, "2026-01-01"], best: [1, "2026-01-01"] },
    { current: [2, "2026-01-01"], best: [2, "2026-01-02"] },
    { current: [3, "2026-01-01"], best: [3, "2026-01-03"] },
    { current: [0, undefined], best: [3, "2026-01-03"] },
    { current: [1, "2026-01-05"], best: [3, "2026-01-03"] },
  ];

  for (let i = 0; i < places.length; i++) {
    recordGamePlace(store, "2", "hard", places[i] as 1 | 2 | 3 | 4, dates[i] as string);
    const dStats = store.byBotVersion["2"]?.perDifficulty.hard as DifficultyStats;

    assert.deepEqual(dStats.winsPerPlace, wantWinsPerPlace[i], `step ${i} winsPerPlace`);

    const [wantFirstCount, wantFirstStart] = wantFirstPlace[i]?.current as [number, string?];
    const [wantFirstBestCount, wantFirstBestEnd] = wantFirstPlace[i]?.best as [number, string?];
    assert.equal(dStats.firstPlaceStreak.current.count, wantFirstCount, `step ${i} firstPlace current.count`);
    assert.equal(dStats.firstPlaceStreak.current.startDate, wantFirstStart, `step ${i} firstPlace current.startDate`);
    assert.equal(dStats.firstPlaceStreak.best.count, wantFirstBestCount, `step ${i} firstPlace best.count`);
    assert.equal(dStats.firstPlaceStreak.best.endDate, wantFirstBestEnd, `step ${i} firstPlace best.endDate`);

    const [wantTopTwoCount, wantTopTwoStart] = wantTopTwo[i]?.current as [number, string?];
    const [wantTopTwoBestCount, wantTopTwoBestEnd] = wantTopTwo[i]?.best as [number, string?];
    assert.equal(dStats.topTwoStreak.current.count, wantTopTwoCount, `step ${i} topTwo current.count`);
    assert.equal(dStats.topTwoStreak.current.startDate, wantTopTwoStart, `step ${i} topTwo current.startDate`);
    assert.equal(dStats.topTwoStreak.best.count, wantTopTwoBestCount, `step ${i} topTwo best.count`);
    assert.equal(dStats.topTwoStreak.best.endDate, wantTopTwoBestEnd, `step ${i} topTwo best.endDate`);

    const [wantNotLastCount, wantNotLastStart] = wantNotLast[i]?.current as [number, string?];
    const [wantNotLastBestCount, wantNotLastBestEnd] = wantNotLast[i]?.best as [number, string?];
    assert.equal(dStats.notLastStreak.current.count, wantNotLastCount, `step ${i} notLast current.count`);
    assert.equal(dStats.notLastStreak.current.startDate, wantNotLastStart, `step ${i} notLast current.startDate`);
    assert.equal(dStats.notLastStreak.best.count, wantNotLastBestCount, `step ${i} notLast best.count`);
    assert.equal(dStats.notLastStreak.best.endDate, wantNotLastBestEnd, `step ${i} notLast best.endDate`);
  }
});

test("ratingFor derives Rating from winsPerPlace, no stored denominator", () => {
  const cases: Array<{ name: string; winsPerPlace: [number, number, number, number]; want: number }> = [
    { name: "no games", winsPerPlace: [0, 0, 0, 0], want: 0 },
    { name: "always fourth", winsPerPlace: [0, 0, 0, 1], want: 0 },
    { name: "always first", winsPerPlace: [1, 0, 0, 0], want: 1000 },
    { name: "one of each place", winsPerPlace: [1, 1, 1, 1], want: 500 },
    { name: "mostly first, some second", winsPerPlace: [3, 1, 0, 0], want: 917 },
  ];
  for (const { name, winsPerPlace, want } of cases) {
    const dStats: DifficultyStats = {
      winsPerPlace,
      recordsBySkill: emptyRecords(),
      firstPlaceStreak: { current: { count: 0 }, best: { count: 0 } },
      topTwoStreak: { current: { count: 0 }, best: { count: 0 } },
      notLastStreak: { current: { count: 0 }, best: { count: 0 } },
    };
    assert.equal(ratingFor(dStats), want, name);
  }
});

test("abandoning a game scores like South being eliminated right now", () => {
  const store = loadStats(memoryStorage());
  recordGameStarted(store, "2");

  // One bot (West, novice) was already eliminated earlier in the game;
  // North (advanced) and East (expert) are still active when the
  // player abandons.
  const eliminatedAtAbandon = [false, true, false, false];
  recordRoundElimination(store, "2", "easy", BOT_SEATS, eliminatedAtAbandon, [0]);
  recordGameAbandoned(store, "2");
  recordGamePlace(store, "2", "easy", 2, "2026-03-01");

  const bvStats = store.byBotVersion["2"];
  assert.ok(bvStats);
  assert.equal(bvStats.global.gamesAbandoned, 1);
  assert.deepEqual(bvStats.global.recordsBySkill.novice, wlt(0, 0, 0), "already-gone bot is untouched");
  assert.deepEqual(bvStats.global.recordsBySkill.advanced, wlt(0, 1, 0), "still-active bot gets a loss, never a tie");
  assert.deepEqual(bvStats.global.recordsBySkill.expert, wlt(0, 1, 0));
  assert.deepEqual(bvStats.perDifficulty.easy.winsPerPlace, [0, 1, 0, 0]);
});

test("viewStats reads without creating or saving a store entry", () => {
  const storage = memoryStorage();
  const store = loadStats(storage);

  const seen = viewStats(store, "2");
  assert.equal(seen.global.gamesPlayed, 0);
  assert.equal(store.byBotVersion["2"], undefined, "an unseen version must not be inserted into the store");

  recordGameStarted(store, "2");
  assert.equal(viewStats(store, "2").global.gamesPlayed, 1, "a real entry is still visible once one exists");
});

test("totalWinLossTie sums every skill's record", () => {
  const cases: Array<{ name: string; records: Record<BotSkillLevel, WinLossTie>; want: WinLossTie }> = [
    { name: "all empty", records: emptyRecords(), want: wlt(0, 0, 0) },
    {
      name: "mixed records",
      records: { novice: wlt(38, 10, 2), advanced: wlt(51, 33, 6), expert: wlt(19, 21, 4) },
      want: wlt(108, 64, 12),
    },
  ];
  for (const { name, records, want } of cases) {
    assert.deepEqual(totalWinLossTie(records), want, name);
  }
});

test("gamesPlayedFor sums winsPerPlace", () => {
  const cases: Array<{ name: string; winsPerPlace: [number, number, number, number]; want: number }> = [
    { name: "no games", winsPerPlace: [0, 0, 0, 0], want: 0 },
    { name: "some of each place", winsPerPlace: [28, 9, 3, 1], want: 41 },
  ];
  for (const { name, winsPerPlace, want } of cases) {
    const dStats: DifficultyStats = {
      winsPerPlace,
      recordsBySkill: emptyRecords(),
      firstPlaceStreak: { current: { count: 0 }, best: { count: 0 } },
      topTwoStreak: { current: { count: 0 }, best: { count: 0 } },
      notLastStreak: { current: { count: 0 }, best: { count: 0 } },
    };
    assert.equal(gamesPlayedFor(dStats), want, name);
  }
});
