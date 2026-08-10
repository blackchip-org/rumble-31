import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { arrayLineReader, bufferWriter, clock } from "./cli/io.ts";
import { parseStrikesArg, run } from "./main.ts";

const testdataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "testdata");

function withDisabledSleep(): () => void {
  const orig = clock.sleep;
  clock.sleep = () => {};
  return () => (clock.sleep = orig);
}

test("parseStrikesArg", () => {
  const cases: Array<{ name: string; argv: string[]; want?: [number, number, number, number]; wantErr?: boolean }> =
    [
      { name: "absent defaults to no strikes", argv: [], want: [0, 0, 0, 0] },
      { name: "space-separated, digit i -> seat i-1", argv: ["-strikes", "1121"], want: [1, 1, 2, 1] },
      { name: "double-dash form", argv: ["--strikes", "3000"], want: [3, 0, 0, 0] },
      { name: "equals form", argv: ["-strikes=0230"], want: [0, 2, 3, 0] },
      { name: "double-dash equals form", argv: ["--strikes=9999"], want: [9, 9, 9, 9] },
      { name: "other flags around it are ignored", argv: ["-seed", "5", "-strikes", "0001", "-x"], want: [0, 0, 0, 1] },
      { name: "too few digits", argv: ["-strikes", "12"], wantErr: true },
      { name: "too many digits", argv: ["-strikes", "12345"], wantErr: true },
      { name: "non-digit characters", argv: ["-strikes", "12a1"], wantErr: true },
    ];

  for (const { name, argv, want, wantErr } of cases) {
    if (wantErr) {
      assert.throws(() => parseStrikesArg(argv), name);
    } else {
      assert.deepEqual(parseStrikesArg(argv), want, name);
    }
  }
});

// End-to-end regression test: with seed 1 and no scripted input (every
// prompt exhausts immediately and defaults), the game must always
// play out to exactly this transcript. Any change to the deal, the
// bots, the RNG, or the CLI text will show up here as a diff — the
// fixture was captured from a real run and isn't hand-written.
test("run produces the recorded transcript for seed 1 with no input", async () => {
  const restore = withDisabledSleep();
  try {
    const want = fs.readFileSync(path.join(testdataDir, "seed1-empty-input.txt"), "utf8");
    const out = bufferWriter();
    await run(1, arrayLineReader([]), out, { version: "0.1" });
    assert.equal(out.toString(), want);
  } finally {
    restore();
  }
});

// Regression test: -strikes lets a bot seat start already eliminated
// (three or more debug strikes), which must exclude it from taking any
// turn for the whole game, not just be labeled afterward.
test("run: a bot seat starting at 3 strikes never takes a turn", async () => {
  const restore = withDisabledSleep();
  try {
    const out = bufferWriter();
    await run(1, arrayLineReader([]), out, {
      version: "0.1",
      initialStrikes: [0, 3, 0, 0],
    });

    const got = out.toString();
    assert.ok(!got.includes("West's turn"), "eliminated seat 1 should never take a turn");
  } finally {
    restore();
  }
});

// Regression test: -strikes can start seat 0 (the human) already
// eliminated. Per the "game ends immediately when the human is
// eliminated" rule, that means zero rounds are ever played — straight
// from the startup lines to "Game over".
test("run: seat 0 starting at 3 strikes plays zero rounds", async () => {
  const restore = withDisabledSleep();
  try {
    const out = bufferWriter();
    await run(1, arrayLineReader([]), out, {
      version: "0.1",
      initialStrikes: [3, 0, 0, 0],
    });

    const got = out.toString();
    assert.ok(!got.includes("=== Round"), "no round should ever be played");
    assert.ok(!got.includes("South wins the game"), "seat 0 was eliminated, not a winner");
    assert.ok(got.includes("Game over"));
  } finally {
    restore();
  }
});

// Exercises the reprompt paths (bad menu choice, bad card selection)
// early in round 1, then lets input run dry: exhausted input safely
// defaults (trade index 0/0, or an empty "press enter") rather than
// hanging or erroring, so the game still reaches a final result with
// no further scripting.
test("invalid input is reprompted, then defaults until the game ends", async () => {
  const restore = withDisabledSleep();
  try {
    const input = "9\nbanana\n1\nzz\n0\n1\n1\n".split("\n").slice(0, -1);
    const out = bufferWriter();
    await run(1, arrayLineReader(input), out, { version: "0.1" });

    const got = out.toString();
    for (const want of [
      "please enter a number from 1 to", // menu reprompt (seat 0's first decide isn't always the round's first turn)
      "please enter 1, 2, or 3",
      "Game over",
    ]) {
      assert.ok(got.includes(want), `output missing ${JSON.stringify(want)}`);
    }
  } finally {
    restore();
  }
});
