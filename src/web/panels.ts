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

// setPanelState toggles a seat panel's turn/eliminated visuals and its
// state tag's text; only one state applies at a time.
export function setPanelState(panelEl: HTMLElement, state: PanelState): void {
  panelEl.classList.toggle("is-turn", state === "turn");
  panelEl.classList.toggle("is-eliminated", state === "eliminated");
  const tag = panelEl.querySelector<HTMLElement>(".state-tag");
  if (tag) {
    tag.textContent = state === "none" ? "" : state;
  }
}
