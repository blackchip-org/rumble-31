import { test } from "node:test";
import assert from "node:assert/strict";
import { clearState, loadState, saveState, type GameState, type PersistedState } from "./state.ts";

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
    botState: [
      [1, { best: { score: 15, repeatCount: 1 }, failsafeLap: 11 }],
      [2, { best: { score: 20, repeatCount: 0 }, failsafeLap: 12 }],
      [3, { best: { score: 18, repeatCount: 2 }, failsafeLap: 10 }],
    ],
  },
};

test("loadState", () => {
  const cases: Array<{ name: string; stored: Record<string, string>; want: PersistedState | undefined }> = [
    { name: "nothing stored: no saved state", stored: {}, want: undefined },
    { name: "malformed JSON: no saved state", stored: { "rumble31.state": "not json" }, want: undefined },
    { name: "JSON missing version: no saved state", stored: { "rumble31.state": '{"state":{"screen":"main"}}' }, want: undefined },
    { name: "wrong schema version: no saved state", stored: { "rumble31.state": '{"version":99,"state":{"screen":"main"}}' }, want: undefined },
    { name: "unrecognized screen: no saved state", stored: { "rumble31.state": '{"version":12,"state":{"screen":"bogus"}}' }, want: undefined },
    { name: "screen missing entirely: no saved state", stored: { "rumble31.state": '{"version":12,"state":{}}' }, want: undefined },
    { name: "a screen no longer resumable (about): no saved state", stored: { "rumble31.state": '{"version":12,"state":{"screen":"about"}}' }, want: undefined },
    { name: "valid main screen", stored: { "rumble31.state": '{"version":12,"state":{"screen":"main"}}' }, want: { screen: "main" } },
    {
      name: "valid game screen",
      stored: { "rumble31.state": JSON.stringify({ version: 12, state: { screen: "game", game: sampleGame } }) },
      want: { screen: "game", game: sampleGame },
    },
    {
      name: "valid menu screen",
      stored: { "rumble31.state": JSON.stringify({ version: 12, state: { screen: "menu", game: sampleGame } }) },
      want: { screen: "menu", game: sampleGame },
    },
    {
      name: "previous schema version: no saved state",
      stored: { "rumble31.state": JSON.stringify({ version: 11, state: { screen: "game", game: sampleGame, savedAt: 100 } }) },
      want: undefined,
    },
  ];

  for (const c of cases) {
    const got = loadState(memoryStorage(c.stored));
    assert.deepEqual(got, c.want, c.name);
  }
});

test("saveState round-trips through loadState", () => {
  const storage = memoryStorage();

  saveState({ screen: "main" }, storage);
  assert.deepEqual(loadState(storage), { screen: "main" });

  saveState({ screen: "game", game: sampleGame }, storage);
  assert.deepEqual(loadState(storage), { screen: "game", game: sampleGame });

  saveState({ screen: "menu", game: sampleGame }, storage);
  assert.deepEqual(loadState(storage), { screen: "menu", game: sampleGame });
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
