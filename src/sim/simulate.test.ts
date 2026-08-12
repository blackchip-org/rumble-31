import { test } from "node:test";
import assert from "node:assert/strict";
import { allBotCombos, formatComboTable, formatReport, runAllCombos, runSimulation } from "./simulate.ts";
import type { ComboResult, SimulationConfig, SimulationResult } from "./simulate.ts";

test("runSimulation: plays the requested number of games and tallies results", async () => {
  const config: SimulationConfig = { seed: 1, games: 20, bots: ["easy", "regular", "difficult", "easy"] };
  const result = await runSimulation(config);

  assert.equal(result.games, 20);
  const totalWins = result.wins.reduce((a, b) => a + b, 0);
  assert.ok(totalWins >= result.games, "every game credits at least one bot slot with a win");
  assert.ok(result.totalRounds >= result.games, "every game plays at least one round");
});

test("runSimulation: same seed reproduces the same result", async () => {
  const config: SimulationConfig = { seed: 42, games: 10, bots: ["regular", "regular", "regular", "regular"] };
  const a = await runSimulation(config);
  const b = await runSimulation(config);
  assert.deepEqual(a, b);
});

test("runSimulation: different seeds can produce different results", async () => {
  const bots: SimulationConfig["bots"] = ["easy", "regular", "difficult", "easy"];
  const a = await runSimulation({ seed: 1, games: 30, bots });
  const b = await runSimulation({ seed: 2, games: 30, bots });
  assert.notDeepEqual(a.wins, b.wins);
});

test("runSimulation: identical bots in every slot win about equally often across seat reassignment", async () => {
  const config: SimulationConfig = { seed: 7, games: 4000, bots: ["regular", "regular", "regular", "regular"] };
  const result = await runSimulation(config);

  for (const wins of result.wins) {
    const pct = wins / result.games;
    assert.ok(pct > 0.2 && pct < 0.3, `slot win rate ${pct} should be close to 0.25 with no seat bias`);
  }
});

test("allBotCombos: every distinct 4-bot multiset of easy/regular/difficult, no duplicates", () => {
  const combos = allBotCombos();
  const labels = combos.map((bots) => [...bots].sort().join(","));

  assert.equal(combos.length, 15);
  assert.equal(new Set(labels).size, 15, "no combo repeated as a different permutation");
  for (const bots of combos) {
    assert.equal(bots.length, 4);
  }
});

test("runAllCombos: plays every combo with its own result, all at the given seed/games", async () => {
  const combos = await runAllCombos(20, 5);

  assert.equal(combos.length, 15);
  for (const { result } of combos) {
    assert.equal(result.games, 20);
  }
});

test("formatComboTable", () => {
  const combos: ComboResult[] = [
    { bots: ["easy", "easy", "regular", "difficult"], result: { games: 100, wins: [30, 20, 25, 25], ties: 4, totalRounds: 950 } },
    { bots: ["regular", "regular", "regular", "regular"], result: { games: 100, wins: [26, 24, 25, 25], ties: 5, totalRounds: 926 } },
  ];

  assert.deepEqual(formatComboTable(100, 3, combos), [
    "Played 100 game(s) per combo (2 combos) with seed 3",
    "",
    "Combo  Games  Easy avg  Regular avg  Difficult avg  Ties  Avg Rounds",
    "-----  -----  --------  -----------  -------------  ----  ----------",
    "eerd   100    25.0%     25.0%        25.0%          4.0%  9.50",
    "rrrr   100    —         25.0%        —              5.0%  9.26",
  ]);
});

test("formatReport", () => {
  const config: SimulationConfig = { seed: 7, games: 4, bots: ["easy", "regular", "difficult", "regular"] };
  const result: SimulationResult = { games: 4, wins: [1, 2, 1, 0], ties: 1, totalRounds: 12 };

  assert.deepEqual(formatReport(config, result), [
    "Played 4 game(s) with seed 7",
    "",
    "Bot 1 (easy): 1 win(s), 25.0%",
    "Bot 2 (regular): 2 win(s), 50.0%",
    "Bot 3 (difficult): 1 win(s), 25.0%",
    "Bot 4 (regular): 0 win(s), 0.0%",
    "",
    "Ties: 1",
    "Average rounds per game: 3.00",
  ]);
});
