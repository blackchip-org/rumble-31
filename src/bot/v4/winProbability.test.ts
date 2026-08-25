import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCard } from "../../card/card.ts";
import type { Hand, PlayerView, Pot } from "../../game/types.ts";
import { newOpponentTracker } from "./opponentTracking.ts";
import { estimateWinProbability } from "./winProbability.ts";

function mustHand(...notation: [string, string, string]): Hand {
  return [parseCard(notation[0]), parseCard(notation[1]), parseCard(notation[2])];
}
function mustPot(...notation: [string, string, string]): Pot {
  return mustHand(...notation);
}

function baseView(overrides: Partial<PlayerView>): PlayerView {
  return {
    hand: mustHand("7c", "8d", "9s"),
    pot: mustPot("Kc", "Qd", "Js"),
    seat: 0,
    opponentCount: 1,
    isFirstTurnOfRound: false,
    lap: 1,
    isLastTurn: false,
    ...overrides,
  };
}

// weakOpponent's best achievable score against weakPot is 17 (verified
// by hand: trading 8d for 8s or 9s for 9c both make a two-card same-
// suit flush of 17; every other trade, the keep, and the exchange all
// score lower) -- see opponentTracking's known-cards contract, this is
// a fully-known (3-card) opponent, so estimateWinProbability's
// single-opponent case needs no enumeration at all: exactly beaten or
// not.
const weakOpponent: [string, string, string] = ["7c", "8d", "9s"];
const weakPot: [string, string, string] = ["7d", "8s", "9c"];

// strongOpponent already scores 30 on its own (three hearts) -- beating
// it is impossible regardless of the pot.
const strongOpponent: [string, string, string] = ["Kh", "Qh", "Jh"];

test("estimateWinProbability: a single fully-known opponent whose ceiling is beaten -> probability 1", () => {
  const tracker = newOpponentTracker();
  tracker.set(1, mustHand(...weakOpponent));
  const v = baseView({ pot: mustPot(...weakPot) });
  assert.equal(estimateWinProbability(v, 20, tracker), 1);
});

test("estimateWinProbability: a single fully-known opponent whose ceiling is not beaten -> probability 0", () => {
  const tracker = newOpponentTracker();
  tracker.set(1, mustHand(...weakOpponent));
  const v = baseView({ pot: mustPot(...weakPot) });
  assert.equal(estimateWinProbability(v, 10, tracker), 0);
});

test("estimateWinProbability: a tie doesn't count as beaten", () => {
  const tracker = newOpponentTracker();
  tracker.set(1, mustHand(...weakOpponent));
  const v = baseView({ pot: mustPot(...weakPot) });
  assert.equal(estimateWinProbability(v, 17, tracker), 0);
});

test("estimateWinProbability: avoiding a strike only needs beating one opponent, not all of them", () => {
  const tracker = newOpponentTracker();
  tracker.set(1, mustHand(...weakOpponent)); // ceiling 17, beaten at 25
  tracker.set(2, mustHand(...strongOpponent)); // already 30, never beaten
  const v = baseView({ pot: mustPot(...weakPot), opponentCount: 2 });
  assert.equal(estimateWinProbability(v, 25, tracker), 1);
});

test("estimateWinProbability: beating neither opponent -> probability 0", () => {
  const tracker = newOpponentTracker();
  tracker.set(1, mustHand(...weakOpponent));
  tracker.set(2, mustHand(...strongOpponent));
  const v = baseView({ pot: mustPot(...weakPot), opponentCount: 2 });
  assert.equal(estimateWinProbability(v, 10, tracker), 0);
});

test("estimateWinProbability: an opponent not yet observed acting this round is treated as fully unknown", () => {
  // My hand and pot between them hold all 4 aces, so the single
  // untracked opponent (opponentCount 1, no tracker entries) can't
  // possibly hold one -- three-of-a-kind aces (32) is the only way to
  // reach 32, so their best response is provably always < 32.
  const v = baseView({ hand: mustHand("Ah", "Ad", "7c"), pot: mustPot("Ac", "As", "8d") });
  assert.equal(estimateWinProbability(v, 32, newOpponentTracker()), 1);
});

test("estimateWinProbability: a tracker entry for the bot's own seat is ignored, not mistaken for an opponent", () => {
  const tracker = newOpponentTracker();
  tracker.set(0, mustHand("7h", "8h", "9h")); // v.seat is 0 -- this is the bot's own hand, not an opponent's
  const v = baseView({ hand: mustHand("Ah", "Ad", "7c"), pot: mustPot("Ac", "As", "8d"), seat: 0 });
  assert.equal(estimateWinProbability(v, 32, tracker), 1);
});
