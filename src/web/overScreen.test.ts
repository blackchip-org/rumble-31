import { test } from "node:test";
import assert from "node:assert/strict";
import { computeBotResults, type BotResult } from "./overScreen.ts";

const cases: Array<{ name: string; eliminated: [boolean, boolean, boolean, boolean]; finalRoundEliminated: number[]; want: [BotResult, BotResult, BotResult] }> = [
  {
    name: "South is the sole survivor",
    eliminated: [false, true, true, true],
    finalRoundEliminated: [],
    want: ["win", "win", "win"],
  },
  {
    name: "South eliminated alone, one bot already out earlier, two still active",
    eliminated: [true, true, false, false],
    finalRoundEliminated: [0],
    want: ["win", "loss", "loss"],
  },
  {
    name: "South and one bot eliminated together, others still active",
    eliminated: [true, true, false, false],
    finalRoundEliminated: [0, 1],
    want: ["tie", "loss", "loss"],
  },
  {
    name: "South tied co-winner with one bot, others already eliminated",
    eliminated: [false, false, true, true],
    finalRoundEliminated: [],
    want: ["tie", "win", "win"],
  },
  {
    name: "three-way tie at the very end",
    eliminated: [false, false, false, false],
    finalRoundEliminated: [],
    want: ["tie", "tie", "tie"],
  },
];

test("computeBotResults", () => {
  for (const { name, eliminated, finalRoundEliminated, want } of cases) {
    assert.deepEqual(computeBotResults(eliminated, finalRoundEliminated), want, name);
  }
});
