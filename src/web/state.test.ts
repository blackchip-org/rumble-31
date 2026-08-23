import { test } from "node:test";
import assert from "node:assert/strict";
import { clearState, loadState, saveState, type GameState, type OverState, type SavedState } from "./state.ts";
import type { BotResult } from "./overScreen.ts";

// memoryStorage returns a minimal in-memory Storage — Node's test
// runner has no browser localStorage, and state.ts only needs
// getItem/setItem/removeItem.
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
      [0, [{ rank: "7", suit: "s" }, { rank: "8", suit: "s" }, { rank: "9", suit: "s" }]],
      [1, [{ rank: "7", suit: "h" }, { rank: "8", suit: "h" }, { rank: "9", suit: "h" }]],
    ],
    pot: [{ rank: "7", suit: "d" }, { rank: "8", suit: "d" }, { rank: "9", suit: "d" }],
    firstSeat: 1,
    turnIndex: 2,
    knocked: true,
    knockerSeat: 0,
    botMemory: [
      [1, { name: "novice", bestScore: 15, bestTurn: 3 }],
      [
        2,
        {
          name: "advanced",
          bestScore: 20,
          bestTurn: 1,
        },
      ],
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

// Built without spreading sampleGame's checkpoint field: JSON has no
// way to represent an explicit `checkpoint: undefined`, so a
// round-tripped OverState never has the key at all, and this must
// match that shape exactly for the deepEqual checks below.
const sampleOver: OverState = {
  strikes: sampleGame.strikes,
  eliminated: sampleGame.eliminated,
  secondChance: sampleGame.secondChance,
  roundNum: sampleGame.roundNum,
  dealerSeat: sampleGame.dealerSeat,
  botSeats: sampleGame.botSeats,
  log: sampleGame.log,
  southWon: true,
  southPlace: 1,
  botResults: ["win", "win", "win"] as [BotResult, BotResult, BotResult],
};

test("loadState", () => {
  const cases: Array<{ name: string; stored: Record<string, string>; want: SavedState | undefined }> = [
    { name: "nothing stored: no saved state", stored: {}, want: undefined },
    { name: "malformed JSON: no saved state", stored: { "rumble31.state": "not json" }, want: undefined },
    { name: "JSON missing version: no saved state", stored: { "rumble31.state": '{"state":{"screen":"main","savedAt":100}}' }, want: undefined },
    { name: "wrong schema version: no saved state", stored: { "rumble31.state": '{"version":99,"state":{"screen":"main","savedAt":100}}' }, want: undefined },
    { name: "unrecognized screen: no saved state", stored: { "rumble31.state": '{"version":9,"state":{"screen":"bogus","savedAt":100}}' }, want: undefined },
    { name: "screen missing entirely: no saved state", stored: { "rumble31.state": '{"version":9,"state":{"savedAt":100}}' }, want: undefined },
    { name: "savedAt missing: no saved state", stored: { "rumble31.state": '{"version":9,"state":{"screen":"main"}}' }, want: undefined },
    { name: "savedAt wrong type: no saved state", stored: { "rumble31.state": '{"version":9,"state":{"screen":"main","savedAt":"100"}}' }, want: undefined },
    { name: "valid main screen", stored: { "rumble31.state": '{"version":9,"state":{"screen":"main","savedAt":100}}' }, want: { screen: "main", savedAt: 100 } },
    {
      name: "valid difficulty screen",
      stored: { "rumble31.state": '{"version":9,"state":{"screen":"difficulty","savedAt":100}}' },
      want: { screen: "difficulty", savedAt: 100 },
    },
    {
      name: "valid settings screen, from main",
      stored: { "rumble31.state": '{"version":9,"state":{"screen":"settings","from":"main","savedAt":100}}' },
      want: { screen: "settings", from: "main", savedAt: 100 },
    },
    {
      name: "valid settings screen, from the game menu",
      stored: {
        "rumble31.state": JSON.stringify({ version: 9, state: { screen: "settings", from: "menu", game: sampleGame, savedAt: 100 } }),
      },
      want: { screen: "settings", from: "menu", game: sampleGame, savedAt: 100 },
    },
    { name: "valid about screen", stored: { "rumble31.state": '{"version":9,"state":{"screen":"about","savedAt":100}}' }, want: { screen: "about", savedAt: 100 } },
    {
      name: "valid licenses screen",
      stored: { "rumble31.state": '{"version":9,"state":{"screen":"licenses","savedAt":100}}' },
      want: { screen: "licenses", savedAt: 100 },
    },
    {
      name: "valid game screen",
      stored: { "rumble31.state": JSON.stringify({ version: 9, state: { screen: "game", game: sampleGame, savedAt: 100 } }) },
      want: { screen: "game", game: sampleGame, savedAt: 100 },
    },
    {
      name: "valid over screen",
      stored: { "rumble31.state": JSON.stringify({ version: 9, state: { screen: "over", game: sampleOver, savedAt: 100 } }) },
      want: { screen: "over", game: sampleOver, savedAt: 100 },
    },
    {
      name: "valid menu screen",
      stored: { "rumble31.state": JSON.stringify({ version: 9, state: { screen: "menu", game: sampleGame, savedAt: 100 } }) },
      want: { screen: "menu", game: sampleGame, savedAt: 100 },
    },
    {
      name: "old schema version (pre-savedAt): no saved state",
      stored: { "rumble31.state": JSON.stringify({ version: 6, state: { screen: "game", game: sampleGame } }) },
      want: undefined,
    },
  ];

  for (const c of cases) {
    const got = loadState(memoryStorage(c.stored));
    assert.deepEqual(got, c.want, c.name);
  }
});

test("saveState round-trips through loadState, stamping savedAt from now", () => {
  const storage = memoryStorage();
  let clock = 1000;
  const now = () => clock;

  saveState({ screen: "main" }, storage, now);
  assert.deepEqual(loadState(storage), { screen: "main", savedAt: 1000 });

  saveState({ screen: "difficulty" }, storage, now);
  assert.deepEqual(loadState(storage), { screen: "difficulty", savedAt: 1000 });

  clock = 2000;
  saveState({ screen: "licenses" }, storage, now);
  assert.deepEqual(loadState(storage), { screen: "licenses", savedAt: 2000 });

  saveState({ screen: "settings", from: "main" }, storage, now);
  assert.deepEqual(loadState(storage), { screen: "settings", from: "main", savedAt: 2000 });

  saveState({ screen: "settings", from: "menu", game: sampleGame }, storage, now);
  assert.deepEqual(loadState(storage), { screen: "settings", from: "menu", game: sampleGame, savedAt: 2000 });

  saveState({ screen: "game", game: sampleGame }, storage, now);
  assert.deepEqual(loadState(storage), { screen: "game", game: sampleGame, savedAt: 2000 });

  clock = 3000;
  saveState({ screen: "over", game: sampleOver }, storage, now);
  assert.deepEqual(loadState(storage), { screen: "over", game: sampleOver, savedAt: 3000 });

  saveState({ screen: "menu", game: sampleGame }, storage, now);
  assert.deepEqual(loadState(storage), { screen: "menu", game: sampleGame, savedAt: 3000 });
});

test("clearState removes saved state", () => {
  const storage = memoryStorage();
  saveState({ screen: "game", game: sampleGame }, storage);
  assert.notEqual(loadState(storage), undefined);

  clearState(storage);
  assert.equal(loadState(storage), undefined);

  // Clearing when nothing is stored is a no-op, not an error.
  clearState(storage);
  assert.equal(loadState(storage), undefined);
});
