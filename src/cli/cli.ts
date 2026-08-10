// Interactive command line player for Rumble-31, per specs/cli.md.

import { cardConsole } from "../card/card.ts";
import type { Card } from "../card/card.ts";
import { MAX_BOT_THINK_TIME, MIN_BOT_THINK_TIME } from "../config.ts";
import { turnStartLine } from "../log.ts";
import type { Action, PlayerView, Strategy } from "../game/types.ts";
import { exchange, knock, trade } from "../game/types.ts";
import type { LineReader, Writer } from "./io.ts";
import { clock } from "./io.ts";

// renderCards joins each card's console representation with spaces, for
// printing a hand or pot to the interactive player.
export function renderCards(cards: readonly Card[]): string {
  return cards.map(cardConsole).join(" ");
}

// announceTurn wraps a strategy so that, before deciding, it writes the
// "Seat's turn" log line. Used for every seat, human included.
export function announceTurn(seat: number, inner: Strategy, out: Writer): Strategy {
  return {
    decide(v: PlayerView): Action | Promise<Action> {
      out.write(`${turnStartLine(seat)}\n`);
      return inner.decide(v);
    },
  };
}

// thinking wraps a strategy so that, before deciding, it writes the
// "Seat's turn" log line, then pauses for a random duration between
// MIN_BOT_THINK_TIME and MAX_BOT_THINK_TIME, simulating a bot
// thinking. Intended for bot seats only.
export function thinking(seat: number, inner: Strategy, out: Writer): Strategy {
  return announceTurn(
    seat,
    {
      decide(v: PlayerView): Action | Promise<Action> {
        clock.sleep(MIN_BOT_THINK_TIME + Math.random() * (MAX_BOT_THINK_TIME - MIN_BOT_THINK_TIME));
        return inner.decide(v);
      },
    },
    out,
  );
}

function parseStrictInt(s: string): number | undefined {
  const trimmed = s.trim();
  if (!/^-?\d+$/.test(trimmed)) {
    return undefined;
  }
  return Number.parseInt(trimmed, 10);
}

// Human is a Strategy that prompts a person for each decision, reading
// input from the reader and writing prompts and output to the writer
// given to the constructor.
export class Human implements Strategy {
  private reader: LineReader;
  private out: Writer;

  constructor(reader: LineReader, out: Writer) {
    this.reader = reader;
    this.out = out;
  }

  decide(v: PlayerView): Action {
    this.out.write(`\npot:       ${renderCards(v.pot)}\n`);
    this.out.write(`your hand: ${renderCards(v.hand)}\n`);

    this.out.write("choose an action:\n");
    this.out.write("  [1] trade one card with the pot\n");
    this.out.write(
      v.isFirstTurnOfRound
        ? "  [2] exchange your entire hand with the pot\n"
        : "  [2] exchange your entire hand with the pot (this also knocks)\n",
    );
    this.out.write("  [3] knock\n");
    const choice = this.chooseOption(3);
    if (choice === 2) {
      return exchange();
    }
    if (choice === 3) {
      return knock();
    }
    return this.chooseTrade();
  }

  // waitForEnter prints a prompt and reads (and discards) one line,
  // pausing the player between rounds. Safe to call with input
  // exhausted (returns immediately).
  waitForEnter(): void {
    this.out.write("\npress enter to continue...");
    this.reader.readLine();
  }

  // chooseOption reads a choice from 1 to max, reprompting on anything
  // else. If the input is exhausted it defaults to 1, since that choice
  // is always legal.
  private chooseOption(max: number): number {
    for (;;) {
      this.out.write("> ");
      const line = this.reader.readLine();
      if (line === undefined) {
        return 1;
      }
      const n = parseStrictInt(line);
      if (n === undefined || n < 1 || n > max) {
        this.out.write(`please enter a number from 1 to ${max}\n`);
        continue;
      }
      return n;
    }
  }

  // chooseTrade prompts for a pot card and a hand card by position and
  // returns the corresponding trade action.
  private chooseTrade(): Action {
    const potIdx = this.chooseCardIndex("pot card to take");
    const handIdx = this.chooseCardIndex("hand card to give up");
    return trade(potIdx, handIdx);
  }

  // chooseCardIndex prompts for a card's position (1, 2, or 3) in
  // whichever hand/pot line was just printed, reprompting on anything
  // else, and returns it 0-based. If the input is exhausted it
  // defaults to index 0.
  private chooseCardIndex(label: string): number {
    for (;;) {
      this.out.write(`${label} (1-3): `);
      const line = this.reader.readLine();
      if (line === undefined) {
        return 0;
      }
      const n = parseStrictInt(line);
      if (n === undefined || n < 1 || n > 3) {
        this.out.write("please enter 1, 2, or 3\n");
        continue;
      }
      return n - 1;
    }
  }
}
