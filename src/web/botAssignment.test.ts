import { test } from "node:test";
import assert from "node:assert/strict";
import { assignBotSeats } from "./botAssignment.ts";
import type { BotName } from "../bot/factory.ts";
import { Rng } from "../rng.ts";
import { defaultSettings, type Settings } from "./settings.ts";

test("assignBotSeats is a permutation of the configured bots", () => {
  const settings: Settings = { ...defaultSettings, bot1: "easy", bot2: "regular", bot3: "difficult" };
  const cases = [1, 2, 3, 4, 5, 42, 1000];

  for (const seed of cases) {
    const got = assignBotSeats(settings, new Rng(seed));
    assert.deepEqual([...got].sort(), (["difficult", "easy", "regular"] as BotName[]).sort(), `seed ${seed}`);
  }
});

test("assignBotSeats with the same seed is deterministic", () => {
  const settings: Settings = { ...defaultSettings, bot1: "easy", bot2: "regular", bot3: "difficult" };
  const a = assignBotSeats(settings, new Rng(42));
  const b = assignBotSeats(settings, new Rng(42));
  assert.deepEqual(a, b);
});

test("assignBotSeats does not mutate settings", () => {
  const settings: Settings = { ...defaultSettings, bot1: "easy", bot2: "regular", bot3: "difficult" };
  assignBotSeats(settings, new Rng(42));
  assert.deepEqual(settings, { ...defaultSettings, bot1: "easy", bot2: "regular", bot3: "difficult" });
});

test("assignBotSeats varies across seeds", () => {
  const settings: Settings = { ...defaultSettings, bot1: "easy", bot2: "regular", bot3: "difficult" };
  const results = new Set<string>();
  for (let seed = 0; seed < 20; seed++) {
    results.add(JSON.stringify(assignBotSeats(settings, new Rng(seed))));
  }
  assert.ok(results.size > 1, "expected more than one distinct seat assignment across seeds");
});
