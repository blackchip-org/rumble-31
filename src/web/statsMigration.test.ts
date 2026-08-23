import { test } from "node:test";
import assert from "node:assert/strict";
import { correctMissingTies, needsTieCorrection, runStartupMigrations } from "./statsMigration.ts";
import { loadStats, saveStats, totalWinLossTie, type StatsStore } from "./stats.ts";

// memoryStorage returns a minimal in-memory Storage, same helper as
// every other web/*.test.ts file -- Node's test runner has no browser
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

// storeFrom builds a StatsStore by round-tripping raw through
// loadStats (mirrors upgrade.test.ts's sampleStatsStore pattern),
// letting stats.ts's own normalization fill in every field a test case
// doesn't care about (streaks, gamesAbandoned, etc).
function storeFrom(byBotVersion: unknown): StatsStore {
  const storage = memoryStorage({ "rumble31.stats": JSON.stringify({ version: 1, store: { byBotVersion } }) });
  return loadStats(storage);
}

test("needsTieCorrection only fires for the exact v6 -> v7 transition", () => {
  const cases: { storedVersion: string | null; currentVersion: string; want: boolean }[] = [
    { storedVersion: null, currentVersion: "7", want: true },
    { storedVersion: "6", currentVersion: "7", want: true },
    { storedVersion: "7", currentVersion: "7", want: false },
    { storedVersion: "5", currentVersion: "7", want: false },
    { storedVersion: null, currentVersion: "6", want: false },
    { storedVersion: null, currentVersion: "8", want: false },
    { storedVersion: "6", currentVersion: "8", want: false },
  ];
  for (const { storedVersion, currentVersion, want } of cases) {
    assert.equal(needsTieCorrection(storedVersion, currentVersion), want, `stored=${storedVersion} current=${currentVersion}`);
  }
});

test("correctMissingTies credits each difficulty's shortfall to its dominant skill", () => {
  const cases: { name: string; games: [number, number, number, number]; recordsBySkill: Record<string, { wins: number; losses: number; ties: number }>; wantTiesAdded: number; wantSkill: "novice" | "advanced" | "expert" }[] = [
    {
      name: "easy shortfall goes to novice",
      games: [4, 0, 0, 0],
      recordsBySkill: { novice: { wins: 9, losses: 2, ties: 0 }, advanced: { wins: 0, losses: 0, ties: 0 }, expert: { wins: 0, losses: 0, ties: 0 } },
      wantTiesAdded: 1,
      wantSkill: "novice",
    },
    {
      name: "moderate shortfall goes to advanced",
      games: [0, 3, 0, 0],
      recordsBySkill: { novice: { wins: 0, losses: 0, ties: 0 }, advanced: { wins: 5, losses: 3, ties: 0 }, expert: { wins: 0, losses: 0, ties: 0 } },
      wantTiesAdded: 1,
      wantSkill: "advanced",
    },
    {
      name: "hard shortfall goes to expert",
      games: [0, 0, 2, 0],
      recordsBySkill: { novice: { wins: 0, losses: 0, ties: 0 }, advanced: { wins: 0, losses: 0, ties: 0 }, expert: { wins: 4, losses: 1, ties: 0 } },
      wantTiesAdded: 1,
      wantSkill: "expert",
    },
    {
      name: "no shortfall is a no-op",
      games: [1, 0, 0, 0],
      recordsBySkill: { novice: { wins: 3, losses: 0, ties: 0 }, advanced: { wins: 0, losses: 0, ties: 0 }, expert: { wins: 0, losses: 0, ties: 0 } },
      wantTiesAdded: 0,
      wantSkill: "novice",
    },
    {
      name: "more than one missing tie in the same difficulty",
      games: [3, 0, 0, 0],
      recordsBySkill: { novice: { wins: 5, losses: 2, ties: 0 }, advanced: { wins: 0, losses: 0, ties: 0 }, expert: { wins: 0, losses: 0, ties: 0 } },
      wantTiesAdded: 2,
      wantSkill: "novice",
    },
  ];

  for (const { name, games, recordsBySkill, wantTiesAdded, wantSkill } of cases) {
    const difficulty = wantSkill === "novice" ? "easy" : wantSkill === "advanced" ? "moderate" : "hard";
    const store = storeFrom({ "1": { perDifficulty: { [difficulty]: { winsPerPlace: games, recordsBySkill } } } });
    const before = totalWinLossTie(store.byBotVersion["1"]!.perDifficulty[difficulty].recordsBySkill);

    correctMissingTies(store);

    const dStats = store.byBotVersion["1"]!.perDifficulty[difficulty];
    const after = totalWinLossTie(dStats.recordsBySkill);
    assert.equal(after.ties - before.ties, wantTiesAdded, name);
    assert.equal(dStats.recordsBySkill[wantSkill].ties, wantTiesAdded, name);
    assert.equal(after.wins + after.losses + after.ties, games.reduce((a, b) => a + b, 0) * 3, `${name}: still matches bot-opponent count`);
  }
});

