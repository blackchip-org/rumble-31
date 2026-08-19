// Panel-level DOM helpers for the four seat panels — score box, strike
// indicators, and turn/eliminated state — mirroring render.ts's plain,
// element-in/DOM-out style.

const STRIKE_COUNT = 3;

// renderStrikes fills el with STRIKE_COUNT indicators: the first
// `strikes` show as a red hit, the rest as a green ok, per gui.md's
// OOO/XOO/XXO/XXX table. hasSecondChance seats holding an unused
// second chance (specs/rules.md) at exactly 3 strikes show XX/
// instead of XXX, with the third indicator yellow — reverting to
// plain XXX once strikes reaches 4 (true elimination).
export function renderStrikes(el: HTMLElement, strikes: number, hasSecondChance: boolean): void {
  const spans = Array.from({ length: STRIKE_COUNT }, (_, i) => {
    const span = document.createElement("span");
    if (hasSecondChance && strikes === 3 && i === STRIKE_COUNT - 1) {
      span.className = "strike second-chance";
      span.textContent = "/";
      return span;
    }
    const hit = i < strikes;
    span.className = `strike ${hit ? "hit" : "ok"}`;
    span.textContent = hit ? "×" : "";
    return span;
  });
  el.replaceChildren(...spans);
}

// formatScore renders value with no decimal point: half-point scores
// (e.g. 30.5) use a vulgar fraction (30½), whole scores show as plain
// integers.
export function formatScore(value: number): string {
  const whole = Math.floor(value);
  return value - whole === 0.5 ? `${whole}½` : `${whole}`;
}

// setScore shows value in el, or leaves it empty when value is null
// (the score is currently private).
export function setScore(el: HTMLElement, value: number | null): void {
  el.textContent = value === null ? "" : formatScore(value);
}

// setDealer toggles a seat's dealer-button circle between empty
// (outline only) and filled with 'D', per gui.md.
export function setDealer(el: HTMLElement, isDealer: boolean): void {
  el.classList.toggle("is-dealer", isDealer);
  el.textContent = isDealer ? "D" : "";
}

export type PanelState = "turn" | "first" | "eliminated" | "knocked" | "strike" | "winner" | "none";

// STATE_TAG_TEXT maps each state to its tag's display text -- "none"
// to a lone non-breaking space (see the comment in setPanelState
// below).
const STATE_TAG_TEXT: Record<PanelState, string> = {
  turn: "turn",
  first: "first",
  eliminated: "eliminated",
  knocked: "knocked",
  strike: "strike",
  winner: "winner",
  none: " ",
};

// setWon toggles a seat panel's end-of-round win highlight. Independent
// of setPanelState (which callers pair this with, passing "winner", to
// also raise the matching state tag) since a win can coincide with
// strike/eliminated in the rare all-tied-scores case, where the tag
// mechanism's one-state-at-a-time rule still needs to pick a winner.
export function setWon(panelEl: HTMLElement, won: boolean): void {
  panelEl.classList.toggle("is-won", won);
}

// setStruck toggles a seat panel's end-of-round strike highlight.
// Independent of setPanelState since a struck seat may simultaneously
// be eliminated (its strike was the third) — see .is-struck.is-eliminated
// in style.css for that combined look.
export function setStruck(panelEl: HTMLElement, struck: boolean): void {
  panelEl.classList.toggle("is-struck", struck);
}

// setPanelState toggles a seat panel's turn/first/eliminated/knocked/
// strike/winner visuals and its state tag's text; only one state
// applies at a time. is-strike (this tag) is distinct from is-struck
// (setStruck's own, independent end-of-round border blink) — a struck
// seat gets both, including one granted a second chance (specs/
// rules.md), which is tagged "strike" same as a plain strike. Likewise
// is-winner (this tag) is distinct from is-won (setWon's own border/
// glow). "first" is a distinct look from "turn" (its own highlight
// color), used instead of "turn" for whichever seat is deciding the
// round's first turn.
export function setPanelState(panelEl: HTMLElement, state: PanelState): void {
  panelEl.classList.toggle("is-turn", state === "turn");
  panelEl.classList.toggle("is-first", state === "first");
  panelEl.classList.toggle("is-eliminated", state === "eliminated");
  panelEl.classList.toggle("is-knocked", state === "knocked");
  panelEl.classList.toggle("is-strike", state === "strike");
  panelEl.classList.toggle("is-winner", state === "winner");
  const tag = panelEl.querySelector<HTMLElement>(".state-tag");
  if (tag) {
    // A truly empty tag collapses to a shorter line box than one
    // holding text, even when hidden via CSS, which shifts panel
    // height as turns change (see the .state-tag comment in
    // style.css). A non-breaking space keeps the line box's height
    // constant whether or not the tag is visible; a plain space
    // wouldn't, since it whitespace-collapses away.
    tag.textContent = STATE_TAG_TEXT[state];
  }
}
