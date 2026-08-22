// Headless bot-vs-bot game simulation, for comparing the bot skill-level
// strategies described in specs/bots.md without a browser.

import { newGame } from "../game/game.ts";
import type { Strategy } from "../game/types.ts";
import { Rng } from "../rng.ts";
import { BOT_SKILL_LEVELS, createBot, type BotSkillLevel } from "../bot/factory.ts";

export { BOT_SKILL_LEVELS, createBot, type BotSkillLevel };

// SimulationConfig configures a batch of independent games. Every
// game's seed is derived from seed, so a batch is fully reproducible.
export interface SimulationConfig {
  seed: number;
  games: number;
  // bots[slot] is the skill level of the slot-th bot under test. A
  // bot's slot is its stable identity across the whole batch; which
  // seat it sits in is reassigned randomly every game (see
  // runSimulation), so slot -- not seat -- is what results are tallied
  // by.
  bots: [BotSkillLevel, BotSkillLevel, BotSkillLevel, BotSkillLevel];
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
// (specs/bots.md), but never across games.
export async function runSimulation(config: SimulationConfig): Promise<SimulationResult> {
  const rng = new Rng(config.seed);
  const result: SimulationResult = { games: config.games, wins: [0, 0, 0, 0], ties: 0, totalRounds: 0 };

  for (let i = 0; i < config.games; i++) {
    // seatOfSlot[slot] is the seat the slot-th bot sits in this game.
    const seatOfSlot = [0, 1, 2, 3];
    rng.shuffle(seatOfSlot);

    const botsBySeat = new Array<Strategy>(4);
    for (let slot = 0; slot < 4; slot++) {
      botsBySeat[seatOfSlot[slot] as number] = createBot(config.bots[slot] as BotSkillLevel, rng);
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
  const lines = [`Played ${result.games} game(s) with seed ${config.seed}`, ""];

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

// allBotCombos enumerates every distinct multiset of 4 bot skill
// levels -- order doesn't distinguish combos (specs/bots.md skill
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
export async function runAllCombos(games: number, seed: number): Promise<ComboResult[]> {
  const results: ComboResult[] = [];
  for (const bots of allBotCombos()) {
    const result = await runSimulation({ games, seed, bots });
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
export function formatComboTable(games: number, seed: number, combos: readonly ComboResult[]): string[] {
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
    `Played ${games} game(s) per combo (${combos.length} combos) with seed ${seed}`,
    "",
    formatRow(headers),
    formatRow(widths.map((w) => "-".repeat(w))),
    ...rows.map(formatRow),
  ];
}
