// Parses the simulator's command-line arguments. Every validation
// failure throws a descriptive Error — there is no silent fallback for
// malformed input.

import { BOT_NAMES } from "./simulate.ts";
import type { BotName, SimulationConfig } from "./simulate.ts";

// BOT_CHAR_TO_NAME maps a --strat letter to the bot difficulty it
// selects, keyed by each BOT_NAMES entry's first letter (e/r/d — all
// distinct, so this stays unambiguous as long as that holds).
const BOT_CHAR_TO_NAME = new Map<string, BotName>(BOT_NAMES.map((name) => [name[0] as string, name]));

const DEFAULT_GAMES = 1000;

// CliConfig is what parseCliArgs resolves argv down to: either a
// single combo to simulate ("single", when --strat is given) or a
// request to run every distinct 4-bot combo ("all", when it's
// omitted), per simulate.ts's allBotCombos/runAllCombos.
export type CliConfig = ({ mode: "single" } & SimulationConfig) | { mode: "all"; games: number; seed: number };

// parseCliArgs reads argv (e.g. process.argv.slice(2)) for the
// simulator's flags:
//
//   --games=N   number of games to play per combo (default 1000)
//   --seed=N    batch seed (default derived from the clock)
//   --strat=    four letters, one per bot under test: e (easy), r
//               (regular), or d (difficult) -- e.g. --strat=erdr for
//               easy, regular, difficult, regular. Each game deals the
//               four bots a fresh random seat, so this names which
//               bots to test, not where they sit. If omitted, every
//               distinct combo of 4 bots is run instead, reported as
//               a table.
export function parseCliArgs(argv: readonly string[], now: () => number = Date.now): CliConfig {
  const flags = new Map<string, string>();
  for (const arg of argv) {
    if (!arg.startsWith("--") || !arg.includes("=")) {
      throw new Error(`simulate: unrecognized argument "${arg}" (expected --flag=value)`);
    }
    const eq = arg.indexOf("=");
    flags.set(arg.slice(2, eq), arg.slice(eq + 1));
  }

  const games = parsePositiveInt("games", flags.get("games"), DEFAULT_GAMES);
  const seed = parseInt32("seed", flags.get("seed"), now() >>> 0);

  for (const [flag] of flags) {
    if (flag !== "games" && flag !== "seed" && flag !== "strat") {
      throw new Error(`simulate: unknown flag "--${flag}"`);
    }
  }

  const stratRaw = flags.get("strat");
  if (stratRaw === undefined) {
    return { mode: "all", games, seed };
  }
  return { mode: "single", games, seed, bots: parseStrat(stratRaw) };
}

function parseStrat(value: string): [BotName, BotName, BotName, BotName] {
  if (value.length !== 4) {
    throw new Error(`simulate: --strat=${value} must be exactly 4 characters, one per player`);
  }

  const bots = [...value].map((ch, i) => {
    const name = BOT_CHAR_TO_NAME.get(ch);
    if (!name) {
      const valid = [...BOT_CHAR_TO_NAME.keys()].join(", ");
      throw new Error(`simulate: --strat=${value} has invalid character "${ch}" at position ${i + 1} (must be one of ${valid})`);
    }
    return name;
  });

  return bots as [BotName, BotName, BotName, BotName];
}

function parsePositiveInt(flag: string, raw: string | undefined, fallback: number): number {
  if (raw === undefined) {
    return fallback;
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`simulate: --${flag}=${raw} must be a positive integer`);
  }
  return n;
}

function parseInt32(flag: string, raw: string | undefined, fallback: number): number {
  if (raw === undefined) {
    return fallback;
  }
  const n = Number(raw);
  if (!Number.isInteger(n)) {
    throw new Error(`simulate: --${flag}=${raw} must be an integer`);
  }
  return n >>> 0;
}
