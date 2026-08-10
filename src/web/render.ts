import type { Card, Rank, Suit } from "../card/card.ts";
import cardsUrl from "../../assets/cards.png";
import { BACK_TILE, SHEET_COLS, SHEET_ROWS, TILE_H, TILE_W, tilePosition, type TilePosition } from "./cardSheet.ts";

// DISPLAY_W/H is the on-screen size of one card, scaled down from the
// sheet's native 147x169 tile while keeping its aspect ratio.
const DISPLAY_W = 64;
const DISPLAY_H = (TILE_H / TILE_W) * DISPLAY_W;

const RANK_NAME: Record<Rank, string> = { A: "Ace", "7": "7", "8": "8", "9": "9", T: "10", J: "Jack", Q: "Queen", K: "King" };
const SUIT_NAME: Record<Suit, string> = { s: "Spades", h: "Hearts", d: "Diamonds", c: "Clubs" };

// tileEl builds one card-sized div showing the sheet's tile at
// position, labelled ariaLabel for accessibility.
function tileEl(position: TilePosition, ariaLabel: string): HTMLElement {
  const { row, col } = position;

  const el = document.createElement("div");
  el.className = "card";
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", ariaLabel);
  el.style.width = `${DISPLAY_W}px`;
  el.style.height = `${DISPLAY_H}px`;
  el.style.backgroundImage = `url(${cardsUrl})`;
  el.style.backgroundSize = `${SHEET_COLS * DISPLAY_W}px ${SHEET_ROWS * DISPLAY_H}px`;
  el.style.backgroundPosition = `${-(col - 1) * DISPLAY_W}px ${-(row - 1) * DISPLAY_H}px`;
  return el;
}

export function cardEl(c: Card): HTMLElement {
  return tileEl(tilePosition(c), `${RANK_NAME[c.rank]} of ${SUIT_NAME[c.suit]}`);
}

// backEl builds a face-down card tile, for a hand whose cards must stay
// private.
export function backEl(): HTMLElement {
  return tileEl(BACK_TILE, "face-down card");
}

// renderCards replaces container's children with one element per card,
// in order.
export function renderCards(container: HTMLElement, cards: readonly Card[]): void {
  container.replaceChildren(...cards.map(cardEl));
}

// renderBacks replaces container's children with count face-down cards.
export function renderBacks(container: HTMLElement, count: number): void {
  container.replaceChildren(...Array.from({ length: count }, backEl));
}

// appendLogLine appends one line of text to container (the running game
// log) and scrolls it into view.
export function appendLogLine(container: HTMLElement, text: string): void {
  const p = document.createElement("p");
  p.textContent = text;
  container.appendChild(p);
  container.scrollTop = container.scrollHeight;
}
