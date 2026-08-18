import { test } from "node:test";
import assert from "node:assert/strict";
import { assignBotSeats } from "./botAssignment.ts";
import { DIFFICULTY_BOT_STRATEGIES } from "../config.ts";
import { Rng } from "../rng.ts";
import { defaultSettings, type Settings } from "./settings.ts";

test("assignBotSeats is a permutation of the configured difficulty's bots", () => {
  const settings: Settings = { ...defaultSettings, difficulty: "moderate" };
  const cases = [1, 2, 3, 4, 5, 42, 1000];

  for (const seed of cases) {
    const got = assignBotSeats(settings, new Rng(seed));
    assert.deepEqual([...got].sort(), [...DIFFICULTY_BOT_STRATEGIES.moderate].sort(), `seed ${seed}`);
  }
});

test("assignBotSeats with the same seed is deterministic", () => {
  const settings: Settings = { ...defaultSettings, difficulty: "moderate" };
  const a = assignBotSeats(settings, new Rng(42));
  const b = assignBotSeats(settings, new Rng(42));
  assert.deepEqual(a, b);
});

test("assignBotSeats does not mutate settings", () => {
  const settings: Settings = { ...defaultSettings, difficulty: "moderate" };
  assignBotSeats(settings, new Rng(42));
  assert.deepEqual(settings, { ...defaultSettings, difficulty: "moderate" });
});

test("assignBotSeats varies across seeds", () => {
  const settings: Settings = { ...defaultSettings, difficulty: "moderate" };
  const results = new Set<string>();
  for (let seed = 0; seed < 20; seed++) {
    results.add(JSON.stringify(assignBotSeats(settings, new Rng(seed))));
  }
  assert.ok(results.size > 1, "expected more than one distinct seat assignment across seeds");
});
