// Opponent Tracking for the v4 Expert bot, per specs/bots_v4.md's
// "Opponent Tracking" section: an exact (not probabilistic) per-seat
// record of which of an opponent's three hand cards are currently
// known, built entirely from PublicTurn -- the engine already redacts
// each turn down to exactly the cards that publicly moved (including
// the round's first turn's Take Pot, whose drawn cards never appear
// in taken since the pot was still private -- see round.ts's
// toPublicTurn), so no additional bookkeeping is needed here to get
// that special case right.

import type { Card } from "../../card/card.ts";
import { cardToString } from "../../card/card.ts";
import type { PublicTurn } from "../../game/types.ts";

// OpponentTracker maps seat -> that seat's currently-known hand cards
// (0 to 3). A seat with no entry is fully unknown -- see
// winProbability.ts, which also treats a seat never yet observed
// (opponentCount says it exists, but it hasn't acted yet this round)
// the same way, without needing an entry here at all.
export type OpponentTracker = Map<number, Card[]>;

export function newOpponentTracker(): OpponentTracker {
  return new Map();
}

// observeOpponentTurn updates tracker from one turn's PublicTurn,
// regardless of whose turn it was -- callers exclude their own seat at
// read time (winProbability.ts), not here, since a Strategy only
// learns its own seat from PlayerView, which observe() doesn't carry.
export function observeOpponentTurn(tracker: OpponentTracker, turn: PublicTurn): void {
  if (turn.given.length === 0) {
    return; // knock (or the round's first turn's Keep): nothing moved
  }
  if (turn.given.length === 3) {
    // Exchange: every card now in the hand is exactly `taken` -- for a
    // mid-round exchange that's the pot's public contents; for the
    // round's first turn's Take Pot it's an empty array (the pot was
    // still private), correctly resetting this seat to fully unknown.
    tracker.set(turn.seat, [...turn.taken]);
    return;
  }
  // Trade: one card given, one taken. If the given card matches one of
  // this seat's currently-known cards, that slot is now the taken
  // card. Otherwise the given card must have come from an unknown slot
  // (a known card can't be given away without being recognized), so
  // the known count grows by one.
  const known = tracker.get(turn.seat) ?? [];
  const given = turn.given[0] as Card;
  const taken = turn.taken[0] as Card;
  const idx = known.findIndex((c) => cardToString(c) === cardToString(given));
  const next = idx >= 0 ? known.filter((_, i) => i !== idx) : [...known];
  next.push(taken);
  tracker.set(turn.seat, next);
}
