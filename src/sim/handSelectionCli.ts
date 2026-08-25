// Command-line entry point for the Hand Selection Monte Carlo analysis
// (see handSelection.ts). Deals many random (hand, pot) pairs and
// reports, per hand score, how often and by how much swapping for the
// pot would actually help -- data instead of a guessed threshold.

import { aggregateByHandScore, formatHandScoreTable, sampleHandsAndPots } from "./handSelection.ts";

const DEFAULT_TRIALS = 100_000;

interface Config {
  trials: number;
  seed: number;
}

// parseArgs reads argv (e.g. process.argv.slice(2)) for:
//
//   --trials=N   number of (hand, pot) pairs to deal (default 100000)
//   --seed=N     rng seed (default derived from the clock)
export function parseArgs(argv: readonly string[], now: () => number = Date.now): Config {
  const flags = new Map<string, string>();
  for (const arg of argv) {
    if (!arg.startsWith("--") || !arg.includes("=")) {
      throw new Error(`handSelection: unrecognized argument "${arg}" (expected --flag=value)`);
    }
    const eq = arg.indexOf("=");
    flags.set(arg.slice(2, eq), arg.slice(eq + 1));
  }

  for (const [flag] of flags) {
    if (flag !== "trials" && flag !== "seed") {
      throw new Error(`handSelection: unknown flag "--${flag}"`);
    }
  }

  const trialsRaw = flags.get("trials");
  const trials = trialsRaw === undefined ? DEFAULT_TRIALS : Number(trialsRaw);
  if (!Number.isInteger(trials) || trials < 1) {
    throw new Error(`handSelection: --trials=${trialsRaw} must be a positive integer`);
  }

  const seedRaw = flags.get("seed");
  const seed = seedRaw === undefined ? now() >>> 0 : Number(seedRaw);
  if (!Number.isInteger(seed)) {
    throw new Error(`handSelection: --seed=${seedRaw} must be an integer`);
  }

  return { trials, seed: seed >>> 0 };
}

export function main(argv: readonly string[], stdout: NodeJS.WritableStream): void {
  const config = parseArgs(argv);
  const samples = sampleHandsAndPots(config.trials, config.seed);
  const buckets = aggregateByHandScore(samples);
  stdout.write(formatHandScoreTable(config.trials, config.seed, buckets).join("\n") + "\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main(process.argv.slice(2), process.stdout);
  } catch (err: unknown) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  }
}
