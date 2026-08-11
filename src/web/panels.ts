// Panel-level DOM helpers for the four seat panels — score box, strike
// indicators, and turn/eliminated state — mirroring render.ts's plain,
// element-in/DOM-out style.

const STRIKE_COUNT = 3;

// renderStrikes fills el with STRIKE_COUNT indicators: the first
// `strikes` show as a red hit, the rest as a green ok, per gui.md's
// OOO/XOO/XXO/XXX table.
export function renderStrikes(el: HTMLElement, strikes: number): void {
  const spans = Array.from({ length: STRIKE_COUNT }, (_, i) => {
    const span = document.createElement("span");
    const hit = i < strikes;
    span.className = `strike ${hit ? "hit" : "ok"}`;
    span.textContent = hit ? "×" : "";
    return span;
  });
  el.replaceChildren(...spans);
}

// setScore shows value in el, or leaves it empty when value is null
// (the score is currently private).
export function setScore(el: HTMLElement, value: number | null): void {
  el.textContent = value === null ? "" : value.toFixed(1);
}

export type PanelState = "turn" | "eliminated" | "none";

// setWon toggles a seat panel's end-of-round win highlight. Independent
// of setPanelState since a win never coincides with turn/eliminated.
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

// setPanelState toggles a seat panel's turn/eliminated visuals and its
// state tag's text; only one state applies at a time.
export function setPanelState(panelEl: HTMLElement, state: PanelState): void {
  panelEl.classList.toggle("is-turn", state === "turn");
  panelEl.classList.toggle("is-eliminated", state === "eliminated");
  const tag = panelEl.querySelector<HTMLElement>(".state-tag");
  if (tag) {
    // A truly empty tag collapses to a shorter line box than one
    // holding text, even when hidden via CSS, which shifts panel
    // height as turns change (see the .state-tag comment in
    // style.css). A non-breaking space keeps the line box's height
    // constant whether or not the tag is visible; a plain space
    // wouldn't, since it whitespace-collapses away.
    tag.textContent = state === "none" ? " " : state;
  }
}
