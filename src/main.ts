// Rumble-31 CLI: the human is seat 0, playing against three bots, until
// the game ends.

import { pathToFileURL } from "node:url";
import { Bot } from "./bot/bot.ts";
import { announceTurn, thinking, Human } from "./cli/cli.ts";
import type { LineReader, Writer } from "./cli/io.ts";
import { clock, stdinLineReader, streamWriter } from "./cli/io.ts";
import { newGame } from "./game/game.ts";
import { gameEndLines, gameStartLines, roundRecapLines, roundStartLines, turnLines } from "./log.ts";
import type { Hand } from "./game/types.ts";
import { version } from "./version.ts";

// run plays one interactive game with seed: the human (reading from
// reader) is seat 0, against three bots, writing all output to out. The
// game ends the instant seat 0 is eliminated — the rest of the bots'
// contest is never played out. opts.initialStrikes seeds each seat's
// strike count (for -strikes debugging); a seat starting at 3 or more
// is already eliminated before round 1, in which case no rounds are
// played at all.
export async function run(
  seed: number,
  reader: LineReader,
  out: Writer,
  opts?: { version?: string; initialStrikes?: [number, number, number, number] },
): Promise<void> {
  const ver = opts?.version ?? version;
  for (const line of gameStartLines(seed, ver)) {
    out.write(`${line}\n`);
  }

  const human = new Human(reader, out);
  const bots: [Bot, Bot, Bot] = [new Bot(), new Bot(), new Bot()];

  const g = newGame(
    seed,
    [announceTurn(0, human, out), thinking(1, bots[0], out), thinking(2, bots[1], out), thinking(3, bots[2], out)],
    opts?.initialStrikes,
  );

  for (let roundNum = 1; g.active() && !g.eliminated[0]; roundNum++) {
    g.onDeal = (pot, hands) => {
      pot.forEach(() => clock.sleep(100));
      for (const line of roundStartLines(roundNum, pot, hands.get(0) as Hand)) {
        out.write(`${line}\n`);
      }
    };
    g.onTurn = (rec) => {
      for (const line of turnLines(rec)) {
        out.write(`${line}\n`);
      }
    };

    const outcome = await g.playRound();

    for (const line of roundRecapLines(outcome, g.strikes)) {
      out.write(`${line}\n`);
    }

    if (g.active() && !g.eliminated[0]) {
      human.waitForEnter();
    }
  }

  for (const line of gameEndLines(g)) {
    out.write(`${line}\n`);
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
