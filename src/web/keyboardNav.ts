// Keyboard navigation, per specs/controller.md: arrow keys, Enter, and
// Escape are mapped to the same NavAction vocabulary gamepadInput.ts
// reports, so focusNav.ts handles both input sources identically.

import type { NavAction } from "./gamepadInput.ts";

const KEY_MAP: Readonly<Record<string, NavAction>> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  Enter: "confirm",
  Escape: "cancel",
};

// keyToAction maps a KeyboardEvent.key to a NavAction, or undefined
// for any key this module doesn't handle.
export function keyToAction(key: string): NavAction | undefined {
  return KEY_MAP[key];
}

// startKeyboardNav reports each recognized keydown as an
// onAction(NavAction) call, and returns a function that removes the
// listener.
export function startKeyboardNav(onAction: (action: NavAction) => void): () => void {
  const onKeydown = (e: KeyboardEvent): void => {
    const action = keyToAction(e.key);
    if (action) {
      onAction(action);
    }
  };
  document.addEventListener("keydown", onKeydown);
  return () => document.removeEventListener("keydown", onKeydown);
}
