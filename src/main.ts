// Rumble-31 CLI: the human is seat 0, playing against three bots, until
// the game ends.

import { pathToFileURL } from "node:url";
import { Bot } from "./bot/bot.ts";
import { dealPot, newNarrator, renderCards, thinking, Human } from "./cli/cli.ts";
import type { LineReader, Writer } from "./cli/io.ts";
import { stdinLineReader, streamWriter } from "./cli/io.ts";
import type { RoundOutcome, Game } from "./game/game.ts";
import { newGame } from "./game/game.ts";
import { seatName } from "./game/seat.ts";
import { loadBuildTime, version } from "./version.ts";

// run plays one interactive game with seed: the human (reading from
// reader) is seat 0, against three bots, writing all output to out.
// Once seat 0 is eliminated, the remainder of the game plays out
// silently and only the final result is shown. opts.initialStrikes
// seeds each seat's strike count (for -strikes debugging); a seat
// starting at 3 or more is already eliminated before round 1.
export async function run(
  seed: number,
  reader: LineReader,
  out: Writer,
  opts?: { version?: string; buildTime?: string; initialStrikes?: [number, number, number, number] },
): Promise<void> {
  const ver = opts?.version ?? version;
  const buildTime = opts?.buildTime ?? loadBuildTime();

  out.write("Welcome to Rumble-31\n");
  out.write(`Version v${ver}, built on ${buildTime}\n`);
  out.write(`You are ${seatName(0)}\n`);
  out.write(`seed: ${seed}\n`);

  const human = new Human(reader, out);
  const bots: [Bot, Bot, Bot] = [new Bot(), new Bot(), new Bot()];

  const g = newGame(
    seed,
    [human, thinking(1, bots[0], out), thinking(2, bots[1], out), thinking(3, bots[2], out)],
    opts?.initialStrikes,
  );

  let interactive = !g.eliminated[0];
  if (!interactive) {
    out.write("\nYou start this game already eliminated.\n");
  }

  for (let roundNum = 1; g.active(); roundNum++) {
    if (interactive) {
      out.write(`\n=== round ${roundNum} ===\n`);
      g.onDeal = (pot) => dealPot(out, pot);
      g.onTurn = newNarrator(out);
    } else {
      g.onDeal = undefined;
      g.onTurn = undefined;
    }

    const outcome = await g.playRound();
    if (!interactive) {
      continue;
    }

    printRoundRecap(out, roundNum, outcome, g.strikes);
    if (outcome.eliminated.includes(0)) {
      out.write("\nYou have been eliminated. The rest of the game will play out silently...\n");
      interactive = false;
      continue;
    }
    human.waitForEnter();
  }

  printGameResult(out, g);
}

// printRoundRecap prints one round's final hands/scores/ranks/current
// strikes, noting which seats were struck or eliminated as a result.
// strikes is the game's current per-seat strike count (already
// updated for this round). Only seats that took part in this round
// appear here — a seat eliminated in an earlier round isn't dealt in
// anymore, so it's simply absent.
export function printRoundRecap(out: Writer, roundNum: number, outcome: RoundOutcome, strikes: readonly number[]): void {
  out.write(`\nround ${roundNum} result:\n`);
  for (const pr of outcome.result.players) {
    let note = "";
    if (outcome.eliminated.includes(pr.seat)) {
      note = "  (struck, eliminated)";
    } else if (outcome.struck.includes(pr.seat)) {
      note = "  (struck)";
    }
    out.write(
      `  ${seatName(pr.seat)}  hand ${renderCards(pr.hand)}  score ${pr.score.toFixed(1)}  rank ${pr.rank}  strikes ${strikes[pr.seat]}${note}\n`,
    );
  }
}

// printGameResult prints the final strikes tally and the game
// winner(s), with a message tailored to whether seat 0 won.
export function printGameResult(out: Writer, g: Game): void {
  out.write("\n=== game over ===\n");
  for (let seat = 0; seat < 4; seat++) {
    const status = g.eliminated[seat] ? "  (eliminated)" : "";
    out.write(`  ${seatName(seat)}  ${g.strikes[seat]} strikes${status}\n`);
  }

  const winners = g.winners();
  out.write(`\nwinners: [${winners.map(seatName).join(" ")}]\n`);
  if (winners.includes(0)) {
    out.write("You won the game!\n");
  } else {
    out.write("You did not win this game.\n");
  }
}

function parseSeedArg(argv: readonly string[]): number {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    const eq = /^--?seed=(.+)$/.exec(arg);
    if (eq?.[1] !== undefined) {
      return Number(eq[1]);
    }
    if (arg === "--seed" || arg === "-seed") {
      const next = argv[i + 1];
      if (next !== undefined) {
        return Number(next);
      }
    }
  }
  return Date.now();
}

// parseStrikesArg reads the debugging -strikes flag: a run of exactly 4
// digits, one per seat in order (seat 0 first). Throws if a -strikes
// value is present but isn't exactly 4 digits.
export function parseStrikesArg(argv: readonly string[]): [number, number, number, number] {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    const eq = /^--?strikes=(.+)$/.exec(arg);
    if (eq?.[1] !== undefined) {
      return parseStrikesValue(eq[1]);
    }
    if (arg === "--strikes" || arg === "-strikes") {
      const next = argv[i + 1];
      if (next !== undefined) {
        return parseStrikesValue(next);
      }
    }
  }
  return [0, 0, 0, 0];
}

function parseStrikesValue(value: string): [number, number, number, number] {
  if (!/^\d{4}$/.test(value)) {
    throw new Error(`invalid -strikes value ${JSON.stringify(value)}: expected exactly 4 digits`);
  }
  return [Number(value[0]), Number(value[1]), Number(value[2]), Number(value[3])] as [
    number,
    number,
    number,
    number,
  ];
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href;
}

if (isMainModule()) {
  const seed = parseSeedArg(process.argv.slice(2));
  let initialStrikes: [number, number, number, number];
  try {
    initialStrikes = parseStrikesArg(process.argv.slice(2));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  }
  await run(seed, stdinLineReader(), streamWriter(process.stdout), { initialStrikes });
}
