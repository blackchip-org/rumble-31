import type { Card, Rank, Suit } from "../card/card.ts";
import cardsUrl from "../../assets/cards.png";
import { SHEET_COLS, SHEET_ROWS, TILE_H, TILE_W, tilePosition } from "./cardSheet.ts";

// DISPLAY_W/H is the on-screen size of one card, scaled down from the
// sheet's native 147x169 tile while keeping its aspect ratio.
const DISPLAY_W = 64;
const DISPLAY_H = (TILE_H / TILE_W) * DISPLAY_W;

const RANK_NAME: Record<Rank, string> = { A: "Ace", "7": "7", "8": "8", "9": "9", T: "10", J: "Jack", Q: "Queen", K: "King" };
const SUIT_NAME: Record<Suit, string> = { s: "Spades", h: "Hearts", d: "Diamonds", c: "Clubs" };

export function cardEl(c: Card): HTMLElement {
  const { row, col } = tilePosition(c);

  const el = document.createElement("div");
  el.className = "card";
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", `${RANK_NAME[c.rank]} of ${SUIT_NAME[c.suit]}`);
  el.style.width = `${DISPLAY_W}px`;
  el.style.height = `${DISPLAY_H}px`;
  el.style.backgroundImage = `url(${cardsUrl})`;
  el.style.backgroundSize = `${SHEET_COLS * DISPLAY_W}px ${SHEET_ROWS * DISPLAY_H}px`;
  el.style.backgroundPosition = `${-(col - 1) * DISPLAY_W}px ${-(row - 1) * DISPLAY_H}px`;
  return el;
}

// renderCards replaces container's children with one element per card,
// in order.
export function renderCards(container: HTMLElement, cards: readonly Card[]): void {
  container.replaceChildren(...cards.map(cardEl));
}

// appendLogLine appends one line of text to container (the running game
// log) and scrolls it into view.
export function appendLogLine(container: HTMLElement, text: string): void {
  const p = document.createElement("p");
  p.textContent = text;
  container.appendChild(p);
  container.scrollTop = container.scrollHeight;
}
