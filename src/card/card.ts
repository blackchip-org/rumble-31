// Card notation and construction for Rumble-31, per specs/cards.md and
// specs/rules.md.

export type Rank = "7" | "8" | "9" | "T" | "J" | "Q" | "K" | "A";
export type Suit = "c" | "d" | "h" | "s";

// RANKS and SUITS list the values used to build a deck, in a fixed order
// so newDeck() is deterministic.
export const RANKS: readonly Rank[] = ["7", "8", "9", "T", "J", "Q", "K", "A"];
export const SUITS: readonly Suit[] = ["c", "d", "h", "s"];

const RANK_SET: ReadonlySet<string> = new Set(RANKS);
const SUIT_SET: ReadonlySet<string> = new Set(SUITS);

export interface Card {
  rank: Rank;
  suit: Suit;
}

export function parseRank(ch: string): Rank {
  if (!RANK_SET.has(ch)) {
    throw new Error(`card: invalid rank ${JSON.stringify(ch)}`);
  }
  return ch as Rank;
}

export function parseSuit(ch: string): Suit {
  if (!SUIT_SET.has(ch)) {
    throw new Error(`card: invalid suit ${JSON.stringify(ch)}`);
  }
  return ch as Suit;
}

// parseCard parses a two-character card notation string, e.g. "7h".
export function parseCard(s: string): Card {
  if (s.length !== 2) {
    throw new Error(`card: invalid notation ${JSON.stringify(s)}`);
  }
  return { rank: parseRank(s[0] as string), suit: parseSuit(s[1] as string) };
}

// cardToString returns the two-character notation for the card, e.g. "7h".
export function cardToString(c: Card): string {
  return c.rank + c.suit;
}

// rankValue returns the point value of the rank per specs/rules.md:
// number cards are worth their pip value, face cards are worth 10, and
// aces are worth 11.
export function rankValue(r: Rank): number {
  switch (r) {
    case "T":
    case "J":
    case "Q":
    case "K":
      return 10;
    case "A":
      return 11;
    default:
      return r.charCodeAt(0) - "0".charCodeAt(0);
  }
}
