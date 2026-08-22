// Controller scrolling for the app's read-only text panels, per
// specs/controller.md: the left stick and L1/R1 bumpers (see
// gamepadInput.ts's ScrollEvent) scroll whichever screen's panel is
// currently visible, independent of focusNav.ts's button/select focus
// grid -- these panels (the game log, license/how-to-play text, the
// about screen's credits, the application info screen's instructions,
// the stats screen's stat panel, the error screen's stack trace) were
// never part of that grid, so there's no separate "focus the panel"
// step.

import type { ScrollEvent } from "./gamepadInput.ts";

// SCROLL_TARGETS maps each screen with a scrollable panel to that
// panel's element id. Screens not listed here (main, settings, menu,
// game-over) have nothing to scroll.
const SCROLL_TARGETS: Readonly<Record<string, string>> = {
  "game-screen": "log",
  "appinfo-screen": "appinfo-body",
  "licenses-screen": "licenses-text",
  "htp-screen": "htp-text",
  "about-screen": "about-body",
  "stats-screen": "stats-card",
  "error-screen": "error-stack",
};

// PAGE_SCROLL_FRACTION is how much of a panel's visible height a
// single L1/R1 bumper press scrolls -- just under a full page, so the
// last line before the jump stays on screen as a continuity anchor.
const PAGE_SCROLL_FRACTION = 0.9;

// clampScrollTop is the pure arithmetic behind scrollBy/pageScroll:
// given a panel's current scrollTop and dimensions, the scrollTop a
// signed pixel delta lands on, clamped to the panel's valid range.
export function clampScrollTop(current: number, delta: number, scrollHeight: number, clientHeight: number): number {
  const max = Math.max(0, scrollHeight - clientHeight);
  return Math.min(max, Math.max(0, current + delta));
}

// currentScrollTarget finds the scrollable panel belonging to
// whichever SCROLL_TARGETS screen is currently visible (not hidden),
// or null if the visible screen has no scrollable panel.
function currentScrollTarget(): HTMLElement | null {
  for (const screenId of Object.keys(SCROLL_TARGETS)) {
    const screen = document.getElementById(screenId);
    if (screen && !(screen as HTMLElement).hidden) {
      return document.getElementById(SCROLL_TARGETS[screenId] as string);
    }
  }
  return null;
}

function applyDelta(el: HTMLElement, delta: number): void {
  el.scrollTop = clampScrollTop(el.scrollTop, delta, el.scrollHeight, el.clientHeight);
}

// scrollBy applies a continuous, stick-driven scroll delta (in pixels)
// to the current screen's panel. A no-op if the current screen has no
// scrollable panel, or the delta is 0 (the stick is centered).
export function scrollBy(deltaY: number): void {
  if (deltaY === 0) {
    return;
  }
  const el = currentScrollTarget();
  if (el) {
    applyDelta(el, deltaY);
  }
}

// pageScroll applies a single L1/R1 bumper press's page up/down jump
// to the current screen's panel.
export function pageScroll(dir: "up" | "down"): void {
  const el = currentScrollTarget();
  if (!el) {
    return;
  }
  const delta = el.clientHeight * PAGE_SCROLL_FRACTION * (dir === "up" ? -1 : 1);
  applyDelta(el, delta);
}

// handleScrollEvent is the single entry point
// gamepadInput.ts's startGamepadInput reports ScrollEvents to.
export function handleScrollEvent(event: ScrollEvent): void {
  if (event.kind === "axis") {
    scrollBy(event.deltaY);
  } else {
    pageScroll(event.dir);
  }
}
