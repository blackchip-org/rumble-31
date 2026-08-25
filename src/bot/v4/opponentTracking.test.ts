import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCard } from "../../card/card.ts";
import type { PublicTurn } from "../../game/types.ts";
import { newOpponentTracker, observeOpponentTurn } from "./opponentTracking.ts";

function names(cards: readonly { rank: string; suit: string }[]): string[] {
  return cards.map((c) => `${c.rank}${c.suit}`);
}

test("observeOpponentTurn: a trade from an unknown slot grows the known count", () => {
  const tracker = newOpponentTracker();
  const turn: PublicTurn = { seat: 1, type: "trade", given: [parseCard("7h")], taken: [parseCard("8d")] };
  observeOpponentTurn(tracker, turn);
  assert.deepEqual(names(tracker.get(1) ?? []), ["8d"]);
});

test("observeOpponentTurn: a trade whose given card matches a known card replaces it, count unchanged", () => {
  const tracker = newOpponentTracker();
  tracker.set(1, [parseCard("7h"), parseCard("9c")]);
  const turn: PublicTurn = { seat: 1, type: "trade", given: [parseCard("7h")], taken: [parseCard("8d")] };
  observeOpponentTurn(tracker, turn);
  assert.deepEqual(names(tracker.get(1) ?? []).sort(), ["8d", "9c"]);
});

test("observeOpponentTurn: a trade whose given card doesn't match any known card adds a new known card", () => {
  const tracker = newOpponentTracker();
  tracker.set(1, [parseCard("9c")]);
  const turn: PublicTurn = { seat: 1, type: "trade", given: [parseCard("7h")], taken: [parseCard("8d")] };
  observeOpponentTurn(tracker, turn);
  assert.deepEqual(names(tracker.get(1) ?? []).sort(), ["8d", "9c"]);
});

test("observeOpponentTurn: a mid-round exchange reveals all three cards (the pot's contents)", () => {
  const tracker = newOpponentTracker();
  const turn: PublicTurn = { seat: 2, type: "exchange", given: [parseCard("7h"), parseCard("8h"), parseCard("9h")], taken: [parseCard("Tc"), parseCard("Jd"), parseCard("Qs")] };
  observeOpponentTurn(tracker, turn);
  assert.deepEqual(names(tracker.get(2) ?? []).sort(), ["Jd", "Qs", "Tc"]);
});

test("observeOpponentTurn: the round's first turn's Take Pot reveals nothing -- taken is redacted to empty", () => {
  const tracker = newOpponentTracker();
  // toPublicTurn (round.ts) redacts turnIndex 0's exchange this way --
  // the drawn pot was still private, so only the given-up hand (now
  // the round's new public pot) is safe to report.
  const turn: PublicTurn = { seat: 0, type: "exchange", given: [parseCard("7h"), parseCard("8h"), parseCard("9h")], taken: [] };
  observeOpponentTurn(tracker, turn);
  assert.deepEqual(tracker.get(0), []);
});

test("observeOpponentTurn: a knock (or the round's first turn's Keep) reveals nothing", () => {
  const tracker = newOpponentTracker();
  tracker.set(1, [parseCard("9c")]);
  const turn: PublicTurn = { seat: 1, type: "knock", given: [], taken: [] };
  observeOpponentTurn(tracker, turn);
  assert.deepEqual(names(tracker.get(1) ?? []), ["9c"]);
});
