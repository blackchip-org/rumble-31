import { test } from "node:test";
import assert from "node:assert/strict";
import {
  loadStats,
  saveStats,
  recordGameStarted,
  recordGameAbandoned,
  recordRoundElimination,
  recordRoundPlayed,
  recordGamePlace,
  recordGameCompleted,
  ratingFor,
  totalWinLossTie,
  winPercentFor,
  gamesPlayedFor,
  sumPerDifficulty,
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

const BOT_SEATS: BotSeats = ["novice", "advanced", "expert"];
const NOT_ELIMINATED = [false, false, false, false];

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

function emptyDStats(): DifficultyStats {
  return {
    winsPerPlace: [0, 0, 0, 0],
    recordsBySkill: emptyRecords(),
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
  };
}

test("loadStats normalizes a partial or malformed stored entry instead of trusting it", () => {
  const cases: Array<{ name: string; storedEntry: unknown; want: StatsStore["byBotVersion"]["x"] }> = [
    {
      name: "bot version entry missing perDifficulty entirely",
      storedEntry: { global: { gamesPlayed: 5, gamesAbandoned: 1, recordsBySkill: emptyRecords() } },
      want: { global: { gamesPlayed: 5, gamesAbandoned: 1, recordsBySkill: emptyRecords() }, perDifficulty: { easy: emptyDStats(), moderate: emptyDStats(), hard: emptyDStats() } },
    },
    {
      name: "global.recordsBySkill missing skill keys",
      storedEntry: { global: { gamesPlayed: 0, gamesAbandoned: 0, recordsBySkill: { novice: wlt(3, 1, 0) } }, perDifficulty: {} },
      want: {
        global: { gamesPlayed: 0, gamesAbandoned: 0, recordsBySkill: { novice: wlt(3, 1, 0), advanced: wlt(0, 0, 0), expert: wlt(0, 0, 0) } },
        perDifficulty: { easy: emptyDStats(), moderate: emptyDStats(), hard: emptyDStats() },
      },
    },
    {
      name: "winsPerPlace is the wrong shape",
      storedEntry: { global: { gamesPlayed: 0, gamesAbandoned: 0, recordsBySkill: emptyRecords() }, perDifficulty: { easy: { winsPerPlace: [1, 2, 3] } } },
      want: { global: { gamesPlayed: 0, gamesAbandoned: 0, recordsBySkill: emptyRecords() }, perDifficulty: { easy: emptyDStats(), moderate: emptyDStats(), hard: emptyDStats() } },
    },
    {
      name: "non-numeric win/loss/tie fields",
      storedEntry: { global: { gamesPlayed: "lots", gamesAbandoned: 0, recordsBySkill: { novice: { wins: "3", losses: 1, ties: null } } }, perDifficulty: {} },
      want: {
        global: { gamesPlayed: 0, gamesAbandoned: 0, recordsBySkill: { novice: wlt(0, 1, 0), advanced: wlt(0, 0, 0), expert: wlt(0, 0, 0) } },
        perDifficulty: { easy: emptyDStats(), moderate: emptyDStats(), hard: emptyDStats() },
      },
    },
    { name: "entry is entirely the wrong type", storedEntry: "not an object", want: { global: { gamesPlayed: 0, gamesAbandoned: 0, recordsBySkill: emptyRecords() }, perDifficulty: { easy: emptyDStats(), moderate: emptyDStats(), hard: emptyDStats() } } },
  ];

  for (const { name, storedEntry, want } of cases) {
    const raw = JSON.stringify({ version: 1, store: { byBotVersion: { x: storedEntry } } });
    const storage = memoryStorage({ "rumble31.stats": raw });
    assert.deepEqual(loadStats(storage).byBotVersion.x, want, name);
  }
});

test("a normalized malformed entry survives real use without crashing (regression)", () => {
  // Reproduces the reported crash: a stored bot-version entry missing
  // a skill's record entirely used to throw "Cannot read properties
  // of undefined (reading 'losses')" the first time recordRoundElimination
  // tried to increment it.
  const raw = JSON.stringify({
    version: 1,
    store: { byBotVersion: { "2": { global: { gamesPlayed: 1, gamesAbandoned: 0, recordsBySkill: { novice: wlt(0, 0, 0) } }, perDifficulty: {} } } },
  });
  const store = loadStats(memoryStorage({ "rumble31.stats": raw }));

  assert.doesNotThrow(() => recordRoundElimination(store, "2", "easy", BOT_SEATS, NOT_ELIMINATED, [0]));
  assert.deepEqual(totalWinLossTie(store.byBotVersion["2"]?.global.recordsBySkill as Record<BotSkillLevel, WinLossTie>), wlt(0, 3, 0));
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

test("recordRoundElimination skips a seat whose botSeats entry isn't a recognized skill", () => {
  // Reproduces a reported crash: abandoning a game passes a resumed
  // GameState's botSeats straight through, and a game paused since
  // before that field existed (or in some other now-unrecognized
  // shape) used to throw "Cannot read properties of undefined
  // (reading 'losses')" instead of just skipping that seat.
  const cases: Array<{ name: string; botSeats: unknown }> = [
    { name: "entirely missing", botSeats: undefined },
    { name: "too short (missing indices)", botSeats: ["novice"] },
    { name: "unrecognized skill string", botSeats: ["novice", "legendary", "expert"] },
    { name: "null entries", botSeats: [null, null, null] },
  ];

  for (const { name, botSeats } of cases) {
    const store = loadStats(memoryStorage());
    assert.doesNotThrow(() => recordRoundElimination(store, "2", "easy", botSeats as BotSeats, NOT_ELIMINATED, [0]), name);
  }

  // The one recognized seat in the mixed case still gets recorded.
  const store = loadStats(memoryStorage());
  recordRoundElimination(store, "2", "easy", ["novice", "legendary", "expert"] as unknown as BotSeats, NOT_ELIMINATED, [0]);
  const bvStats = store.byBotVersion["2"];
  assert.deepEqual(bvStats?.global.recordsBySkill.novice, wlt(0, 1, 0), "recognized seat still recorded");
  assert.deepEqual(bvStats?.global.recordsBySkill.expert, wlt(0, 1, 0), "recognized seat still recorded");
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

test("recordRoundPlayed always bumps roundsPlayed, and only bumps best/bestWithX when South was the round's best", () => {
  const cases: Array<{
    name: string;
    southWasBest: boolean;
    southScore: number | undefined;
    wantBest: number;
    wantBest32: number;
    wantBest31: number;
    wantBest305: number;
  }> = [
    { name: "South not best -> best untouched", southWasBest: false, southScore: 28, wantBest: 0, wantBest32: 0, wantBest31: 0, wantBest305: 0 },
    { name: "South best with an ordinary score", southWasBest: true, southScore: 24, wantBest: 1, wantBest32: 0, wantBest31: 0, wantBest305: 0 },
    { name: "South best with 32 (three aces)", southWasBest: true, southScore: 32, wantBest: 1, wantBest32: 1, wantBest31: 0, wantBest305: 0 },
    { name: "South best with 31", southWasBest: true, southScore: 31, wantBest: 1, wantBest32: 0, wantBest31: 1, wantBest305: 0 },
    { name: "South best with 30.5 (three of a kind)", southWasBest: true, southScore: 30.5, wantBest: 1, wantBest32: 0, wantBest31: 0, wantBest305: 1 },
    { name: "South best but score missing", southWasBest: true, southScore: undefined, wantBest: 1, wantBest32: 0, wantBest31: 0, wantBest305: 0 },
  ];

  for (const { name, southWasBest, southScore, wantBest, wantBest32, wantBest31, wantBest305 } of cases) {
    const store = loadStats(memoryStorage());
    recordRoundPlayed(store, "2", "easy", southWasBest, southScore);
    const dStats = store.byBotVersion["2"]?.perDifficulty.easy as DifficultyStats;

    assert.equal(dStats.roundsPlayed, 1, `${name} (roundsPlayed)`);
    assert.equal(dStats.best, wantBest, `${name} (best)`);
    assert.equal(dStats.bestWith32, wantBest32, `${name} (bestWith32)`);
    assert.equal(dStats.bestWith31, wantBest31, `${name} (bestWith31)`);
    assert.equal(dStats.bestWith305, wantBest305, `${name} (bestWith305)`);
  }
});

test("recordRoundPlayed keeps accumulating roundsPlayed/best across rounds even when the game is later abandoned (no recordGameCompleted call)", () => {
  const store = loadStats(memoryStorage());
  recordRoundPlayed(store, "2", "hard", true, 20);
  recordRoundPlayed(store, "2", "hard", false, 12);
  recordRoundPlayed(store, "2", "hard", true, 31);
  // Game abandoned here -- recordGameCompleted is deliberately never
  // called, but the rounds already played still count.

  const dStats = store.byBotVersion["2"]?.perDifficulty.hard as DifficultyStats;
  assert.equal(dStats.roundsPlayed, 3);
  assert.equal(dStats.best, 2);
  assert.equal(dStats.bestWith31, 1);
  assert.equal(dStats.zeroStrikeWins, 0, "recordGameCompleted was never called for the abandoned game");
  assert.equal(dStats.oneStrikeWins, 0, "recordGameCompleted was never called for the abandoned game");
});

test("recordGameCompleted sorts a win into exactly one of the four Wins by strikes buckets", () => {
  const cases: Array<{ name: string; southFinalStrikes: number; wantZero: number; wantOne: number; wantTwo: number; wantSecondChance: number }> = [
    { name: "flawless win", southFinalStrikes: 0, wantZero: 1, wantOne: 0, wantTwo: 0, wantSecondChance: 0 },
    { name: "one-strike win", southFinalStrikes: 1, wantZero: 0, wantOne: 1, wantTwo: 0, wantSecondChance: 0 },
    { name: "two-strike win", southFinalStrikes: 2, wantZero: 0, wantOne: 0, wantTwo: 1, wantSecondChance: 0 },
    { name: "second-chance win (three strikes, only reachable via the leniency)", southFinalStrikes: 3, wantZero: 0, wantOne: 0, wantTwo: 0, wantSecondChance: 1 },
  ];

  for (const { name, southFinalStrikes, wantZero, wantOne, wantTwo, wantSecondChance } of cases) {
    const store = loadStats(memoryStorage());
    recordGameCompleted(store, "2", "moderate", true, southFinalStrikes);
    const dStats = store.byBotVersion["2"]?.perDifficulty.moderate as DifficultyStats;

    assert.equal(dStats.zeroStrikeWins, wantZero, `${name} (zeroStrikeWins)`);
    assert.equal(dStats.oneStrikeWins, wantOne, `${name} (oneStrikeWins)`);
    assert.equal(dStats.twoStrikeWins, wantTwo, `${name} (twoStrikeWins)`);
    assert.equal(dStats.secondChanceWins, wantSecondChance, `${name} (secondChanceWins)`);
  }
});

test("recordGameCompleted leaves every bucket untouched for a loss, regardless of strike count", () => {
  const store = loadStats(memoryStorage());
  recordGameCompleted(store, "2", "moderate", false, 0);
  recordGameCompleted(store, "2", "moderate", false, 3);

  const dStats = store.byBotVersion["2"]?.perDifficulty.moderate;
  assert.equal(dStats, undefined, "a loss never even creates a stored entry, since nothing was incremented");
});

test("sumPerDifficulty totals one field across Easy/Moderate/Hard", () => {
  const perDifficulty: Record<"easy" | "moderate" | "hard", DifficultyStats> = {
    easy: { ...emptyDStats(), roundsPlayed: 5 },
    moderate: { ...emptyDStats(), roundsPlayed: 9 },
    hard: { ...emptyDStats(), roundsPlayed: 2 },
  };
  assert.equal(sumPerDifficulty(perDifficulty, (d) => d.roundsPlayed), 16);
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
    const dStats: DifficultyStats = { ...emptyDStats(), winsPerPlace };
    assert.equal(ratingFor(dStats), want, name);
  }
});

test("winPercentFor derives Win% from a WinLossTie", () => {
  const cases: Array<{ name: string; wlt: WinLossTie; want: number }> = [
    { name: "no games", wlt: { wins: 0, losses: 0, ties: 0 }, want: 0 },
    { name: "all wins", wlt: { wins: 4, losses: 0, ties: 0 }, want: 100 },
    { name: "all losses", wlt: { wins: 0, losses: 4, ties: 0 }, want: 0 },
    { name: "mixed record", wlt: { wins: 1, losses: 1, ties: 1 }, want: (1 / 3) * 100 },
    { name: "ties count toward the denominator, not the numerator", wlt: { wins: 3, losses: 0, ties: 1 }, want: 75 },
  ];
  for (const { name, wlt, want } of cases) {
    assert.equal(winPercentFor(wlt), want, name);
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
    const dStats: DifficultyStats = { ...emptyDStats(), winsPerPlace };
    assert.equal(gamesPlayedFor(dStats), want, name);
  }
});
