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

// LIST_ACTIVE_CLASS marks a <select> currently "activated" for D-pad
// item selection (see activateList/handleListAction below) -- added
// alongside FOCUSED_CLASS, which the select keeps the whole time it's
// activated, so CSS can style the two states differently.
const LIST_ACTIVE_CLASS = "is-list-active";

// FocusGrid is the navigable layout of the current scope: a list of
// rows, each a list of elements. left/right move within a row,
// up/down move between rows (see moveGridPosition). Every scope other
// than the game screen is one element per row -- a plain vertical
// list, matching a stack of buttons -- so this generalizes Phase 1's
// flat-list model without changing its behavior.
type FocusGrid = readonly (readonly HTMLElement[])[];

let focusedEl: HTMLElement | null = null;
let cancelFallback: () => void = () => {};

// activeListEl is the <select> currently activated for D-pad item
// selection, if any -- set by activate() when the focused element is
// a <select>, cleared by handleListAction on cancel. While set,
// handleAction routes every NavAction to handleListAction instead of
// the normal move/activate/cancel dispatch, so the D-pad steers the
// list's own items (and can't stray onto Main Menu or trigger the
// screen's cancel behavior) until the player explicitly backs out.
let activeListEl: HTMLSelectElement | null = null;

// navUsed marks whether the player has issued a real NavAction at
// least once this session -- set unconditionally at the top of
// handleAction and never reset. focusPotCenter/focusHandCenter below
// gate on it so a mouse-only player never sees an unrequested focus
// ring appear (specs/controller.md's "Selection Focus" section).
let navUsed = false;

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

// moveListIndex is the pure position arithmetic behind
// handleListAction: given a <select>'s current selectedIndex and
// option count, which index dir moves to. Clamps rather than wraps --
// unlike moveGridPosition's screen-level lists, a real listbox's own
// arrow keys don't wrap either, and a long license list wrapping
// around would be more surprising than helpful.
export function moveListIndex(index: number, length: number, dir: NavAction): number {
  if (length === 0) {
    return index;
  }
  const delta = dir === "up" || dir === "left" ? -1 : 1;
  return Math.min(length - 1, Math.max(0, index + delta));
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

// A focused button that becomes disabled (e.g. Take Pot/Knock once
// domActionPrompt.ts's finish() locks them in) must not go on showing
// a focus ring nothing can activate anymore. Rather than have every
// call site that disables a button remember to clear focus too, watch
// for it here: any element's "disabled" attribute flipping on clears
// focus if that element is the one currently focused. Guarded since
// this module is also imported directly by focusNav.test.ts under
// plain Node, where neither document nor MutationObserver exist.
if (typeof document !== "undefined" && typeof MutationObserver !== "undefined") {
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      const el = mutation.target as HTMLButtonElement;
      if (el === focusedEl && el.disabled) {
        el.classList.remove(FOCUSED_CLASS);
        focusedEl = null;
        return;
      }
    }
  }).observe(document.body, { attributes: true, attributeFilter: ["disabled"], subtree: true });
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
// A <select> is the one exception: clicking it doesn't let the D-pad
// change its selected item, so this activates list mode instead (see
// activeListEl above).
function activate(): void {
  const grid = computeGrid();
  if (grid.length === 0) {
    return;
  }
  const [row, col] = currentPositionIn(grid);
  focusOn(grid, row, col);
  const el = grid[row]?.[col];
  if (el instanceof HTMLSelectElement) {
    activeListEl = el;
    el.classList.add(LIST_ACTIVE_CLASS);
    return;
  }
  el?.click();
}

// handleListAction is handleAction's dispatch while activeListEl is
// set: up/down/left/right move the selection via moveListIndex,
// dispatching a "change" event so main.ts's existing listener updates
// the license text exactly as a mouse click on an option would.
// cancel deactivates the list, returning the D-pad to normal screen
// navigation; confirm is a no-op, since the selection already took
// effect the moment it moved.
function handleListAction(action: NavAction): void {
  const el = activeListEl;
  if (!el) {
    return;
  }
  if (action === "cancel") {
    el.classList.remove(LIST_ACTIVE_CLASS);
    activeListEl = null;
    return;
  }
  if (action === "confirm") {
    return;
  }
  const newIndex = moveListIndex(el.selectedIndex, el.options.length, action);
  if (newIndex !== el.selectedIndex) {
    el.selectedIndex = newIndex;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }
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

// focusContainerCenter finds containerId's ("pot" or "hand") row in a
// freshly computed grid -- by matching the row's first element against
// the container's first .card child, the same elements
// buildGameScreenGrid put there -- and focuses its middle card. No-ops
// if the player has never used a controller/keyboard (navUsed), the
// container has no cards, or (e.g. the round's first turn) its row
// isn't in the grid at all.
function focusContainerCenter(containerId: string): void {
  if (!navUsed) {
    return;
  }
  const container = document.getElementById(containerId);
  const cards = container ? Array.from(container.querySelectorAll<HTMLElement>(".card")) : [];
  if (cards.length === 0) {
    return;
  }
  const grid = computeGrid();
  const row = grid.findIndex((r) => r[0] === cards[0]);
  if (row === -1) {
    return;
  }
  focusOn(grid, row, Math.floor((grid[row]?.length ?? 1) / 2));
}

// focusPotCenter/focusHandCenter move focus to the pot's/hand's middle
// card, per specs/controller.md's "Selection Focus" rules --
// domActionPrompt.ts calls these directly at the moments those rules
// apply (a turn starting, or a pick landing in the other zone), since
// unlike moveFocus/activate they aren't driven by a NavAction and so
// can't go through handleAction.
export function focusPotCenter(): void {
  focusContainerCenter("pot");
}

export function focusHandCenter(): void {
  focusContainerCenter("hand");
}

// focusElementById focuses el (by id) if it's part of the current grid
// -- used for targets that aren't a container's cards (see
// focusContainerCenter above), such as a specific button.
function focusElementById(id: string): void {
  if (!navUsed) {
    return;
  }
  const el = document.getElementById(id) as HTMLElement | null;
  if (!el) {
    return;
  }
  const grid = computeGrid();
  for (let row = 0; row < grid.length; row++) {
    const col = grid[row]?.indexOf(el) ?? -1;
    if (col !== -1) {
      focusOn(grid, row, col);
      return;
    }
  }
}

// focusKnockButton focuses the Take Pot/Knock row's Knock button
// (labeled "Keep Hand" on the round's first turn) -- domActionPrompt.ts
// calls this at the start of a first-turn decide(), since cards aren't
// part of the focus order at all that turn (specs/controller.md).
export function focusKnockButton(): void {
  focusElementById("knock-btn");
}

// handleAction is the single entry point gamepadInput.ts/keyboardNav.ts
// both report NavActions to.
export function handleAction(action: NavAction): void {
  navUsed = true;
  if (activeListEl) {
    handleListAction(action);
    return;
  }
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
