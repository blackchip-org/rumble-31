import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCliArgs } from "./cliParams.ts";
import type { CliConfig } from "./cliParams.ts";

const fixedNow = () => 12345;

test("parseCliArgs: valid combinations", () => {
  const cases: Array<{ name: string; argv: string[]; want: CliConfig }> = [
    {
      name: "no args runs every combo",
      argv: [],
      want: { mode: "all", games: 1000, seed: 12345 },
    },
    {
      name: "games and seed, still every combo",
      argv: ["--games=50", "--seed=7"],
      want: { mode: "all", games: 50, seed: 7 },
    },
    {
      name: "strat selects a single combo to run",
      argv: ["--strat=erdr"],
      want: { mode: "single", games: 1000, seed: 12345, bots: ["easy", "regular", "difficult", "regular"] },
    },
    {
      name: "negative seed",
      argv: ["--seed=-1"],
      want: { mode: "all", games: 1000, seed: -1 >>> 0 },
    },
  ];

  for (const { name, argv, want } of cases) {
    assert.deepEqual(parseCliArgs(argv, fixedNow), want, name);
  }
});

test("parseCliArgs: invalid input throws", () => {
  const cases: Array<{ name: string; argv: string[]; wantMessage: RegExp }> = [
    { name: "malformed flag", argv: ["--games"], wantMessage: /unrecognized argument/ },
    { name: "unknown flag", argv: ["--foo=bar"], wantMessage: /unknown flag/ },
    { name: "games not a positive integer", argv: ["--games=0"], wantMessage: /--games=0 must be a positive integer/ },
    { name: "games not numeric", argv: ["--games=abc"], wantMessage: /--games=abc must be a positive integer/ },
    { name: "seed not an integer", argv: ["--seed=1.5"], wantMessage: /--seed=1.5 must be an integer/ },
    { name: "strat too short", argv: ["--strat=er"], wantMessage: /--strat=er must be exactly 4 characters/ },
    { name: "strat too long", argv: ["--strat=erdrr"], wantMessage: /--strat=erdrr must be exactly 4 characters/ },
    { name: "strat invalid character", argv: ["--strat=erdx"], wantMessage: /--strat=erdx has invalid character "x" at position 4/ },
    { name: "strat uppercase not accepted", argv: ["--strat=ERDR"], wantMessage: /--strat=ERDR has invalid character "E" at position 1/ },
  ];

  for (const { name, argv, wantMessage } of cases) {
    assert.throws(() => parseCliArgs(argv, fixedNow), wantMessage, name);
  }
});