test("correctMissingTies recomputes global.recordsBySkill as the sum of the corrected per-difficulty records", () => {
  const store = storeFrom({
    "1": {
      perDifficulty: {
        easy: { winsPerPlace: [2, 0, 0, 0], recordsBySkill: { novice: { wins: 5, losses: 0, ties: 0 }, advanced: {}, expert: {} } },
        hard: { winsPerPlace: [1, 0, 0, 0], recordsBySkill: { expert: { wins: 2, losses: 0, ties: 0 }, novice: {}, advanced: {} } },
      },
      // Stale/wrong global on purpose -- correctMissingTies must
      // overwrite it, not trust it.
      global: { recordsBySkill: { novice: { wins: 99, losses: 99, ties: 99 }, advanced: {}, expert: {} } },
    },
  });

  correctMissingTies(store);

  const bvStats = store.byBotVersion["1"]!;
  const expectedNovice = { wins: 5, losses: 0, ties: 1 };
  const expectedExpert = { wins: 2, losses: 0, ties: 1 };
  assert.deepEqual(bvStats.global.recordsBySkill.novice, expectedNovice);
  assert.deepEqual(bvStats.global.recordsBySkill.expert, expectedExpert);
});

test("correctMissingTies handles multiple bot versions independently", () => {
  const store = storeFrom({
    "1": { perDifficulty: { easy: { winsPerPlace: [1, 0, 0, 0], recordsBySkill: { novice: { wins: 2, losses: 0, ties: 0 }, advanced: {}, expert: {} } } } },
    "2": { perDifficulty: { hard: { winsPerPlace: [1, 0, 0, 0], recordsBySkill: { expert: { wins: 3, losses: 0, ties: 0 }, novice: {}, advanced: {} } } } },
  });

  correctMissingTies(store);

  assert.equal(store.byBotVersion["1"]!.perDifficulty.easy.recordsBySkill.novice.ties, 1);
  assert.equal(store.byBotVersion["2"]!.perDifficulty.hard.recordsBySkill.expert.ties, 0);
});

test("runStartupMigrations runs once on the v6 -> v7 upgrade, persists the version marker, and never runs again", () => {
  const storage = memoryStorage();
  let store = storeFrom({ "1": { perDifficulty: { easy: { winsPerPlace: [4, 0, 0, 0], recordsBySkill: { novice: { wins: 9, losses: 2, ties: 0 }, advanced: {}, expert: {} } } } } });

  const firstRun = runStartupMigrations(store, storage, "7");
  assert.equal(firstRun, true);
  assert.equal(store.byBotVersion["1"]!.perDifficulty.easy.recordsBySkill.novice.ties, 1);
  assert.equal(storage.getItem("rumble31.appVersion"), "7");

  // Simulate main.ts persisting the corrected store, then reloading it
  // on a later visit at the same version -- the migration must not
  // fire again and double the tie.
  saveStats(store, storage);
  store = loadStats(storage);
  const secondRun = runStartupMigrations(store, storage, "7");
  assert.equal(secondRun, false);
  assert.equal(store.byBotVersion["1"]!.perDifficulty.easy.recordsBySkill.novice.ties, 1);
});

test("runStartupMigrations does nothing for a version transition other than 6 -> 7", () => {
  const storage = memoryStorage();
  const store = storeFrom({ "1": { perDifficulty: { easy: { winsPerPlace: [4, 0, 0, 0], recordsBySkill: { novice: { wins: 9, losses: 2, ties: 0 }, advanced: {}, expert: {} } } } } });

  const ran = runStartupMigrations(store, storage, "8");
  assert.equal(ran, false);
  assert.equal(store.byBotVersion["1"]!.perDifficulty.easy.recordsBySkill.novice.ties, 0);
  assert.equal(storage.getItem("rumble31.appVersion"), "8");
});
