// Controller/keyboard focus navigation, per specs/controller.md:
// tracks which element a NavAction (gamepadInput.ts/keyboardNav.ts)
// currently targets, moves that focus around, and activates/cancels
// it -- Phase 1 covers every static button/select on the menu screens
// and the game screen's Menu/Take Pot/Knock buttons; in-game hand/pot
// card trading is not yet navigable this way (specs/controller.md).
//
// Focus here is app-managed state (an "is-focused" class on an
// element), not real DOM focus (document.activeElement/.focus()) --
// most of what's navigated (plain <div class="card"> tiles, in a
// later phase) isn't natively focusable at all, so both input sources
// are kept consistent by never relying on native focus for either.

import type { NavAction } from "./gamepadInput.ts";

// SCREEN_IDS mirrors main.ts's hideAllScreens() -- the set of
// top-level screens a focus scope can be computed from. Re-queried by
// id (rather than importing main.ts's private element consts) so this
// module stays a self-contained, DOM-id-based dependency of main.ts,
// not the other way around.
const SCREEN_IDS = ["main-screen", "game-screen", "menu-screen", "about-screen", "licenses-screen", "htp-screen", "settings-screen", "game-over-screen", "error-screen"];

// DIALOG_IDS are the app's native <dialog> elements. An open dialog is
// its own focus scope -- the screen behind it is already inert to
// mouse/keyboard (a modal dialog), so it must be inert to controller
// navigation too.
const DIALOG_IDS = ["abandon-dialog", "install-dialog"];

const FOCUSED_CLASS = "is-focused";

let focusedEl: HTMLElement | null = null;
let cancelFallback: () => void = () => {};

// registerCancelFallback sets what a "cancel" action does when no
// dialog is open to close -- main.ts registers a callback mirroring
// its own screen-specific cancel behavior (opening the Game Menu
// while the Game screen is visible), so focusNav.ts doesn't need to
// know about game-specific screen logic itself.
export function registerCancelFallback(fn: () => void): void {
  cancelFallback = fn;
}

// computeFocusables returns the currently navigable elements, in DOM
// order: an open dialog's own buttons if one is open, otherwise every
// enabled button/select within whichever top-level screen is visible.
function computeFocusables(): HTMLElement[] {
  for (const id of DIALOG_IDS) {
    const dialog = document.getElementById(id) as HTMLDialogElement | null;
    if (dialog?.open) {
      return Array.from(dialog.querySelectorAll<HTMLElement>("button:not(:disabled)"));
    }
  }

  for (const id of SCREEN_IDS) {
    const screen = document.getElementById(id);
    if (screen && !(screen as HTMLElement).hidden) {
      return Array.from(screen.querySelectorAll<HTMLElement>("button:not(:disabled), select"));
    }
  }

  return [];
}

// moveIndex is the pure index arithmetic behind moveFocus: given the
// currently focused index and the list length, which index a
// direction moves to. Phase 1's focusable lists are all single-column
// (button stacks/grids), so up/left and down/right are equivalent;
// a later phase's 2D card grid would need a direction-aware layout
// instead. Wraps at both ends.
export function moveIndex(current: number, count: number, dir: NavAction): number {
  if (count === 0) {
    return 0;
  }
  const delta = dir === "up" || dir === "left" ? -1 : 1;
  return (current + delta + count) % count;
}

function currentIndexIn(list: readonly HTMLElement[]): number {
  if (focusedEl) {
    const i = list.indexOf(focusedEl);
    if (i !== -1) {
      return i;
    }
  }
  return 0;
}

function focusOn(list: readonly HTMLElement[], index: number): void {
  for (const el of document.querySelectorAll<HTMLElement>(`.${FOCUSED_CLASS}`)) {
    el.classList.remove(FOCUSED_CLASS);
  }
  const el = list[index];
  if (!el) {
    focusedEl = null;
    return;
  }
  el.classList.add(FOCUSED_CLASS);
  focusedEl = el;
}

// moveFocus recomputes the focusable list fresh (the DOM changes
// outside of nav input too -- bot turns rendering, screen
// transitions) and moves focus one step in dir, wrapping at either
// end.
function moveFocus(dir: "up" | "down" | "left" | "right"): void {
  const list = computeFocusables();
  if (list.length === 0) {
    focusedEl = null;
    return;
  }
  const current = currentIndexIn(list);
  focusOn(list, moveIndex(current, list.length, dir));
}

// activate clicks the currently focused element, reusing whichever
// click listener is already wired to it -- no gamepad/keyboard-specific
// action logic needed per element.
function activate(): void {
  const list = computeFocusables();
  if (list.length === 0) {
    return;
  }
  const idx = currentIndexIn(list);
  focusOn(list, idx);
  list[idx]?.click();
}

// cancel closes whichever dialog is open, if any -- a gamepad/keyboard
// "cancel" doesn't trigger a <dialog>'s native Escape-cancel behavior
// the way a real Escape keypress does, so this calls .close() directly
// -- otherwise falls back to registerCancelFallback's callback.
function cancel(): void {
  for (const id of DIALOG_IDS) {
    const dialog = document.getElementById(id) as HTMLDialogElement | null;
    if (dialog?.open) {
      dialog.close();
      return;
    }
  }
  cancelFallback();
}

// handleAction is the single entry point gamepadInput.ts/keyboardNav.ts
// both report NavActions to.
export function handleAction(action: NavAction): void {
  switch (action) {
    case "up":
    case "down":
    case "left":
    case "right":
      moveFocus(action);
      break;
    case "confirm":
      activate();
      break;
    case "cancel":
      cancel();
      break;
  }
}
