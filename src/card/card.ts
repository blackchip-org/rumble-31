// Card notation, construction, and console rendering for Rumble-31, per
// specs/cards.md and specs/rules.md.

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

// consoleSuits maps each suit to its dedicated Unicode glyph and ANSI
// foreground color code, per specs/cards.md.
const consoleSuits: Record<Suit, { glyph: string; fg: string }> = {
  s: { glyph: "♠", fg: "30" }, // black
  h: { glyph: "♥", fg: "31" }, // red
  d: { glyph: "♦", fg: "32" }, // dark green
  c: { glyph: "♣", fg: "34" }, // blue
};

// cardConsole renders a card for an interactive terminal: the suit as its
// dedicated Unicode glyph, on a white background colored per
// specs/cards.md (black/red/dark green/blue foreground for
// spades/hearts/diamonds/clubs), padded with one white-background space
// on the left and two on the right.
export function cardConsole(c: Card): string {
  const s = consoleSuits[c.suit];
  return `\x1b[47;${s.fg}m ${c.rank}${s.glyph}  \x1b[0m`;
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
