import type { Card, Suit } from "./card.ts";
import { rankValue } from "./card.ts";

// sum returns the sum of the point values of the given cards.
export function sum(cards: readonly Card[]): number {
  return cards.reduce((total, c) => total + rankValue(c.rank), 0);
}

// sameSuit reports whether all of the given cards share the same suit.
// It returns false for zero or one card.
export function sameSuit(cards: readonly Card[]): boolean {
  if (cards.length < 2) {
    return false;
  }
  const first = cards[0] as Card;
  return cards.slice(1).every((c) => c.suit === first.suit);
}

// score computes the Rumble-31 score of a 3-card hand per specs/rules.md:
// if all three cards are aces the score is 32; if all three cards share a
// (non-ace) rank the score is 30.5; otherwise the score is the highest
// sum of point values among cards sharing a suit.
export function score(cards: readonly [Card, Card, Card]): number {
  const [a, b, c] = cards;
  if (a.rank === b.rank && b.rank === c.rank) {
    return a.rank === "A" ? 32 : 30.5;
  }

  const sums = new Map<Suit, number>();
  for (const card of cards) {
    sums.set(card.suit, (sums.get(card.suit) ?? 0) + rankValue(card.rank));
  }
  return Math.max(...sums.values());
}
