// Headless bot-vs-bot game simulation, for comparing the bot skill-level
// strategies described in specs/bots_v3.md and specs/bots_v4.md without
// a browser.

import { newGame } from "../game/game.ts";
import type { PlayerView, Strategy } from "../game/types.ts";
import { strategyFunc } from "../game/types.ts";
import { botDecisionLines } from "../log.ts";
import { Rng } from "../rng.ts";
import { BOT_SKILL_LEVELS, type BotSkillLevel, createBot as createBotV3 } from "../bot/v3/factory.ts";
import { createBot as createBotV4 } from "../bot/v4/factory.ts";
import type { LogDetail } from "../bot/v4/trace.ts";

export { BOT_SKILL_LEVELS, type BotSkillLevel };

// BOT_VERSIONS enumerates the bot strategy implementations the
// simulator can play, per specs/bots_v3.md and specs/bots_v4.md.
export const BOT_VERSIONS = ["v3", "v4"] as const;
export type BotVersion = (typeof BOT_VERSIONS)[number];

function createBot(botVersion: BotVersion, skillLevel: BotSkillLevel, rng: Rng, logDetail?: LogDetail): Strategy {
  return botVersion === "v4" ? createBotV4(skillLevel, rng, undefined, logDetail) : createBotV3(skillLevel, rng);
}

// withDecisionLog wraps a v4 bot's Strategy so that, once decide()
// returns, its populated lastTrace (specs/bots_v4.md's Decision
// Logging) is immediately formatted and handed to write -- the
// simulator's own stand-in for the web GUI's game log, since the
// headless simulator has no turn-by-turn transcript of its own to
// interleave into.
function withDecisionLog(seat: number, inner: Strategy, detail: LogDetail, write: (line: string) => void): Strategy {
  return {
    decide: async (v: PlayerView) => {
      const action = await inner.decide(v);
      if (inner.lastTrace !== undefined) {
        for (const line of botDecisionLines(seat, inner.lastTrace, detail)) {
          write(line);
        }
      }
      return action;
    },
    onRoundStart: () => inner.onRoundStart?.(),
    observe: (t) => inner.observe?.(t),
  };
}

// SimulationConfig configures a batch of independent games. Every
// game's seed is derived from seed, so a batch is fully reproducible.
export interface SimulationConfig {
  seed: number;
  games: number;
  // botVersion selects which strategy implementation bots[*] are built
  // from (specs/bots_v3.md vs specs/bots_v4.md).
  botVersion: BotVersion;
  // bots[slot] is the skill level of the slot-th bot under test. A
  // bot's slot is its stable identity across the whole batch; which
  // seat it sits in is reassigned randomly every game (see
  // runSimulation), so slot -- not seat -- is what results are tallied
  // by.
  bots: [BotSkillLevel, BotSkillLevel, BotSkillLevel, BotSkillLevel];
  // botLog, if given, logs the named seats' v4 decision-making process
  // (specs/bots_v4.md's "Decision Logging") to the write callback
  // runSimulation is called with, keyed by seat (0-3) and valued by
  // detail level. Ignored when botVersion is "v3" -- v3 isn't
  // instrumented -- or when runSimulation is called without a write
  // callback.
  botLog?: ReadonlyMap<number, LogDetail>;
}

// SimulationResult tallies the outcome of a batch of games.
export interface SimulationResult {
  games: number;
  // wins[slot] counts games the slot-th bot won, including tied
  // co-wins, regardless of which seat it sat in for that game.
  wins: [number, number, number, number];
  // ties counts games that ended with more than one winner (every
  // remaining seat eliminated at once, per Game.applyResult).
  ties: number;
  totalRounds: number;
}

// runSimulation plays config.games independent games. Each game, the
// four bots are dealt a fresh, random seat assignment -- so no bot
// slot is systematically favored or disfavored by always acting
// first, last, etc. Each seat gets a fresh strategy instance every
// game -- a bot is free to carry state across a game's own rounds
// (specs/bots_v3.md), but never across games.
export async function runSimulation(config: SimulationConfig, write?: (line: string) => void): Promise<SimulationResult> {
  const rng = new Rng(config.seed);
  const result: SimulationResult = { games: config.games, wins: [0, 0, 0, 0], ties: 0, totalRounds: 0 };

  for (let i = 0; i < config.games; i++) {
    // seatOfSlot[slot] is the seat the slot-th bot sits in this game.
    const seatOfSlot = [0, 1, 2, 3];
    rng.shuffle(seatOfSlot);

    const botsBySeat = new Array<Strategy>(4);
    for (let slot = 0; slot < 4; slot++) {
      const seat = seatOfSlot[slot] as number;
      const detail = config.botLog?.get(seat);
      let bot = createBot(config.botVersion, config.bots[slot] as BotSkillLevel, rng, detail);
      if (detail !== undefined && write) {
        bot = withDecisionLog(seat, bot, detail, write);
      }
      botsBySeat[seat] = bot;
    }
    const strategies = botsBySeat as [Strategy, Strategy, Strategy, Strategy];

    const game = newGame(rng.nextSeed(), strategies);
    const { winners, log } = await game.run();

    result.totalRounds += log.length;
    if (winners.length > 1) {
      result.ties++;
    }
    for (const seat of winners) {
      const slot = seatOfSlot.indexOf(seat);
      result.wins[slot] = (result.wins[slot] as number) + 1;
    }
  }

  return result;
}

