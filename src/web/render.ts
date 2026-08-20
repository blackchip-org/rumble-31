import type { Card, Rank, Suit } from "../card/card.ts";
import cardsHighlightUrl from "../../assets/images/cards-highlight.png";
import cardsUrl from "../../assets/images/cards.png";
import { STRIKE_HIGHLIGHT_BLINK_INTERVAL } from "../config.ts";
import { BACK_TILE, SHEET_COLS, SHEET_ROWS, TILE_H, TILE_W, tilePosition, type TilePosition } from "./cardSheet.ts";

const RANK_NAME: Record<Rank, string> = { A: "Ace", "7": "7", "8": "8", "9": "9", T: "10", J: "Jack", Q: "Queen", K: "King" };
const SUIT_NAME: Record<Suit, string> = { s: "Spades", h: "Hearts", d: "Diamonds", c: "Clubs" };

// initCardSheetVars publishes the sheet's own geometry as CSS custom
// properties, so style.css can size and position cards (clamped to
// this native tile resolution, never upscaled past it) without
// duplicating these numbers. Call once at startup. If the sheet is
// ever regenerated at a different tile size, only cardSheet.ts's
// constants need to change.
export function initCardSheetVars(): void {
  const root = document.documentElement.style;
  root.setProperty("--tile-w", `${TILE_W}px`);
  root.setProperty("--tile-h", `${TILE_H}px`);
  root.setProperty("--sheet-cols", `${SHEET_COLS}`);
  root.setProperty("--sheet-rows", `${SHEET_ROWS}`);
  // Precomputed as a unitless ratio rather than left as --tile-h /
  // --tile-w in CSS: calc() dividing one length by another is
  // inconsistently supported (Firefox rejects it as invalid, silently
  // dropping the height/background-position rules that depend on it —
  // Chromium accepts it). Multiplying by a plain number sidesteps that
  // entirely.
  root.setProperty("--tile-aspect", `${TILE_H / TILE_W}`);
}

// initStrikeBlinkVar publishes STRIKE_HIGHLIGHT_BLINK_INTERVAL as a CSS
// custom property, so style.css's blink animation duration stays in
// sync with the configurable constant. Call once at startup.
export function initStrikeBlinkVar(): void {
  document.documentElement.style.setProperty("--strike-blink-interval", `${STRIKE_HIGHLIGHT_BLINK_INTERVAL}ms`);
}

// preloadCardHighlightSheet fetches cards-highlight.png ahead of time.
// It's only referenced from style.css's .is-selected rule, so without
// this the browser wouldn't fetch it until the player selects their
// first card, showing a brief flash where the ring appears before the
// highlighted tile art does. Call once at startup.
export function preloadCardHighlightSheet(): void {
  new Image().src = cardsHighlightUrl;
}

// tileEl builds one card-sized div showing the sheet's tile at
// position, labelled ariaLabel for accessibility. Its size and
// background position come from the .card CSS rule (which reads the
// --tile-row/--tile-col set here), not inline styles, so it responds
// to viewport size instead of a fixed pixel size baked in once.
function tileEl(position: TilePosition, ariaLabel: string): HTMLElement {
  const el = document.createElement("div");
  el.className = "card";
  // Set via a custom property rather than background-image directly, so
  // style.css's .is-selected rule (an ordinary stylesheet rule) can
  // override it with cards-highlight.png -- an inline background-image
  // here would always win over any stylesheet rule, selected or not.
  el.style.setProperty("--card-img", `url(${cardsUrl})`);
  setTile(el, position, ariaLabel);
  return el;
}

// setTile updates an existing card-sized element to show the sheet's
// tile at position, labelled ariaLabel.
function setTile(el: HTMLElement, position: TilePosition, ariaLabel: string): void {
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", ariaLabel);
  el.style.setProperty("--tile-row", `${position.row}`);
  el.style.setProperty("--tile-col", `${position.col}`);
}

// setCardFace updates an existing card-sized element (built by cardEl
// or backEl) to show card's real face, or a face-down back tile if
// card is null — e.g. to reveal or re-conceal a bot's card in place
// during a trade animation.
export function setCardFace(el: HTMLElement, card: Card | null): void {
  if (card === null) {
    setTile(el, BACK_TILE, "face-down card");
  } else {
    setTile(el, tilePosition(card), `${RANK_NAME[card.rank]} of ${SUIT_NAME[card.suit]}`);
  }
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

// logText reconstructs the game log as plain text, one line per entry
// appended by appendLogLine — including its blank lines, since a <br>'s
// textContent is itself "". For saving the log to a file.
export function logText(container: HTMLElement): string {
  return Array.from(container.children)
    .map((el) => el.textContent ?? "")
    .join("\n");
}

// appendLogLine appends one line of text to container (the running game
// log) and scrolls it into view. An empty line renders as a <br> — an
// empty <p> has no line box to give it height, so it wouldn't be
// visible as a blank line otherwise.
export function appendLogLine(container: HTMLElement, text: string): void {
  if (text === "") {
    container.appendChild(document.createElement("br"));
  } else {
    const p = document.createElement("p");
    p.textContent = text;
    container.appendChild(p);
  }
  container.scrollTop = container.scrollHeight;
}
