import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCard } from "../card/card.ts";
import { exchange, knock, trade } from "../game/types.ts";
import type { Hand, Pot, TurnRecord } from "../game/types.ts";
import { score } from "../card/score.ts";
import { allBotCombos, formatComboTable, formatHeadsUpReport, formatReport, newBotMetrics, recordTurn, runAllCombos, runHeadsUpSimulation, runSimulation } from "./simulate.ts";
import type { BotMetrics, ComboResult, HeadsUpSimulationConfig, HeadsUpSimulationResult, SimulationConfig, SimulationResult } from "./simulate.ts";

function mustHand(...notation: [string, string, string]): Hand {
  return [parseCard(notation[0]), parseCard(notation[1]), parseCard(notation[2])];
}
function mustPot(...notation: [string, string, string]): Pot {
  return mustHand(...notation);
}

// baseTurn builds a TurnRecord that knocks with an unchanged hand/pot,
// so each recordTurn test case only needs to override what it's
// actually exercising.
function baseTurn(overrides: Partial<TurnRecord>): TurnRecord {
  const hand = overrides.handBefore ?? mustHand("7c", "8d", "9s");
  const handAfter = overrides.handAfter ?? hand;
  const pot = overrides.potBefore ?? mustPot("Kc", "Qd", "Jh");
  return {
    turnIndex: 0,
    seat: 0,
    action: knock(),
    handBefore: hand,
    handAfter,
    potBefore: pot,
    potAfter: pot,
    scoreAfter: score(handAfter),
    ...overrides,
  };
}

// metricsWith starts from newBotMetrics() and applies overrides, so
// each recordTurn test case's expected result only spells out the
// fields it actually changes.
function metricsWith(overrides: Partial<BotMetrics>): BotMetrics {
  return { ...newBotMetrics(), ...overrides };
}

