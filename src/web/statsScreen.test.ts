import { test } from "node:test";
import assert from "node:assert/strict";
import { formatShortDate, formatStreakBestMeta, formatStreakCurrentMeta, isSkillSeatedInDifficulty } from "./statsScreen.ts";
import type { StreakState } from "./stats.ts";
import type { Difficulty } from "../config.ts";
import type { BotSkillLevel } from "../bot/factory.ts";

// Every difficulty's three weighted options (specs/bots.md) together
// cover all three skill levels, so every combination is seated.
const seatedCases: Array<{ difficulty: Difficulty; skill: BotSkillLevel; want: boolean }> = [
  { difficulty: "easy", skill: "novice", want: true },
  { difficulty: "easy", skill: "advanced", want: true },
  { difficulty: "easy", skill: "expert", want: true },
  { difficulty: "moderate", skill: "novice", want: true },
  { difficulty: "moderate", skill: "advanced", want: true },
  { difficulty: "moderate", skill: "expert", want: true },
  { difficulty: "hard", skill: "novice", want: true },
  { difficulty: "hard", skill: "advanced", want: true },
  { difficulty: "hard", skill: "expert", want: true },
];

test("isSkillSeatedInDifficulty matches config.ts's DIFFICULTY_BOT_SKILL_LEVELS", () => {
  for (const c of seatedCases) {
    assert.equal(isSkillSeatedInDifficulty(c.difficulty, c.skill), c.want, `${c.difficulty}/${c.skill}`);
  }
});

const shortDateCases = [
  { name: "single-digit day", iso: "2026-08-05", want: "Aug 5" },
  { name: "double-digit day", iso: "2026-08-18", want: "Aug 18" },
  { name: "January", iso: "2026-01-01", want: "Jan 1" },
  { name: "December", iso: "2025-12-31", want: "Dec 31" },
];

test("formatShortDate", () => {
  for (const c of shortDateCases) {
    assert.equal(formatShortDate(c.iso), c.want, c.name);
  }
});

const brokenStreak: StreakState = { current: { count: 0 }, best: { count: 0 } };
const liveStreak: StreakState = { current: { count: 3, startDate: "2026-08-18" }, best: { count: 6, endDate: "2026-07-02" } };
const endedBestOnlyStreak: StreakState = { current: { count: 0 }, best: { count: 3, endDate: "2026-07-20" } };

test("formatStreakCurrentMeta", () => {
  const cases = [
    { name: "never started", streak: brokenStreak, want: "—" },
    { name: "currently live", streak: liveStreak, want: "since Aug 18" },
    { name: "broken, but a past best exists", streak: endedBestOnlyStreak, want: "—" },
  ];
  for (const c of cases) {
    assert.equal(formatStreakCurrentMeta(c.streak), c.want, c.name);
  }
});

test("formatStreakBestMeta", () => {
  const cases = [
    { name: "no best yet", streak: brokenStreak, want: "—" },
    { name: "currently live", streak: liveStreak, want: "through Jul 2" },
    { name: "broken, past best recorded", streak: endedBestOnlyStreak, want: "through Jul 20" },
  ];
  for (const c of cases) {
    assert.equal(formatStreakBestMeta(c.streak), c.want, c.name);
  }
});
