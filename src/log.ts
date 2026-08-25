import { cardToString } from "./card/card.ts";
import type { Card } from "./card/card.ts";
import type { RoundOutcome } from "./game/game.ts";
import { seatName } from "./game/seat.ts";
import type { DecisionTraceEntry, Hand, TurnRecord } from "./game/types.ts";

// gameStartLines is written once, at program start, per specs/log.md.
// difficultyLabel names the game's Difficulty setting (e.g.
// "Moderate") -- the bot seats' actual skill levels stay unannounced
// until gameEndLines reveals them.
export function gameStartLines(seed: number, version: string, botVersion: string, difficultyLabel: string): string[] {
  return [`Welcome to Rumble 31, v${version}`, `Starting game with seed ${seed}`, `Bot version ${botVersion}`, `Difficulty level is ${difficultyLabel}`];
}

// roundStartLines is written once a round is dealt, before its first
// turn: the round header, the round's dealer, and the human's own
// dealt hand (no other seat's hand is ever logged). South is omitted
// once already eliminated, since no hand is dealt to them. Who goes
// first isn't stated separately — it's implied by the very next
// "Seat's turn" line. The pot is private to everyone, including the
// first player to act (specs/rules.md), so it's never named here —
// it's logged for the first time by potLine, once the first player
// has acted.
export function roundStartLines(roundNum: number, southHand: Hand | undefined, dealerSeat: number): string[] {
  const lines = ["", `=== Round ${roundNum} ===`, `${seatName(dealerSeat)} is the dealer`];
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

// botDecisionLines formats a bot seat's decision trace (specs/
// bots_v4.md's "Decision Logging") as [bot]-prefixed lines, at either
// the Summary or Full Trace level. Written by the caller between that
// seat's turnStartLine and its turnLines, and excluded from the saved
// log file. detail "summary" emits the single acted entry (there is
// always exactly one); "full" emits every entry, in order.
export function botDecisionLines(seat: number, trace: readonly DecisionTraceEntry[], detail: "summary" | "full"): string[] {
  const name = seatName(seat);
  if (detail === "summary") {
    const acted = trace.find((e) => e.acted);
    return acted ? [`[bot] ${name}: ${acted.phase} -- ${acted.summary as string}`] : [];
  }
  return trace.map((e) => `[bot] ${name} (${e.phase}): ${e.detail}`);
}

function potLine(rec: TurnRecord): string {
  return `Pot is [${cardsNotation(rec.potAfter)}]`;
}

// roundRecapLines is written once a round ends: how the round ended,
// then every participant's final hand, then a line for each seat
// struck this round, then every participant's score and strike count.
export function roundRecapLines(outcome: RoundOutcome, strikes: readonly number[]): string[] {
  const lines: string[] = [];
  const { type, seat } = outcome.endReason;
  lines.push(type === "31" ? `Round over: ${seatName(seat)} has 31` : `Round over: ${seatName(seat)} knocked`);
  for (const pr of outcome.result.players) {
    lines.push(`${seatName(pr.seat)} has [${cardsNotation(pr.hand)}]`);
  }
  for (const s of outcome.struck) {
    const eliminated = outcome.eliminated.includes(s);
    const gotSecondChance = outcome.secondChanceGranted.includes(s);
    const suffix = eliminated ? " and is eliminated" : gotSecondChance ? " and gets a second chance" : "";
    lines.push(`${seatName(s)} receives a strike${suffix}`);
  }
  for (const pr of outcome.result.players) {
    const n = strikes[pr.seat] as number;
    const scoreText = Number.isInteger(pr.score) ? String(pr.score) : pr.score.toFixed(1);
    lines.push(`${seatName(pr.seat)} has ${scoreText} points with ${n} strike${n === 1 ? "" : "s"}`);
  }
  return lines;
}

// PLACE_ORDINALS maps a 1-based place (South's own finish) to its
// ordinal word for gameEndLines' "Game over: X place" line -- also
// used by overScreen.ts's rank badge (specs/screens/over.md), so the
// wording matches between the log and the Game Over screen itself.
export const PLACE_ORDINALS = ["First", "Second", "Third", "Fourth"];

// BOT_SKILL_REVEAL_SEATS is the seat order gameEndLines reveals bot
// skill levels in: East, then clockwise (seat.ts), skipping South.
const BOT_SKILL_REVEAL_SEATS = [3, 1, 2];

// gameEndLines is written once the game is over. southPlace is South's
// 1-based finish (1 if they won outright; also 1 if they tied for the
// win, per specs/log.md's "placed as if only the player was
// eliminated" rule -- callers derive southPlace accordingly, so a tie
// never reaches here as place 1). botSkillLevelLabels names the three
// bot seats' skill levels (e.g. "Novice"), in the same West/North/East
// seat order gameStartLines used to take (specs/log.md), unannounced
// until now.
export function gameEndLines(southPlace: number, botSkillLevelLabels: readonly string[]): string[] {
  const lines: string[] = [];
  if (southPlace === 1) {
    lines.push("South wins the game");
  }
  lines.push(`Game over: ${PLACE_ORDINALS[southPlace - 1]} place`);
  for (const seat of BOT_SKILL_REVEAL_SEATS) {
    lines.push(`${seatName(seat)}'s skill level was ${botSkillLevelLabels[seat - 1]}`);
  }
  return lines;
}

function cardsNotation(cards: readonly Card[]): string {
  return cards.map(cardToString).join(" ");
}