test("recordTurn: folds one TurnRecord into a bot's BotMetrics", () => {
  const cases: Array<{ name: string; rec: TurnRecord; want: BotMetrics }> = [
    {
      name: "knock on the first turn: counted as a turn and a first-actor turn, nothing else",
      rec: baseTurn({ turnIndex: 0, action: knock() }),
      want: metricsWith({ turns: 1, firstActorTurns: 1, knocks: 1 }),
    },
    {
      name: "knock past the first turn: not a first-actor turn",
      rec: baseTurn({ turnIndex: 2, action: knock() }),
      want: metricsWith({ turns: 1, knocks: 1 }),
    },
    {
      name: "exchange on the first turn improving the hand: pot taken as first actor",
      rec: baseTurn({
        turnIndex: 0,
        action: exchange(),
        handBefore: mustHand("7c", "8d", "9s"),
        handAfter: mustPot("Kc", "Qd", "Jh"),
      }),
      want: metricsWith({ turns: 1, firstActorTurns: 1, firstActorPotTaken: 1, handImproved: 1, exchanges: 1 }),
    },
    {
      name: "exchange past the first turn: an exchange, but not a first-actor pot-take",
      rec: baseTurn({
        turnIndex: 1,
        action: exchange(),
        handBefore: mustHand("7c", "8d", "9s"),
        handAfter: mustPot("Kc", "Qd", "Jh"),
      }),
      want: metricsWith({ turns: 1, handImproved: 1, exchanges: 1 }),
    },
    {
      name: "trade that lowers the hand score and lands at danger tier 2: not counted as improved",
      rec: baseTurn({
        turnIndex: 3,
        action: trade(0, 0),
        handBefore: mustHand("Kc", "8d", "9s"),
        handAfter: mustHand("7c", "8d", "9s"),
        potBefore: mustPot("7c", "Qc", "9c"),
        potAfter: mustPot("Kc", "Qc", "9c"),
      }),
      want: metricsWith({ turns: 1, trades: 1, dangerCounts: [0, 0, 1, 0, 0, 0], forcedTrades: 1 }),
    },
    {
      name: "trade forming a pair: pairsFormed counted",
      rec: baseTurn({
        turnIndex: 3,
        action: trade(0, 0),
        handBefore: mustHand("7c", "8d", "9s"),
        handAfter: mustHand("9h", "8d", "9s"),
        potBefore: mustPot("9h", "Qd", "Jh"),
        potAfter: mustPot("7c", "Qd", "Jh"),
      }),
      want: metricsWith({ turns: 1, trades: 1, handImproved: 0, pairsFormed: 1, dangerCounts: [1, 0, 0, 0, 0, 0], forcedTrades: 1 }),
    },
    {
      name: "trade that keeps an existing pair: not newly formed",
      rec: baseTurn({
        turnIndex: 3,
        action: trade(0, 0),
        handBefore: mustHand("9h", "8d", "9s"),
        handAfter: mustHand("9c", "8d", "9s"),
        potBefore: mustPot("9c", "Qd", "Jh"),
        potAfter: mustPot("9h", "Qd", "Jh"),
      }),
      want: metricsWith({ turns: 1, trades: 1, dangerCounts: [1, 0, 0, 0, 0, 0], forcedTrades: 1 }),
    },
    {
      name: "trade danger tier 5: resulting pot scores 31",
      rec: baseTurn({
        turnIndex: 3,
        action: trade(0, 0),
        potBefore: mustPot("7c", "Kc", "Tc"),
        potAfter: mustPot("Ac", "Kc", "Tc"),
        handBefore: mustHand("Ac", "8d", "9s"),
        handAfter: mustHand("7c", "8d", "9s"),
      }),
      want: metricsWith({ turns: 1, trades: 1, dangerCounts: [0, 0, 0, 0, 0, 1], forcedTrades: 1 }),
    },
    {
      name: "trade danger tier 4: resulting pot scores 32 (three aces)",
      rec: baseTurn({
        turnIndex: 3,
        action: trade(0, 0),
        potBefore: mustPot("7d", "Ad", "Ah"),
        potAfter: mustPot("Ac", "Ad", "Ah"),
        handBefore: mustHand("Ac", "8d", "9s"),
        handAfter: mustHand("7d", "8d", "9s"),
      }),
      want: metricsWith({ turns: 1, trades: 1, handImproved: 1, dangerCounts: [0, 0, 0, 0, 1, 0] }),
    },
    {
      name: "trade danger tier 3: resulting pot scores 30.5 (three of a kind)",
      rec: baseTurn({
        turnIndex: 3,
        action: trade(0, 0),
        potBefore: mustPot("7d", "Kd", "Kh"),
        potAfter: mustPot("Kc", "Kd", "Kh"),
        handBefore: mustHand("Kc", "8d", "9s"),
        handAfter: mustHand("7d", "8d", "9s"),
      }),
      want: metricsWith({ turns: 1, trades: 1, handImproved: 1, dangerCounts: [0, 0, 0, 1, 0, 0] }),
    },
    {
      name: "trade danger tier 1: given card is an ace, resulting pot under 27",
      rec: baseTurn({
        turnIndex: 3,
        action: trade(0, 0),
        potBefore: mustPot("7d", "7h", "8s"),
        potAfter: mustPot("Ac", "7h", "8s"),
        handBefore: mustHand("Ac", "9d", "9s"),
        handAfter: mustHand("7d", "9d", "9s"),
      }),
      want: metricsWith({ turns: 1, trades: 1, handImproved: 1, dangerCounts: [0, 1, 0, 0, 0, 0] }),
    },
    {
      // Kd/8d already score 18 (same-suit sum) before the trade, so
      // swapping the Ace in for the unrelated 7s ties at 18 rather than
      // improving -- forcedAceTrades counts it since it's a forced
      // (non-improving) trade that happens to take an Ace.
      name: "forced trade taking an Ace: forcedAceTrades counted",
      rec: baseTurn({
        turnIndex: 3,
        action: trade(0, 2),
        potBefore: mustPot("Ac", "7h", "9h"),
        potAfter: mustPot("7s", "7h", "9h"),
        handBefore: mustHand("Kd", "8d", "7s"),
        handAfter: mustHand("Kd", "8d", "Ac"),
      }),
      want: metricsWith({ turns: 1, trades: 1, dangerCounts: [1, 0, 0, 0, 0, 0], forcedTrades: 1, forcedAceTrades: 1 }),
    },
    {
      // Taking the Ace here raises the hand score (9 -> 11), so this
      // is an ordinary improving trade, not a forced one -- confirms
      // forcedAceTrades only counts Aces taken on a non-improving
      // trade, not every Ace pickup.
      name: "improving trade taking an Ace: not counted as forced",
      rec: baseTurn({
        turnIndex: 3,
        action: trade(0, 0),
        potBefore: mustPot("Ac", "Qd", "Jh"),
        potAfter: mustPot("7c", "Qd", "Jh"),
        handBefore: mustHand("7c", "8d", "9s"),
        handAfter: mustHand("Ac", "8d", "9s"),
      }),
      want: metricsWith({ turns: 1, trades: 1, handImproved: 1, dangerCounts: [1, 0, 0, 0, 0, 0] }),
    },
  ];

  for (const { name, rec, want } of cases) {
    const m = newBotMetrics();
    recordTurn(m, rec);
    assert.deepEqual(m, want, name);
  }
});

