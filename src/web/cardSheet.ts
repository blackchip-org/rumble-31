import type { Card, Rank, Suit } from "../card/card.ts";

// assets/cards.md describes the tile sheet's layout: an 11x13 grid of
// 120x169px tiles. Row 1 holds special tiles (unused here); every
// other row is one suit's A,2..9,T,J,Q,K across all 13 columns.
export const TILE_W = 120;
export const TILE_H = 169;
export const SHEET_COLS = 13;
export const SHEET_ROWS = 11;

// assets/cards-highlight.png (see specs/assets.md) mirrors cards.png's
// geometry exactly -- same row/column layout and same tile size -- so
// SUIT_ROWS/RANK_COL and every constant above apply to both sheets
// unchanged.

// SUIT_COLORS/SuitColor are the Settings Screen's "Suit Color" option
// (specs/screens/settings.md), each selecting one row set from
// SUIT_ROWS below.
export const SUIT_COLORS = ["four", "two"] as const;
export type SuitColor = (typeof SUIT_COLORS)[number];

// SUIT_ROWS maps each SuitColor to the tile sheet's own rows for that
// deck (assets/cards.md): "four" picks the 4-color deck's rows (2, 3,
// 6, 7) -- spades black, hearts red, diamonds blue, clubs green;
// "two" picks the 2-color deck's rows (2, 3, 4, 5) -- spades black,
// hearts red, diamonds red, clubs black.
const SUIT_ROWS: Record<SuitColor, Record<Suit, number>> = {
  four: { s: 2, h: 3, d: 6, c: 7 },
  two: { s: 2, h: 3, d: 4, c: 5 },
};

// currentSuitColor is set once per game start (setSuitColor, called
// alongside initCardSheetVars) rather than threaded as a parameter
// through every render.ts call site.
let currentSuitColor: SuitColor = "four";

// setSuitColor selects which SUIT_ROWS row set tilePosition uses.
export function setSuitColor(suitColor: SuitColor): void {
  currentSuitColor = suitColor;
}

// RANK_COL maps this 32-card deck's ranks (7 8 9 T J Q K A, per
// card.ts's RANKS) to their 1-based column. The sheet orders every row
// A 2 3 4 5 6 7 8 9 T J Q K, so Ace is column 1 and 2-6 aren't used.
const RANK_COL: Record<Rank, number> = {
  A: 1,
  "7": 7,
  "8": 8,
  "9": 9,
  T: 10,
  J: 11,
  Q: 12,
  K: 13,
};

// TilePosition is a card's 1-based (row, col) location in the sheet.
export interface TilePosition {
  row: number;
  col: number;
}

export function tilePosition(c: Card): TilePosition {
  return { row: SUIT_ROWS[currentSuitColor][c.suit], col: RANK_COL[c.rank] };
}

// BACK_TILE is the sheet's light-red card back (row 1, column 8 per
// assets/cards.md), used wherever a card's identity must stay private.
export const BACK_TILE: TilePosition = { row: 1, col: 8 };

// HIGHLIGHT_BACK_TILE is the sheet's light-yellow card back (row 1,
// column 10 per assets/cards.md), used to highlight the round's still-
// private first-turn pot as a group (specs/screens/game.md) in place
// of the highlighted card art used for visible cards.
export const HIGHLIGHT_BACK_TILE: TilePosition = { row: 1, col: 10 };
