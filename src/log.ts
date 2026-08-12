import { cardToString } from "./card/card.ts";
import type { Card } from "./card/card.ts";
import type { Game, RoundOutcome } from "./game/game.ts";
import { seatName } from "./game/seat.ts";
import type { Hand, Pot, TurnRecord } from "./game/types.ts";

// gameStartLines is written once, at program start, per specs/log.md.
export function gameStartLines(seed: number, version: string): string[] {
  return [`Welcome to Rumble-31, v${version}`, `Starting game with seed ${seed}`];
}

// roundStartLines is written once a round is dealt, before its first
// turn: the round header, the dealt pot, and the human's own dealt
// hand (no other seat's hand is ever logged). South is omitted once
// already eliminated, since no hand is dealt to them. Who goes first
// isn't stated separately — it's implied by the very next "Seat's
// turn" line. The pot is private to everyone but firstSeat (specs/
// rules.md): its cards are only shown here if South is firstSeat —
// otherwise the "Pot is dealt" line omits them, and they're logged for
// the first time by potLine, once the first player has acted.
export function roundStartLines(roundNum: number, pot: Pot, southHand: Hand | undefined, firstSeat: number): string[] {
  const lines = [
    "",
    `=== Round ${roundNum} ===`,
    firstSeat === 0 ? `Pot is dealt [${cardsNotation(pot)}]` : "Pot is dealt",
  ];
  if (southHand !== undefined) {
    lines.push(`South is dealt [${cardsNotation(southHand)}]`);
  }
  return lines;
}

// turnStartLine is written right before a seat's decide() is called,
// human and bot alike.
export function turnStartLine(seat: number): string {
  return `${seatName(seat)}'s turn`;
}

// turnLines is written after a turn is taken: the action, and — for
// trade/exchange, which change the pot — the pot again afterward.
export function turnLines(rec: TurnRecord): string[] {
  const seat = seatName(rec.seat);
  switch (rec.action.type) {
    case "trade": {
      const given = rec.handBefore[rec.action.handIndex] as Card;
      const taken = rec.potBefore[rec.action.potIndex] as Card;
      return [`${seat} trades [${cardToString(given)}] for [${cardToString(taken)}]`, potLine(rec)];
    }
    case "exchange":
      return [`${seat} exchanges [${cardsNotation(rec.handBefore)}] for [${cardsNotation(rec.potBefore)}]`, potLine(rec)];
    case "knock":
      // On the round's first turn (Keep), the pot was never touched but
      // may still have been private — reveal it here since this is the
      // only announcement this turn makes.
      return rec.turnIndex === 0 ? [`${seat} knocks`, potLine(rec)] : [`${seat} knocks`];
  }
}

function potLine(rec: TurnRecord): string {
  return `Pot is [${cardsNotation(rec.potAfter)}]`;
}

// roundRecapLines is written once a round ends: every participant's
// final hand/score/strikes, then a line for each seat that was struck
// this round.
export function roundRecapLines(outcome: RoundOutcome, strikes: readonly number[]): string[] {
  const lines: string[] = [];
  for (const pr of outcome.result.players) {
    const n = strikes[pr.seat] as number;
    lines.push(`${seatName(pr.seat)} has [${cardsNotation(pr.hand)}] for ${pr.score.toFixed(1)} points with ${n} strike${n === 1 ? "" : "s"}`);
  }
  for (const seat of outcome.struck) {
    const eliminated = outcome.eliminated.includes(seat);
    lines.push(`${seatName(seat)} receives a strike${eliminated ? " and is eliminated" : ""}`);
  }
  return lines;
}

// gameEndLines is written once the game is over.
export function gameEndLines(g: Game): string[] {
  const lines: string[] = [];
  if (g.winners().includes(0)) {
    lines.push("South wins the game");
  }
  lines.push("Game over");
  return lines;
}

function cardsNotation(cards: readonly Card[]): string {
  return cards.map(cardToString).join(" ");
}
