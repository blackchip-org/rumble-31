// Command-line entry point for the headless bot-vs-bot simulator. All
// actual logic lives in cliParams.ts and simulate.ts, which take no
// dependency on argv/stdio and are covered by their own unit tests —
// this file only wires those to the process.

import { parseCliArgs } from "./cliParams.ts";
import { formatComboTable, formatReport, runAllCombos, runSimulation } from "./simulate.ts";

export async function main(argv: readonly string[], stdout: NodeJS.WritableStream): Promise<void> {
  const config = parseCliArgs(argv);

  if (config.mode === "all") {
    const combos = await runAllCombos(config.games, config.seed);
    stdout.write(formatComboTable(config.games, config.seed, combos).join("\n") + "\n");
    return;
  }

  const result = await runSimulation(config);
  stdout.write(formatReport(config, result).join("\n") + "\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2), process.stdout).catch((err: unknown) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  });
}
