import type { Card, Rank, Suit } from "../card/card.ts";

// assets/cards.md describes the tile sheet's layout: an 11x13 grid of
// 147x169px tiles. Row 1 holds special tiles (unused here); every
// other row is one suit's A,2..9,T,J,Q,K across all 13 columns.
export const TILE_W = 147;
export const TILE_H = 169;
export const SHEET_COLS = 13;
export const SHEET_ROWS = 11;

// SUIT_ROW picks the tile sheet's own "4-color deck" rows (2, 3, 6, 7):
// spades black, hearts red, diamonds blue, clubs green.
const SUIT_ROW: Record<Suit, number> = { s: 2, h: 3, d: 6, c: 7 };

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
  return { row: SUIT_ROW[c.suit], col: RANK_COL[c.rank] };
}
