import type { Card } from "./card.ts";
import { RANKS, SUITS } from "./card.ts";
import type { Rng } from "../rng.ts";

// newDeck returns the 32-card Rumble-31 deck (ranks 7 through ace, all
// four suits) in a fixed, deterministic order.
export function newDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

// shuffleDeck randomizes the order of the deck in place using rng.
export function shuffleDeck(deck: Card[], rng: Rng): void {
  rng.shuffle(deck);
}
