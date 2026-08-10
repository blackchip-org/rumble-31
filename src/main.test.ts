import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCard } from "./card/card.ts";
import { arrayLineReader, bufferWriter, clock } from "./cli/io.ts";
import type { Hand } from "./game/types.ts";
import type { GameOutcome } from "./game/match.ts";

function mustHand(...notation: [string, string, string]): Hand {
  return [parseCard(notation[0]), parseCard(notation[1]), parseCard(notation[2])];
}
import { parseStrikesArg, printGameRecap, run } from "./main.ts";

const testdataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "testdata");

function withDisabledSleep(): () => void {
  const orig = clock.sleep;
  clock.sleep = () => {};
  return () => (clock.sleep = orig);
}

// A seat eliminated in an earlier game is simply absent from a later
// game's result — printGameRecap only has to render whoever actually
// played, with a distinct label for anyone freshly struck/eliminated
// this round, and their current strike count.
test("printGameRecap labels struck and eliminated seats, shows strikes, and omits anyone else", () => {
  const outcome: GameOutcome = {
    result: {
      players: [
        { seat: 0, hand: mustHand("7c", "8d", "9s"), score: 27, rank: 3 },
        { seat: 2, hand: mustHand("Ac", "Ad", "As"), score: 30, rank: 1 },
        { seat: 3, hand: mustHand("Kc", "Kd", "Ks"), score: 28, rank: 2 },
      ],
      winners: [2],
    },
    struck: [0],
    eliminated: [0],
  };
  const strikes = [3, 1, 0, 2];

  const out = bufferWriter();
  printGameRecap(out, 7, outcome, strikes);

  const got = out.toString();
  assert.ok(got.includes("seat 0") && got.includes("strikes 3") && got.includes("(struck, eliminated)"));
  assert.ok(got.includes("seat 2") && got.includes("strikes 0"));
  assert.ok(got.includes("seat 3") && got.includes("strikes 2"));
  assert.ok(!got.includes("seat 1"));
});

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
// prompt exhausts immediately and defaults), the match must always
// play out to exactly this transcript. Any change to the deal, the
// bots, the RNG, or the CLI text will show up here as a diff — the
// fixture was captured from a real run and isn't hand-written.
test("run produces the recorded transcript for seed 1 with no input", async () => {
  const restore = withDisabledSleep();
  try {
    const want = fs.readFileSync(path.join(testdataDir, "seed1-empty-input.txt"), "utf8");
    const out = bufferWriter();
    await run(1, arrayLineReader([]), out, { version: "0.1", buildTime: "9 Aug 2026 at 20:58" });
    assert.equal(out.toString(), want);
  } finally {
    restore();
  }
});

// Regression test: -strikes lets a bot seat start already eliminated
// (three or more debug strikes), which must exclude it from game 1's
// deal and recap entirely, not just label it.
test("run: a bot seat starting at 3 strikes is excluded from game 1 entirely", async () => {
  const restore = withDisabledSleep();
  try {
    const out = bufferWriter();
    await run(1, arrayLineReader([]), out, {
      version: "0.1",
      buildTime: "unknown",
      initialStrikes: [0, 3, 0, 0],
    });

    const got = out.toString();
    const game1 = got.slice(got.indexOf("=== game 1 ==="), got.indexOf("game 1 result:"));
    assert.ok(!game1.includes("seat 1 is thinking"), "eliminated seat 1 should never take a turn");
  } finally {
    restore();
  }
});

// Regression test: -strikes can start seat 0 (the human) already
// eliminated, which must skip interactive play entirely rather than
// silently hang on a stdin read that never happens, or claim the
// player was "just" eliminated.
test("run: seat 0 starting at 3 strikes skips straight to the silent match summary", async () => {
  const restore = withDisabledSleep();
  try {
    const out = bufferWriter();
    await run(1, arrayLineReader([]), out, {
      version: "0.1",
      buildTime: "unknown",
      initialStrikes: [3, 0, 0, 0],
    });

    const got = out.toString();
    assert.ok(got.includes("You start this match already eliminated."));
    assert.ok(!got.includes("=== game 1 ==="), "no interactive game should be shown");
    assert.ok(!got.includes("You have been eliminated."), "wasn't freshly eliminated, started that way");
    assert.ok(got.includes("=== match over ==="));
  } finally {
    restore();
  }
});

// Exercises the reprompt paths (bad menu choice, bad card selection)
// early in game 1, then lets input run dry: exhausted input safely
// defaults (trade index 0/0, or an empty "press enter") rather than
// hanging or erroring, so the match still reaches a final result with
// no further scripting.
test("invalid input is reprompted, then defaults until the match ends", async () => {
  const restore = withDisabledSleep();
  try {
    const input = "9\nbanana\n1\nzz\n0\n1\n1\n".split("\n").slice(0, -1);
    const out = bufferWriter();
    await run(1, arrayLineReader(input), out, { version: "0.1", buildTime: "unknown" });

    const got = out.toString();
    for (const want of [
      "please enter a number from 1 to", // menu reprompt (seat 0's first decide isn't always the game's first turn)
      "please enter 1, 2, or 3",
      "=== match over ===",
      "winners:",
    ]) {
      assert.ok(got.includes(want), `output missing ${JSON.stringify(want)}`);
    }
  } finally {
    restore();
  }
});
