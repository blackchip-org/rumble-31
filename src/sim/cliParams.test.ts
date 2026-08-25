import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCliArgs } from "./cliParams.ts";
import type { CliConfig } from "./cliParams.ts";

const fixedNow = () => 12345;

test("parseCliArgs: valid combinations", () => {
  const cases: Array<{ name: string; argv: string[]; want: CliConfig }> = [
    {
      name: "no args runs every combo, defaulting to bot version v4",
      argv: [],
      want: { mode: "all", games: 1000, seed: 12345, botVersion: "v4" },
    },
    {
      name: "games and seed, still every combo",
      argv: ["--games=50", "--seed=7"],
      want: { mode: "all", games: 50, seed: 7, botVersion: "v4" },
    },
    {
      name: "strat selects a single combo to run",
      argv: ["--strat=naea"],
      want: { mode: "single", games: 1000, seed: 12345, botVersion: "v4", bots: ["novice", "advanced", "expert", "advanced"], botLog: undefined },
    },
    {
      name: "two-letter strat selects a heads-up combo to run",
      argv: ["--strat=ae"],
      want: { mode: "headsUp", games: 1000, seed: 12345, botVersion: "v4", bots: ["advanced", "expert"], botLog: undefined },
    },
    {
      name: "two-letter strat with bot-log",
      argv: ["--strat=ae", "--bot-log=West"],
      want: { mode: "headsUp", games: 1000, seed: 12345, botVersion: "v4", bots: ["advanced", "expert"], botLog: new Map([[1, "full"]]) },
    },
    {
      name: "negative seed",
      argv: ["--seed=-1"],
      want: { mode: "all", games: 1000, seed: -1 >>> 0, botVersion: "v4" },
    },
    {
      name: "bot-version=v3 overrides the default",
      argv: ["--bot-version=v3"],
      want: { mode: "all", games: 1000, seed: 12345, botVersion: "v3" },
    },
    {
      name: "bot-version=v4 explicit",
      argv: ["--bot-version=v4", "--strat=naea"],
      want: { mode: "single", games: 1000, seed: 12345, botVersion: "v4", bots: ["novice", "advanced", "expert", "advanced"], botLog: undefined },
    },
    {
      name: "metrics flag alongside a single-combo strat",
      argv: ["--strat=naea", "--metrics"],
      want: { mode: "single", games: 1000, seed: 12345, botVersion: "v4", bots: ["novice", "advanced", "expert", "advanced"], botLog: undefined, metrics: true },
    },
    {
      name: "metrics flag alongside a heads-up strat",
      argv: ["--strat=ae", "--metrics"],
      want: { mode: "headsUp", games: 1000, seed: 12345, botVersion: "v4", bots: ["advanced", "expert"], botLog: undefined, metrics: true },
    },
    {
      name: "bot-log selects seats and, by case, detail level",
      argv: ["--strat=naea", "--bot-log=west,North"],
      want: {
        mode: "single",
        games: 1000,
        seed: 12345,
        botVersion: "v4",
        bots: ["novice", "advanced", "expert", "advanced"],
        botLog: new Map([
          [1, "summary"],
          [2, "full"],
        ]),
      },
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
    { name: "strat too short", argv: ["--strat=n"], wantMessage: /--strat=n must be exactly 2 or 4 characters/ },
    { name: "strat three characters", argv: ["--strat=nae"], wantMessage: /--strat=nae must be exactly 2 or 4 characters/ },
    { name: "strat too long", argv: ["--strat=naeaa"], wantMessage: /--strat=naeaa must be exactly 2 or 4 characters/ },
    { name: "strat invalid character", argv: ["--strat=naex"], wantMessage: /--strat=naex has invalid character "x" at position 4/ },
    { name: "strat uppercase not accepted", argv: ["--strat=NAEA"], wantMessage: /--strat=NAEA has invalid character "N" at position 1/ },
    { name: "two-letter strat invalid character", argv: ["--strat=ax"], wantMessage: /--strat=ax has invalid character "x" at position 2/ },
    { name: "bot-version invalid value", argv: ["--bot-version=v5"], wantMessage: /--bot-version=v5 must be one of v3, v4/ },
    { name: "bot-log without strat", argv: ["--bot-log=west"], wantMessage: /--bot-log=west given without --strat/ },
    { name: "metrics without strat", argv: ["--metrics"], wantMessage: /--metrics given without --strat/ },
    { name: "bot-log invalid seat", argv: ["--strat=naea", "--bot-log=bogus"], wantMessage: /--bot-log=bogus names an invalid seat "bogus"/ },
  ];

  for (const { name, argv, wantMessage } of cases) {
    assert.throws(() => parseCliArgs(argv, fixedNow), wantMessage, name);
  }
});