test("runSimulation: plays the requested number of games and tallies results", async () => {
  const config: SimulationConfig = { seed: 1, games: 20, botVersion: "v4", bots: ["novice", "advanced", "expert", "novice"] };
  const result = await runSimulation(config);

  assert.equal(result.games, 20);
  const totalWins = result.wins.reduce((a, b) => a + b, 0);
  assert.ok(totalWins >= result.games, "every game credits at least one bot slot with a win");
  assert.ok(result.totalRounds >= result.games, "every game plays at least one round");
});

test("runSimulation: same seed reproduces the same result", async () => {
  const config: SimulationConfig = { seed: 42, games: 10, botVersion: "v4", bots: ["advanced", "advanced", "advanced", "advanced"] };
  const a = await runSimulation(config);
  const b = await runSimulation(config);
  assert.deepEqual(a, b);
});

test("runSimulation: different seeds can produce different results", async () => {
  const bots: SimulationConfig["bots"] = ["novice", "advanced", "expert", "novice"];
  const a = await runSimulation({ seed: 1, games: 30, botVersion: "v4", bots });
  const b = await runSimulation({ seed: 2, games: 30, botVersion: "v4", bots });
  assert.notDeepEqual(a.wins, b.wins);
});

test("runSimulation: identical bots in every slot win about equally often across seat reassignment", async () => {
  const config: SimulationConfig = { seed: 7, games: 4000, botVersion: "v4", bots: ["advanced", "advanced", "advanced", "advanced"] };
  const result = await runSimulation(config);

  for (const wins of result.wins) {
    const pct = wins / result.games;
    assert.ok(pct > 0.2 && pct < 0.3, `slot win rate ${pct} should be close to 0.25 with no seat bias`);
  }
});

test("runSimulation: botVersion selects which strategy implementation plays", async () => {
  const bots: SimulationConfig["bots"] = ["novice", "advanced", "expert", "novice"];
  const v3 = await runSimulation({ seed: 1, games: 30, botVersion: "v3", bots });
  const v4 = await runSimulation({ seed: 1, games: 30, botVersion: "v4", bots });

  assert.equal(v3.games, 30);
  assert.equal(v4.games, 30);
  assert.notDeepEqual(v3.wins, v4.wins, "v3 and v4 bots should not play identically given the same seed");
});

test("runSimulation: botLog writes [bot]-prefixed decision lines only for the named seats, and only with a write callback", async () => {
  const bots: SimulationConfig["bots"] = ["novice", "advanced", "expert", "novice"];
  const botLog = new Map<number, "summary" | "full">([[1, "summary"]]);

  const withoutWrite = await runSimulation({ seed: 3, games: 1, botVersion: "v4", bots, botLog });
  assert.equal(withoutWrite.games, 1, "botLog without a write callback doesn't throw or change the result shape");

  const lines: string[] = [];
  await runSimulation({ seed: 3, games: 1, botVersion: "v4", bots, botLog }, (line) => lines.push(line));
  assert.ok(lines.length > 0, "expected at least one decision line for the logged seat's turns");
  for (const line of lines) {
    assert.ok(line.startsWith("[bot] "), line);
  }

  const noLog: string[] = [];
  await runSimulation({ seed: 3, games: 1, botVersion: "v4", bots }, (line) => noLog.push(line));
  assert.deepEqual(noLog, [], "no botLog: no decision lines written even with a write callback");
});

