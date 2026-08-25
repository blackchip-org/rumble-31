import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregateByHandScore, sampleHandsAndPots } from "./handSelection.ts";
import type { HandPotSample } from "./handSelection.ts";

test("sampleHandsAndPots: deals the requested number of disjoint, in-range hand/pot pairs", () => {
  const samples = sampleHandsAndPots(500, 42);
  assert.equal(samples.length, 500);
  for (const s of samples) {
    assert.ok(s.handScore >= 7 && s.handScore <= 32, `handScore ${s.handScore} out of range`);
    assert.ok(s.potScore >= 7 && s.potScore <= 32, `potScore ${s.potScore} out of range`);
  }
});

test("sampleHandsAndPots: same seed reproduces the same samples", () => {
  const a = sampleHandsAndPots(50, 7);
  const b = sampleHandsAndPots(50, 7);
  assert.deepEqual(a, b);
});

const aggregateCases: { name: string; samples: HandPotSample[]; want: { handScore: number; trials: number; swapWinRate: number; avgAlwaysSwapGain: number; avgOptimalGain: number } }[] = [
  {
    name: "every pot beats the hand",
    samples: [
      { handScore: 10, potScore: 20 },
      { handScore: 10, potScore: 30 },
    ],
    want: { handScore: 10, trials: 2, swapWinRate: 1, avgAlwaysSwapGain: 15, avgOptimalGain: 15 },
  },
  {
    name: "every pot is worse -- optimal gain is zero (keep), always-swap gain is negative",
    samples: [
      { handScore: 25, potScore: 10 },
      { handScore: 25, potScore: 15 },
    ],
    want: { handScore: 25, trials: 2, swapWinRate: 0, avgAlwaysSwapGain: -12.5, avgOptimalGain: 0 },
  },
  {
    name: "tie is not a swap win and contributes zero gain",
    samples: [{ handScore: 20, potScore: 20 }],
    want: { handScore: 20, trials: 1, swapWinRate: 0, avgAlwaysSwapGain: 0, avgOptimalGain: 0 },
  },
  {
    name: "mixed pots average correctly",
    samples: [
      { handScore: 15, potScore: 10 }, // worse: contributes -5 / optimal 0
      { handScore: 15, potScore: 25 }, // better: contributes +10 / optimal +10
    ],
    want: { handScore: 15, trials: 2, swapWinRate: 0.5, avgAlwaysSwapGain: 2.5, avgOptimalGain: 5 },
  },
];

for (const c of aggregateCases) {
  test(`aggregateByHandScore: ${c.name}`, () => {
    const buckets = aggregateByHandScore(c.samples);
    assert.equal(buckets.length, 1);
    const bucket = buckets[0];
    assert.deepEqual(bucket, c.want);
  });
}

test("aggregateByHandScore: groups by hand score and sorts buckets ascending", () => {
  const samples: HandPotSample[] = [
    { handScore: 20, potScore: 10 },
    { handScore: 10, potScore: 30 },
    { handScore: 20, potScore: 30 },
  ];
  const buckets = aggregateByHandScore(samples);
  assert.deepEqual(
    buckets.map((b) => b.handScore),
    [10, 20],
  );
  assert.equal(buckets[0]?.trials, 1);
  assert.equal(buckets[1]?.trials, 2);
});
