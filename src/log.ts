import { cardToString } from "./card/card.ts";
import type { Card } from "./card/card.ts";
import type { Game, RoundOutcome } from "./game/game.ts";
import { seatName } from "./game/seat.ts";
import type { Hand, TurnRecord } from "./game/types.ts";

// gameStartLines is written once, at program start, per specs/log.md.
export function gameStartLines(seed: number, version: string): string[] {
  return [`Welcome to Rumble 31, v${version}`, `Starting game with seed ${seed}`];
}

// roundStartLines is written once a round is dealt, before its first
// turn: the round header, the dealt pot, and the human's own dealt
// hand (no other seat's hand is ever logged). South is omitted once
// already eliminated, since no hand is dealt to them. Who goes first
// isn't stated separately — it's implied by the very next "Seat's
// turn" line. The pot is private to everyone, including the first
// player to act (specs/rules.md), so the "Pot is dealt" line never
// names its cards here — they're logged for the first time by
// potLine, once the first player has acted.
export function roundStartLines(roundNum: number, southHand: Hand | undefined): string[] {
  const lines = ["", `=== Round ${roundNum} ===`, "Pot is dealt"];
  if (southHand !== undefined) {
    lines.push(`South is dealt [${cardsNotation(southHand)}]`);
  }
  return lines;
}

// turnStartLine is written right before a seat's decide() is called,
// human and bot alike. isFirst is true only for the round's first turn
// (specs/rules.md's Take Pot/Keep turn), which gets its own wording.
export function turnStartLine(seat: number, isFirst: boolean): string {
  return isFirst ? `${seatName(seat)} goes first` : `${seatName(seat)}'s turn`;
}

// turnLines is written after a turn is taken: the action, and — for
// trade/exchange, which change the pot — the pot again afterward.
//
// The round's first turn (Take Pot/Keep) gets its own wording and
// never names cards moving pot -> hand: the pot is still private at
// that point (specs/rules.md), so what the acting seat draws from it
// (Take Pot) must stay private forever, exactly like any other hand —
// only what they give up (their old hand, becoming the round's new
// public pot, per potLine below) is safe to announce. Keep doesn't
// touch the pot at all, but this is still the only announcement that
// turn makes, so the pot is revealed here for the first time.
export function turnLines(rec: TurnRecord): string[] {
  const seat = seatName(rec.seat);
  if (rec.turnIndex === 0) {
    switch (rec.action.type) {
      case "knock":
        return [`${seat} keeps their hand`, potLine(rec)];
      case "exchange":
        return [`${seat} exchanges their hand for the pot`, potLine(rec)];
      case "trade":
        break; // Not legal on the round's first turn (validateAction).
    }
  }
  switch (rec.action.type) {
    case "trade": {
      const given = rec.handBefore[rec.action.handIndex] as Card;
      const taken = rec.potBefore[rec.action.potIndex] as Card;
      return [`${seat} trades [${cardToString(given)}] for [${cardToString(taken)}]`, potLine(rec)];
    }
    case "exchange":
      return [`${seat} exchanges [${cardsNotation(rec.handBefore)}] for [${cardsNotation(rec.potBefore)}]`, potLine(rec)];
    case "knock":
      return [`${seat} knocks`];
  }
}

function potLine(rec: TurnRecord): string {
  return `Pot is [${cardsNotation(rec.potAfter)}]`;
}

// roundRecapLines is written once a round ends: every participant's
// final hand, then a line for each seat struck this round, then every
// participant's score and strike count.
export function roundRecapLines(outcome: RoundOutcome, strikes: readonly number[]): string[] {
  const lines: string[] = [];
  for (const pr of outcome.result.players) {
    lines.push(`${seatName(pr.seat)} has [${cardsNotation(pr.hand)}]`);
  }
  for (const seat of outcome.struck) {
    const eliminated = outcome.eliminated.includes(seat);
    const gotSecondChance = outcome.secondChanceGranted.includes(seat);
    const suffix = eliminated ? " and is eliminated" : gotSecondChance ? " and gets a second chance" : "";
    lines.push(`${seatName(seat)} receives a strike${suffix}`);
  }
  for (const pr of outcome.result.players) {
    const n = strikes[pr.seat] as number;
    lines.push(`${seatName(pr.seat)} has ${pr.score.toFixed(1)} points with ${n} strike${n === 1 ? "" : "s"}`);
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
