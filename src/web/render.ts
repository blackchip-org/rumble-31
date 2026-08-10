import type { Card, Suit } from "../card/card.ts";

// suitGlyph and suitClass mirror card.ts's own console rendering
// (specs/cards.md), but as a Unicode glyph plus a CSS class instead of
// an ANSI escape.
const SUIT_GLYPH: Record<Suit, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };
const SUIT_CLASS: Record<Suit, string> = { s: "suit-black", h: "suit-red", d: "suit-green", c: "suit-blue" };

export function cardEl(c: Card): HTMLElement {
  const el = document.createElement("span");
  el.className = `card ${SUIT_CLASS[c.suit]}`;
  el.textContent = `${c.rank}${SUIT_GLYPH[c.suit]}`;
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