// formatReport renders a SimulationResult as plain text lines, e.g. for
// printing to stdout.
export function formatReport(config: SimulationConfig, result: SimulationResult): string[] {
  const lines = [`Played ${result.games} game(s) with seed ${config.seed} (bots ${config.botVersion})`, ""];

  for (let slot = 0; slot < 4; slot++) {
    const wins = result.wins[slot] as number;
    const pct = ((wins / result.games) * 100).toFixed(1);
    lines.push(`Bot ${slot + 1} (${config.bots[slot]}): ${wins} win(s), ${pct}%`);
  }

  lines.push("");
  lines.push(`Ties: ${result.ties}`);
  lines.push(`Average rounds per game: ${(result.totalRounds / result.games).toFixed(2)}`);
  return lines;
}

// HeadsUpSimulationConfig configures a batch of independent 2-bot
// games where the other two seats start pre-eliminated (Game's
// `eliminated` init), so every round of every game is the Heads Up
// strategy (specs/bots_v4.md) from the round's very first turn --
// unlike a 4-bot combo, where a bot only reaches Heads Up once two
// other seats have already been eliminated by play, if ever.
export interface HeadsUpSimulationConfig {
  seed: number;
  games: number;
  botVersion: BotVersion;
  // bots[slot] is the skill level of the slot-th bot under test, same
  // slot-vs-seat distinction as SimulationConfig.bots.
  bots: [BotSkillLevel, BotSkillLevel];
  botLog?: ReadonlyMap<number, LogDetail>;
}

// HeadsUpSimulationResult tallies the outcome of a HeadsUpSimulationConfig batch.
export interface HeadsUpSimulationResult {
  games: number;
  wins: [number, number];
  ties: number;
  totalRounds: number;
}

// unreachablePlaceholder fills the two pre-eliminated seats' strategy
// slots for runHeadsUpSimulation. Game never deals in, takes a turn
// from, or otherwise calls decide() on a seat that started eliminated
// (see Round's own "2 to 4 active seats" doc comment), so this should
// never actually run.
const unreachablePlaceholder: Strategy = strategyFunc(() => {
  throw new Error("runHeadsUpSimulation: a pre-eliminated seat's strategy was called");
});

// runHeadsUpSimulation plays config.games independent games, each
// between exactly two bots -- the other two seats start eliminated, so
// the two bots under test play every round of the game head-to-head.
// Each game, the two bots are dealt a fresh, random pair of seats out
// of the four (rather than always sitting at 0/1), so seating alone
// can't bias which one tends to act first.
export async function runHeadsUpSimulation(config: HeadsUpSimulationConfig, write?: (line: string) => void): Promise<HeadsUpSimulationResult> {
  const rng = new Rng(config.seed);
  const result: HeadsUpSimulationResult = { games: config.games, wins: [0, 0], ties: 0, totalRounds: 0 };

  for (let i = 0; i < config.games; i++) {
    const shuffledSeats = [0, 1, 2, 3];
    rng.shuffle(shuffledSeats);
    const seatOfSlot: [number, number] = [shuffledSeats[0] as number, shuffledSeats[1] as number];

    const eliminated: [boolean, boolean, boolean, boolean] = [true, true, true, true];
    eliminated[seatOfSlot[0]] = false;
    eliminated[seatOfSlot[1]] = false;

    const botsBySeat = new Array<Strategy>(4).fill(unreachablePlaceholder) as [Strategy, Strategy, Strategy, Strategy];
    for (let slot = 0; slot < 2; slot++) {
      const seat = seatOfSlot[slot] as number;
      const detail = config.botLog?.get(seat);
      let bot = createBot(config.botVersion, config.bots[slot] as BotSkillLevel, rng, detail);
      if (detail !== undefined && write) {
        bot = withDecisionLog(seat, bot, detail, write);
      }
      botsBySeat[seat] = bot;
    }

    const game = newGame(rng.nextSeed(), botsBySeat, { strikes: [0, 0, 0, 0], secondChance: [false, false, false, false], eliminated });
    const { winners, log } = await game.run();

    result.totalRounds += log.length;
    if (winners.length > 1) {
      result.ties++;
    }
    for (const seat of winners) {
      const slot = seatOfSlot.indexOf(seat);
      result.wins[slot] = (result.wins[slot] as number) + 1;
    }
  }

  return result;
}

