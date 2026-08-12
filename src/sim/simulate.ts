// Headless bot-vs-bot game simulation, for comparing the bot difficulty
// strategies described in specs/bots.md without a browser.

import { EasyBot } from "../bot/easy.ts";
import { RegularBot } from "../bot/regular.ts";
import { DifficultBot } from "../bot/difficult.ts";
import { newGame } from "../game/game.ts";
import type { Strategy } from "../game/types.ts";
import { Rng } from "../rng.ts";

export const BOT_NAMES = ["easy", "regular", "difficult"] as const;
export type BotName = (typeof BOT_NAMES)[number];

// createBot returns a freshly constructed strategy for name, per
// specs/bots.md.
export function createBot(name: BotName): Strategy {
  switch (name) {
    case "easy":
      return new EasyBot();
    case "regular":
      return new RegularBot();
    case "difficult":
      return new DifficultBot();
  }
}

// SimulationConfig configures a batch of independent games. Every
// game's seed is derived from seed, so a batch is fully reproducible.
export interface SimulationConfig {
  seed: number;
  games: number;
  // bots[slot] is the difficulty of the slot-th bot under test. A
  // bot's slot is its stable identity across the whole batch; which
  // seat it sits in is reassigned randomly every game (see
  // runSimulation), so slot -- not seat -- is what results are tallied
  // by.
  bots: [BotName, BotName, BotName, BotName];
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
      botsBySeat[seatOfSlot[slot] as number] = createBot(config.bots[slot] as BotName);
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

// allBotCombos enumerates every distinct multiset of 4 bot
// difficulties -- order doesn't distinguish combos (specs/bots.md
// difficulty is the only thing that matters, and runSimulation already
// randomizes seating), so e.g. easy/easy/regular/difficult appears
// once, not in every permutation. Each combo lists its bots grouped by
// difficulty (easy, then regular, then difficult) for a stable,
// readable label.
export function allBotCombos(): Array<[BotName, BotName, BotName, BotName]> {
  const combos: Array<[BotName, BotName, BotName, BotName]> = [];
  for (let easyCount = 4; easyCount >= 0; easyCount--) {
    for (let regularCount = 4 - easyCount; regularCount >= 0; regularCount--) {
      const difficultCount = 4 - easyCount - regularCount;
      combos.push([
        ...Array<BotName>(easyCount).fill("easy"),
        ...Array<BotName>(regularCount).fill("regular"),
        ...Array<BotName>(difficultCount).fill("difficult"),
      ] as [BotName, BotName, BotName, BotName]);
    }
  }
  return combos;
}

// ComboResult pairs one allBotCombos() entry with its own independent
// SimulationResult.
export interface ComboResult {
  bots: [BotName, BotName, BotName, BotName];
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
function comboLabel(bots: readonly BotName[]): string {
  return bots.map((b) => b[0]).join("");
}

// avgWinPct returns the win rate of an individual bot of type among
// bots, averaged over however many of that type are present (so a
// combo fielding two easy bots reports the same kind of number as one
// fielding a single easy bot -- comparable to the no-edge baseline of
// 1/4 -- instead of their combined share of the 4 seats). Returns "—"
// if the combo has none of that type.
function avgWinPct(bots: readonly BotName[], wins: readonly number[], games: number, type: BotName): string {
  const slots = bots.reduce<number[]>((acc, b, i) => (b === type ? [...acc, i] : acc), []);
  if (slots.length === 0) {
    return "—";
  }
  const total = slots.reduce((sum, i) => sum + (wins[i] as number), 0);
  return `${((total / (games * slots.length)) * 100).toFixed(1)}%`;
}

// formatComboTable renders every combo's result as a single table, one
// row per combo, columns aligned by their widest cell.
export function formatComboTable(games: number, seed: number, combos: readonly ComboResult[]): string[] {
  const headers = ["Combo", "Games", "Easy avg", "Regular avg", "Difficult avg", "Ties", "Avg Rounds"];
  const rows = combos.map(({ bots, result }) => [
    comboLabel(bots),
    String(games),
    avgWinPct(bots, result.wins, games, "easy"),
    avgWinPct(bots, result.wins, games, "regular"),
    avgWinPct(bots, result.wins, games, "difficult"),
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
