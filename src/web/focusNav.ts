// Controller/keyboard focus navigation, per specs/controller.md:
// tracks which element a NavAction (gamepadInput.ts/keyboardNav.ts)
// currently targets, moves that focus around, and activates/cancels
// it -- covers every static button/select on the menu screens, the
// game screen's Menu/Take Pot/Knock buttons, and (see
// buildGameScreenGrid below) the hand/pot cards while a trade is in
// progress.
//
// Focus here is app-managed state (an "is-focused" class on an
// element), not real DOM focus (document.activeElement/.focus()) --
// most of what's navigated (plain <div class="card"> tiles) isn't
// natively focusable at all, so both input sources are kept
// consistent by never relying on native focus for either.

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

// GAME_SCREEN_ID gets a dedicated row-based builder (buildGameScreenGrid)
// instead of the generic per-screen query, since it's the only screen
// with multi-item rows (hand/pot cards) rather than one button per row.
const GAME_SCREEN_ID = "game-screen";

// TRADEABLE_CLASS is added by domActionPrompt.ts to #hand/#pot exactly
// while their cards have click listeners attached (i.e. not the
// round's first turn) -- the signal buildGameScreenGrid uses to decide
// whether card rows belong in the grid, without importing
// domActionPrompt.ts itself.
const TRADEABLE_CLASS = "is-tradeable";

const FOCUSED_CLASS = "is-focused";

// FocusGrid is the navigable layout of the current scope: a list of
// rows, each a list of elements. left/right move within a row,
// up/down move between rows (see moveGridPosition). Every scope other
// than the game screen is one element per row -- a plain vertical
// list, matching a stack of buttons -- so this generalizes Phase 1's
// flat-list model without changing its behavior.
type FocusGrid = readonly (readonly HTMLElement[])[];

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

// buildGameScreenGrid lays out the game screen's rows top-to-bottom,
// matching their on-screen order (specs/screens/game.md): the Menu
// button, the pot's cards, the Take Pot/Knock buttons, then the
// hand's cards. Card rows are included only while TRADEABLE_CLASS
// marks them as currently clickable (domActionPrompt.ts adds it
// outside the round's first turn, and while a decide() is actually in
// progress) -- on the first turn, or on any other seat's turn, they're
// dropped, leaving just the always-present Menu (and Take Pot/Knock,
// once enabled). Empty rows are dropped entirely.
function buildGameScreenGrid(screen: HTMLElement): FocusGrid {
  const rows: HTMLElement[][] = [];

  const menuBtn = screen.querySelector<HTMLElement>("#menu-btn");
  if (menuBtn) {
    rows.push([menuBtn]);
  }

  const pot = screen.querySelector<HTMLElement>("#pot");
  const hand = screen.querySelector<HTMLElement>("#hand");
  const tradeable = hand?.classList.contains(TRADEABLE_CLASS) ?? false;

  if (tradeable && pot) {
    rows.push(Array.from(pot.querySelectorAll<HTMLElement>(".card")));
  }

  const takePotBtn = screen.querySelector<HTMLButtonElement>("#take-pot-btn");
  const knockBtn = screen.querySelector<HTMLButtonElement>("#knock-btn");
  const turnButtons = [takePotBtn, knockBtn].filter((b): b is HTMLButtonElement => !!b && !b.disabled);
  if (turnButtons.length > 0) {
    rows.push(turnButtons);
  }

  if (tradeable && hand) {
    rows.push(Array.from(hand.querySelectorAll<HTMLElement>(".card")));
  }

  return rows.filter((row) => row.length > 0);
}

// computeGrid returns the currently navigable layout: an open
// dialog's own buttons (one per row) if one is open, otherwise
// whichever top-level screen is visible -- the game screen via
// buildGameScreenGrid's rows, every other screen as one enabled
// button/select per row (a plain vertical list).
function computeGrid(): FocusGrid {
  for (const id of DIALOG_IDS) {
    const dialog = document.getElementById(id) as HTMLDialogElement | null;
    if (dialog?.open) {
      return Array.from(dialog.querySelectorAll<HTMLElement>("button:not(:disabled)")).map((el) => [el]);
    }
  }

  for (const id of SCREEN_IDS) {
    const screen = document.getElementById(id);
    if (screen && !(screen as HTMLElement).hidden) {
      if (id === GAME_SCREEN_ID) {
        return buildGameScreenGrid(screen);
      }
      return Array.from(screen.querySelectorAll<HTMLElement>("button:not(:disabled), select")).map((el) => [el]);
    }
  }

  return [];
}

// moveGridPosition is the pure position arithmetic behind moveFocus:
// given the currently focused [row, col] and each row's length,
// which [row, col] a direction moves to. left/right wrap within the
// current row -- unless it's a single-column row (Phase 1's plain
// button stacks), where there's no sibling to move to, so left/right
// fall through to the same previous/next-row movement as up/down
// (preserving Phase 1's behavior, where every direction moved through
// the list). up/down move to the previous/next row (wrapping past
// either end), clamping the column to the new row's last index if
// it's shorter.
export function moveGridPosition(row: number, col: number, rowLengths: readonly number[], dir: NavAction): [number, number] {
  if (rowLengths.length === 0) {
    return [0, 0];
  }

  const len = rowLengths[row] ?? 1;
  if ((dir === "left" || dir === "right") && len > 1) {
    const delta = dir === "left" ? -1 : 1;
    return [row, (col + delta + len) % len];
  }

  const delta = dir === "up" || dir === "left" ? -1 : 1;
  const newRow = (row + delta + rowLengths.length) % rowLengths.length;
  const newLen = rowLengths[newRow] ?? 1;
  return [newRow, Math.min(col, newLen - 1)];
}

// currentPositionIn finds focusedEl's [row, col] within grid, falling
// back to [0, 0] if it's not there (the DOM changed outside of nav
// input too -- bot turns rendering, screen transitions, a completed
// trade re-rendering the hand/pot).
function currentPositionIn(grid: FocusGrid): [number, number] {
  if (focusedEl) {
    for (let row = 0; row < grid.length; row++) {
      const col = (grid[row] as readonly HTMLElement[]).indexOf(focusedEl);
      if (col !== -1) {
        return [row, col];
      }
    }
  }
  return [0, 0];
}

function focusOn(grid: FocusGrid, row: number, col: number): void {
  for (const el of document.querySelectorAll<HTMLElement>(`.${FOCUSED_CLASS}`)) {
    el.classList.remove(FOCUSED_CLASS);
  }
  const el = grid[row]?.[col];
  if (!el) {
    focusedEl = null;
    return;
  }
  el.classList.add(FOCUSED_CLASS);
  focusedEl = el;
}

// moveFocus recomputes the grid fresh (the DOM changes outside of nav
// input too -- bot turns rendering, screen transitions) and moves
// focus one step in dir.
function moveFocus(dir: "up" | "down" | "left" | "right"): void {
  const grid = computeGrid();
  if (grid.length === 0) {
    focusedEl = null;
    return;
  }
  const [row, col] = currentPositionIn(grid);
  const [newRow, newCol] = moveGridPosition(row, col, grid.map((r) => r.length), dir);
  focusOn(grid, newRow, newCol);
}

// activate clicks the currently focused element, reusing whichever
// click listener is already wired to it -- no gamepad/keyboard-specific
// action logic needed per element (including cards: activating one
// does exactly what clicking it does today, in domActionPrompt.ts).
function activate(): void {
  const grid = computeGrid();
  if (grid.length === 0) {
    return;
  }
  const [row, col] = currentPositionIn(grid);
  focusOn(grid, row, col);
  grid[row]?.[col]?.click();
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