// formatHeadsUpReport renders a HeadsUpSimulationResult as plain text
// lines, matching formatReport's layout for the 4-bot case.
export function formatHeadsUpReport(config: HeadsUpSimulationConfig, result: HeadsUpSimulationResult): string[] {
  const lines = [`Played ${result.games} game(s) with seed ${config.seed} (bots ${config.botVersion}, heads up)`, ""];

  for (let slot = 0; slot < 2; slot++) {
    const wins = result.wins[slot] as number;
    const pct = ((wins / result.games) * 100).toFixed(1);
    lines.push(`Bot ${slot + 1} (${config.bots[slot]}): ${wins} win(s), ${pct}%`);
  }

  lines.push("");
  lines.push(`Ties: ${result.ties}`);
  lines.push(`Average rounds per game: ${(result.totalRounds / result.games).toFixed(2)}`);
  return lines;
}

// allBotCombos enumerates every distinct multiset of 4 bot skill
// levels -- order doesn't distinguish combos (specs/bots_v3.md skill
// level is the only thing that matters, and runSimulation already
// randomizes seating), so e.g. novice/novice/advanced/expert appears
// once, not in every permutation. Each combo lists its bots grouped by
// skill level (novice, then advanced, then expert) for a stable,
// readable label.
export function allBotCombos(): Array<[BotSkillLevel, BotSkillLevel, BotSkillLevel, BotSkillLevel]> {
  const combos: Array<[BotSkillLevel, BotSkillLevel, BotSkillLevel, BotSkillLevel]> = [];
  for (let noviceCount = 4; noviceCount >= 0; noviceCount--) {
    for (let advancedCount = 4 - noviceCount; advancedCount >= 0; advancedCount--) {
      const expertCount = 4 - noviceCount - advancedCount;
      combos.push([
        ...Array<BotSkillLevel>(noviceCount).fill("novice"),
        ...Array<BotSkillLevel>(advancedCount).fill("advanced"),
        ...Array<BotSkillLevel>(expertCount).fill("expert"),
      ] as [BotSkillLevel, BotSkillLevel, BotSkillLevel, BotSkillLevel]);
    }
  }
  return combos;
}

// ComboResult pairs one allBotCombos() entry with its own independent
// SimulationResult.
export interface ComboResult {
  bots: [BotSkillLevel, BotSkillLevel, BotSkillLevel, BotSkillLevel];
  result: SimulationResult;
}

// runAllCombos plays games games of every combo from allBotCombos(),
// each batch seeded from the same seed -- so every combo is measured
// against the same sequence of shuffles/deals, keeping the comparison
// across rows apples-to-apples.
export async function runAllCombos(games: number, seed: number, botVersion: BotVersion): Promise<ComboResult[]> {
  const results: ComboResult[] = [];
  for (const bots of allBotCombos()) {
    const result = await runSimulation({ games, seed, botVersion, bots });
    results.push({ bots, result });
  }
  return results;
}

// comboLabel renders a combo as the 4-letter string a --strat flag
// would use to select it (specs match cliParams.ts's own letters).
function comboLabel(bots: readonly BotSkillLevel[]): string {
  return bots.map((b) => b[0]).join("");
}

// slotWinPct returns the win rate of the slot-th bot in a combo.
function slotWinPct(wins: readonly number[], games: number, slot: number): string {
  return `${(((wins[slot] as number) / games) * 100).toFixed(1)}%`;
}

// formatComboTable renders every combo's result as a single table, one
// row per combo, columns aligned by their widest cell. Bot N columns
// are ordered to match comboLabel, so each cell's skill level can be
// read off the Combo column's N-th letter.
export function formatComboTable(games: number, seed: number, botVersion: BotVersion, combos: readonly ComboResult[]): string[] {
  const headers = ["Combo", "Games", "Bot 1", "Bot 2", "Bot 3", "Bot 4", "Ties", "Avg Rounds"];
  const rows = combos.map(({ bots, result }) => [
    comboLabel(bots),
    String(games),
    slotWinPct(result.wins, games, 0),
    slotWinPct(result.wins, games, 1),
    slotWinPct(result.wins, games, 2),
    slotWinPct(result.wins, games, 3),
    `${((result.ties / games) * 100).toFixed(1)}%`,
    (result.totalRounds / games).toFixed(2),
  ]);

  const widths = headers.map((h, col) => Math.max(h.length, ...rows.map((r) => (r[col] as string).length)));
  const formatRow = (cells: readonly string[]): string => cells.map((c, i) => c.padEnd(widths[i] as number)).join("  ").trimEnd();

  return [
    `Played ${games} game(s) per combo (${combos.length} combos) with seed ${seed} (bots ${botVersion})`,
    "",
    formatRow(headers),
    formatRow(widths.map((w) => "-".repeat(w))),
    ...rows.map(formatRow),
  ];
}
