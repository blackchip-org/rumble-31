// Animates one card trading places with a pot card, per specs/gui.md's
// "Trading/Exchanging Cards" section.

import type { Card } from "../card/card.ts";
import { TRADE_ANIMATION_DURATION } from "../config.ts";
import { cardEl, setCardFace } from "./render.ts";

// slide animates el's transform from (fromX, fromY) to (toX, toY),
// each a translate() offset in pixels, over ms, and resolves once the
// animation finishes.
function slide(el: HTMLElement, fromX: number, fromY: number, toX: number, toY: number, ms: number): Promise<Animation> {
  return el.animate(
    [{ transform: `translate(${fromX}px, ${fromY}px)` }, { transform: `translate(${toX}px, ${toY}px)` }],
    { duration: ms, easing: "ease-in-out", fill: "forwards" },
  ).finished;
}

// animateCardTrade animates handSlotEl (the real element sitting in a
// hand at the traded index) swapping places with potSlotEl (the real
// element sitting in the pot at the traded index): cardToPot (handSlotEl's
// current card) slides to the pot, then cardToHand (potSlotEl's current
// card) slides back to the hand. conceal is true when the hand belongs
// to a bot, whose card is normally shown as a face-down back tile — it's
// exposed before sliding out regardless (harmless if it's already
// face-up, as South's own hand always is), and re-concealed once the
// returning card lands only when conceal is true. Resolves once both
// legs have finished and both real elements show their final content.
//
// takenIsSecret is true only for a first-turn exchange (Take Pot) by a
// concealed (bot) hand: unlike every other trade/exchange, cardToHand
// comes from the still-private pot (specs/rules.md) and must never be
// shown, not even mid-flight — the return leg's ghost stays a
// face-down back tile for its whole journey instead of briefly
// exposing cardToHand before landing concealed.
//
// Neither real element is moved or reparented: a single "ghost" clone,
// position: fixed and appended straight to document.body, plays both
// legs of the journey. This sidesteps z-index/stacking concerns between
// the hand and pot panels (separate DOM subtrees, one of them under an
// ancestor with overflow: hidden) that would make animating the real,
// in-flow elements fragile.
//
// onSlideStart, if given, is called once per leg, right as that leg's
// slide begins (specs/assets.md's slide.wav) -- the caller owns
// whether/how to play a sound for it, since settings.soundsEnabled
// lives in main.ts, not here.
export async function animateCardTrade(handSlotEl: HTMLElement, potSlotEl: HTMLElement, cardToPot: Card, cardToHand: Card, conceal: boolean, takenIsSecret = false, onSlideStart?: () => void): Promise<void> {
  const legMs = TRADE_ANIMATION_DURATION / 2;

  const handRect = handSlotEl.getBoundingClientRect();
  const potRect = potSlotEl.getBoundingClientRect();
  const dx = potRect.left - handRect.left;
  const dy = potRect.top - handRect.top;

  // "exposed if necessary": the ghost is built already showing
  // cardToPot's real face, and appears in the exact spot handSlotEl is
  // hidden from, in the same tick — an instant flip to face-up, before
  // the slide begins.
  const ghost = cardEl(cardToPot);
  ghost.classList.add("card--ghost");
  ghost.style.left = `${handRect.left}px`;
  ghost.style.top = `${handRect.top}px`;
  document.body.appendChild(ghost);
  handSlotEl.style.visibility = "hidden";

  onSlideStart?.();
  await slide(ghost, 0, 0, dx, dy, legMs);

  // Midpoint handoff, done synchronously so there's no visible frame in
  // between: the ghost is sitting exactly on top of potSlotEl right
  // now, so editing potSlotEl's face underneath is invisible. potSlotEl
  // itself never moves — only the ghost travels on, for the return leg.
  setCardFace(potSlotEl, cardToPot);
  setCardFace(ghost, takenIsSecret ? null : cardToHand);

  onSlideStart?.();
  await slide(ghost, dx, dy, 0, 0, legMs);

  setCardFace(handSlotEl, conceal ? null : cardToHand);
  handSlotEl.style.visibility = "visible";
  ghost.remove();
}