test("runSimulation: metrics, when requested, tallies every slot's turns and are absent otherwise", async () => {
  const bots: SimulationConfig["bots"] = ["novice", "advanced", "expert", "novice"];

  const withoutMetrics = await runSimulation({ seed: 3, games: 20, botVersion: "v4", bots });
  assert.equal(withoutMetrics.metrics, undefined);

  const result = await runSimulation({ seed: 3, games: 20, botVersion: "v4", bots, metrics: true });
  assert.equal(result.metrics?.length, 4);
  for (const m of result.metrics ?? []) {
    assert.ok(m.turns > 0, "expected each bot to have taken at least one turn across 20 games");
    assert.equal(m.trades + m.exchanges + m.knocks, m.turns, "every turn is exactly one of trade/exchange/knock");
    assert.equal(m.dangerCounts.reduce((a, b) => a + b, 0), m.trades, "danger tiers only tally trades");
    assert.ok(m.firstActorPotTaken <= m.firstActorTurns);
    assert.ok(m.handImproved <= m.turns);
    assert.ok(m.pairsFormed <= m.trades);
    assert.ok(m.forcedTrades <= m.trades);
    assert.ok(m.forcedAceTrades <= m.forcedTrades);
  }
});

test("runHeadsUpSimulation: plays the requested number of games and tallies results", async () => {
  const config: HeadsUpSimulationConfig = { seed: 1, games: 20, botVersion: "v4", bots: ["advanced", "expert"] };
  const result = await runHeadsUpSimulation(config);

  assert.equal(result.games, 20);
  const totalWins = result.wins.reduce((a, b) => a + b, 0);
  assert.ok(totalWins >= result.games, "every game credits at least one bot slot with a win");
  assert.ok(result.totalRounds >= result.games, "every game plays at least one round");
});

test("runHeadsUpSimulation: same seed reproduces the same result", async () => {
  const config: HeadsUpSimulationConfig = { seed: 42, games: 10, botVersion: "v4", bots: ["advanced", "expert"] };
  const a = await runHeadsUpSimulation(config);
  const b = await runHeadsUpSimulation(config);
  assert.deepEqual(a, b);
});

test("runHeadsUpSimulation: identical bots in both slots win about equally often across seat reassignment", async () => {
  const config: HeadsUpSimulationConfig = { seed: 7, games: 4000, botVersion: "v4", bots: ["advanced", "advanced"] };
  const result = await runHeadsUpSimulation(config);

  for (const wins of result.wins) {
    const pct = wins / result.games;
    assert.ok(pct > 0.4 && pct < 0.6, `slot win rate ${pct} should be close to 0.5 with no seat bias`);
  }
});

test("runHeadsUpSimulation: botLog writes [bot]-prefixed decision lines only for the named seats, and only with a write callback", async () => {
  const bots: HeadsUpSimulationConfig["bots"] = ["advanced", "expert"];
  const botLog = new Map<number, "summary" | "full">([[1, "summary"]]);

  const withoutWrite = await runHeadsUpSimulation({ seed: 3, games: 1, botVersion: "v4", bots, botLog });
  assert.equal(withoutWrite.games, 1, "botLog without a write callback doesn't throw or change the result shape");

  const lines: string[] = [];
  await runHeadsUpSimulation({ seed: 3, games: 5, botVersion: "v4", bots, botLog }, (line) => lines.push(line));
  assert.ok(lines.length > 0, "expected at least one decision line for the logged seat's turns across a few games");
  for (const line of lines) {
    assert.ok(line.startsWith("[bot] "), line);
  }

  const noLog: string[] = [];
  await runHeadsUpSimulation({ seed: 3, games: 1, botVersion: "v4", bots }, (line) => noLog.push(line));
  assert.deepEqual(noLog, [], "no botLog: no decision lines written even with a write callback");
});

test("formatHeadsUpReport", () => {
  const config: HeadsUpSimulationConfig = { seed: 7, games: 4, botVersion: "v4", bots: ["advanced", "expert"] };
  const result: HeadsUpSimulationResult = { games: 4, wins: [1, 3], ties: 1, totalRounds: 12 };

  assert.deepEqual(formatHeadsUpReport(config, result), [
    "Played 4 game(s) with seed 7 (bots v4, heads up)",
    "",
    "Bot 1 (advanced): 1 win(s), 25.0%",
    "Bot 2 (expert): 3 win(s), 75.0%",
    "",
    "Ties: 1",
    "Average rounds per game: 3.00",
  ]);
});

