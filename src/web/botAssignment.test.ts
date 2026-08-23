import { test } from "node:test";
import assert from "node:assert/strict";
import { assignBotSeats, pickBotSkillLevels } from "./botAssignment.ts";
import { DIFFICULTY_BOT_SKILL_LEVELS } from "../config.ts";
import { Rng } from "../rng.ts";
import { defaultSettings, type Settings } from "./settings.ts";

// FixedRng always returns the same next() value, for deterministically
// landing pickBotSkillLevels' roll in one particular weight band (same
// pattern as src/bot/advanced.test.ts's FixedRng).
class FixedRng extends Rng {
  private value: number;
  constructor(value: number) {
    super(0);
    this.value = value;
  }
  next(): number {
    return this.value;
  }
}

// next() values chosen to land the *100 roll just inside each
// difficulty's three cumulative weight bands (specs/bots.md).
const pickCases = [
  { name: "easy 80% band", difficulty: "easy", value: 0, wantSeats: ["novice", "novice", "novice"] },
  { name: "easy 15% band", difficulty: "easy", value: 0.85, wantSeats: ["novice", "novice", "advanced"] },
  { name: "easy 5% band", difficulty: "easy", value: 0.97, wantSeats: ["novice", "novice", "expert"] },
  { name: "moderate 80% band", difficulty: "moderate", value: 0, wantSeats: ["advanced", "advanced", "advanced"] },
  { name: "moderate 10% downgrade band", difficulty: "moderate", value: 0.85, wantSeats: ["advanced", "advanced", "novice"] },
  { name: "moderate 10% upgrade band", difficulty: "moderate", value: 0.95, wantSeats: ["advanced", "advanced", "expert"] },
  { name: "hard 80% band", difficulty: "hard", value: 0, wantSeats: ["expert", "expert", "expert"] },
  { name: "hard 15% band", difficulty: "hard", value: 0.85, wantSeats: ["expert", "expert", "advanced"] },
  { name: "hard 5% band", difficulty: "hard", value: 0.97, wantSeats: ["expert", "expert", "novice"] },
] as const;

test("pickBotSkillLevels picks the option for the rolled weight band", () => {
  for (const c of pickCases) {
    const got = pickBotSkillLevels(c.difficulty, new FixedRng(c.value));
    assert.deepEqual([...got], c.wantSeats, c.name);
  }
});

test("assignBotSeats is a permutation of one of the configured difficulty's weighted options", () => {
  const settings: Settings = { ...defaultSettings, difficulty: "moderate" };
  const cases = [1, 2, 3, 4, 5, 42, 1000];
  const sortedOptions = DIFFICULTY_BOT_SKILL_LEVELS.moderate.map((option) => [...option.seats].sort());

  for (const seed of cases) {
    const got = [...assignBotSeats(settings, new Rng(seed))].sort();
    assert.ok(
      sortedOptions.some((option) => JSON.stringify(option) === JSON.stringify(got)),
      `seed ${seed}: ${JSON.stringify(got)} is not one of moderate's weighted options`,
    );
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
