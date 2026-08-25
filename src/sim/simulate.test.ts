import { test } from "node:test";
import assert from "node:assert/strict";
import { allBotCombos, formatComboTable, formatReport, runAllCombos, runSimulation } from "./simulate.ts";
import type { ComboResult, SimulationConfig, SimulationResult } from "./simulate.ts";

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