test("formatHeadsUpReport: appends a Metrics section when the result carries one", () => {
  const config: HeadsUpSimulationConfig = { seed: 7, games: 4, botVersion: "v4", bots: ["advanced", "expert"], metrics: true };
  const result: HeadsUpSimulationResult = {
    games: 4,
    wins: [1, 3],
    ties: 1,
    totalRounds: 12,
    metrics: [
      metricsWith({ turns: 10, firstActorTurns: 4, firstActorPotTaken: 1, handImproved: 5, trades: 6, exchanges: 2, knocks: 2, pairsFormed: 1, dangerCounts: [3, 1, 1, 0, 1, 0], forcedTrades: 3, forcedAceTrades: 1 }),
      metricsWith({ turns: 8 }),
    ],
  };

  assert.deepEqual(formatHeadsUpReport(config, result), [
    "Played 4 game(s) with seed 7 (bots v4, heads up)",
    "",
    "Bot 1 (advanced): 1 win(s), 25.0%",
    "Bot 2 (expert): 3 win(s), 75.0%",
    "",
    "Ties: 1",
    "Average rounds per game: 3.00",
    "",
    "Metrics:",
    "Bot 1 (advanced):",
    "  Took pot as first actor: 1/4 (25.0%)",
    "  Hand improved: 5/10 (50.0%)",
    "  Knocks: 2",
    "  Trades forming a pair: 1/6 (16.7%)",
    "  Trade danger score: avg 1.17, tiers 0-5: 3/1/1/0/1/0",
    "  Aces taken on a forced trade: 1/3 (33.3%)",
    "Bot 2 (expert):",
    "  Took pot as first actor: 0/0 (n/a)",
    "  Hand improved: 0/8 (0.0%)",
    "  Knocks: 0",
    "  Trades forming a pair: 0/0 (n/a)",
    "  Trade danger score: avg n/a, tiers 0-5: 0/0/0/0/0/0",
    "  Aces taken on a forced trade: 0/0 (n/a)",
  ]);
});

test("allBotCombos: every distinct 4-bot multiset of novice/advanced/expert, no duplicates", () => {
  const combos = allBotCombos();
  const labels = combos.map((bots) => [...bots].sort().join(","));

  assert.equal(combos.length, 15);
  assert.equal(new Set(labels).size, 15, "no combo repeated as a different permutation");
  for (const bots of combos) {
    assert.equal(bots.length, 4);
  }
});

test("runAllCombos: plays every combo with its own result, all at the given seed/games", async () => {
  const combos = await runAllCombos(20, 5, "v4");

  assert.equal(combos.length, 15);
  for (const { result } of combos) {
    assert.equal(result.games, 20);
  }
});

test("formatComboTable", () => {
  const combos: ComboResult[] = [
    { bots: ["novice", "novice", "advanced", "expert"], result: { games: 100, wins: [30, 20, 25, 25], ties: 4, totalRounds: 950 } },
    { bots: ["advanced", "advanced", "advanced", "advanced"], result: { games: 100, wins: [26, 24, 25, 25], ties: 5, totalRounds: 926 } },
  ];

  assert.deepEqual(formatComboTable(100, 3, "v4", combos), [
    "Played 100 game(s) per combo (2 combos) with seed 3 (bots v4)",
    "",
    "Combo  Games  Bot 1  Bot 2  Bot 3  Bot 4  Ties  Avg Rounds",
    "-----  -----  -----  -----  -----  -----  ----  ----------",
    "nnae   100    30.0%  20.0%  25.0%  25.0%  4.0%  9.50",
    "aaaa   100    26.0%  24.0%  25.0%  25.0%  5.0%  9.26",
  ]);
});

test("formatReport", () => {
  const config: SimulationConfig = { seed: 7, games: 4, botVersion: "v3", bots: ["novice", "advanced", "expert", "advanced"] };
  const result: SimulationResult = { games: 4, wins: [1, 2, 1, 0], ties: 1, totalRounds: 12 };

  assert.deepEqual(formatReport(config, result), [
    "Played 4 game(s) with seed 7 (bots v3)",
    "",
    "Bot 1 (novice): 1 win(s), 25.0%",
    "Bot 2 (advanced): 2 win(s), 50.0%",
    "Bot 3 (expert): 1 win(s), 25.0%",
    "Bot 4 (advanced): 0 win(s), 0.0%",
    "",
    "Ties: 1",
    "Average rounds per game: 3.00",
  ]);
});
