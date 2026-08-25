// Parses the simulator's command-line arguments. Every validation
// failure throws a descriptive Error — there is no silent fallback for
// malformed input.

import { seatByName } from "../game/seat.ts";
import type { LogDetail } from "../bot/v4/trace.ts";
import { BOT_SKILL_LEVELS, BOT_VERSIONS } from "./simulate.ts";
import type { BotSkillLevel, BotVersion, HeadsUpSimulationConfig, SimulationConfig } from "./simulate.ts";

// BOT_CHAR_TO_SKILL_LEVEL maps a --strat letter to the bot skill level
// it selects, keyed by each BOT_SKILL_LEVELS entry's first letter
// (n/a/e — all distinct, so this stays unambiguous as long as that
// holds).
const BOT_CHAR_TO_SKILL_LEVEL = new Map<string, BotSkillLevel>(BOT_SKILL_LEVELS.map((name) => [name[0] as string, name]));

const DEFAULT_GAMES = 1000;

// DEFAULT_BOT_VERSION is used when --bot-version is omitted.
const DEFAULT_BOT_VERSION: BotVersion = "v4";

// CliConfig is what parseCliArgs resolves argv down to: a single
// 4-bot combo to simulate ("single", when --strat names 4 bots), a
// single 2-bot combo played head-to-head every round ("headsUp", when
// --strat names 2 bots -- simulate.ts's runHeadsUpSimulation), or a
// request to run every distinct 4-bot combo ("all", when --strat is
// omitted), per simulate.ts's allBotCombos/runAllCombos.
export type CliConfig = ({ mode: "single" } & SimulationConfig) | ({ mode: "headsUp" } & HeadsUpSimulationConfig) | { mode: "all"; games: number; seed: number; botVersion: BotVersion };

// parseCliArgs reads argv (e.g. process.argv.slice(2)) for the
// simulator's flags:
//
//   --games=N       number of games to play per combo (default 1000)
//   --seed=N        batch seed (default derived from the clock)
//   --bot-version=  which bot strategy implementation to play: v3
//                   (specs/bots_v3.md) or v4 (specs/bots_v4.md).
//                   Defaults to v4.
//   --strat=        letters, one per bot under test: n (novice), a
//                   (advanced), or e (expert). Four letters (e.g.
//                   --strat=naen) test that 4-bot combo normally --
//                   each game deals the four bots a fresh random seat,
//                   so this names which bots to test, not where they
//                   sit, and a bot only plays Heads Up once two others
//                   have been eliminated by play, if ever. Two letters
//                   (e.g. --strat=ae) instead play those two bots
//                   head-to-head every round of every game -- the
//                   other two seats start pre-eliminated, so every
//                   turn uses the Heads Up strategy (specs/bots_v4.md)
//                   from the round's first turn, and only those two
//                   seats are ever dealt in. If omitted, every
//                   distinct combo of 4 bots is run instead, reported
//                   as a table.
//   --bot-log=      comma-separated seat names (north/south/east/west)
//                   to log v4 decision-making for (specs/bots_v4.md's
//                   "Decision Logging"), e.g. --bot-log=west,north. A
//                   lowercase name logs at Summary, a name starting
//                   uppercase logs at Full Trace. Only valid alongside
//                   --strat -- decision logging doesn't apply across
//                   every combo in the default "all" mode.
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
  const botVersion = parseBotVersion(flags.get("bot-version"));

  for (const [flag] of flags) {
    if (flag !== "games" && flag !== "seed" && flag !== "strat" && flag !== "bot-version" && flag !== "bot-log") {
      throw new Error(`simulate: unknown flag "--${flag}"`);
    }
  }

  const stratRaw = flags.get("strat");
  const botLogRaw = flags.get("bot-log");
  if (stratRaw === undefined) {
    if (botLogRaw !== undefined) {
      throw new Error(`simulate: --bot-log=${botLogRaw} given without --strat`);
    }
    return { mode: "all", games, seed, botVersion };
  }
  const botLog = parseBotLog(botLogRaw);
  if (stratRaw.length === 2) {
    return { mode: "headsUp", games, seed, botVersion, bots: parseStratChars(stratRaw) as [BotSkillLevel, BotSkillLevel], botLog };
  }
  return { mode: "single", games, seed, botVersion, bots: parseStrat(stratRaw), botLog };
}

function parseBotLog(raw: string | undefined): ReadonlyMap<number, LogDetail> | undefined {
  if (raw === undefined || raw === "") {
    return undefined;
  }
  const map = new Map<number, LogDetail>();
  for (const rawName of raw.split(",")) {
    const seat = seatByName(rawName);
    if (seat === undefined) {
      throw new Error(`simulate: --bot-log=${raw} names an invalid seat "${rawName}"`);
    }
    map.set(seat, /^[A-Z]/.test(rawName) ? "full" : "summary");
  }
  return map;
}

function parseBotVersion(raw: string | undefined): BotVersion {
  if (raw === undefined) {
    return DEFAULT_BOT_VERSION;
  }
  if (!(BOT_VERSIONS as readonly string[]).includes(raw)) {
    throw new Error(`simulate: --bot-version=${raw} must be one of ${BOT_VERSIONS.join(", ")}`);
  }
  return raw as BotVersion;
}

function parseStrat(value: string): [BotSkillLevel, BotSkillLevel, BotSkillLevel, BotSkillLevel] {
  if (value.length !== 4) {
    throw new Error(`simulate: --strat=${value} must be exactly 2 or 4 characters, one per player`);
  }
  return parseStratChars(value) as [BotSkillLevel, BotSkillLevel, BotSkillLevel, BotSkillLevel];
}

// parseStratChars maps each character of a --strat value to its bot
// skill level, shared by both the 4-bot (parseStrat) and 2-bot
// (Heads Up) cases -- callers are responsible for checking length
// first, since the two report different expectations in their error.
function parseStratChars(value: string): BotSkillLevel[] {
  return [...value].map((ch, i) => {
    const name = BOT_CHAR_TO_SKILL_LEVEL.get(ch);
    if (!name) {
      const valid = [...BOT_CHAR_TO_SKILL_LEVEL.keys()].join(", ");
      throw new Error(`simulate: --strat=${value} has invalid character "${ch}" at position ${i + 1} (must be one of ${valid})`);
    }
    return name;
  });
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
