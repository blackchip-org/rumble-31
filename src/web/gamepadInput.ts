// Gamepad (controller) input, per specs/controller.md: polls the
// Gamepad API each frame (it has no native "button pressed" event) and
// turns edge-triggered button/stick presses into abstract NavAction
// events, which focusNav.ts consumes the same way regardless of
// whether they came from a gamepad or a keyboard (keyboardNav.ts).

// NavAction is the input-source-agnostic action a press maps to --
// shared with keyboardNav.ts so focusNav.ts has a single event
// vocabulary to handle.
export type NavAction = "up" | "down" | "left" | "right" | "confirm" | "cancel";

type ButtonMap = Readonly<Record<number, NavAction>>;

// STANDARD_BUTTON_MAP follows the W3C Standard Gamepad layout
// (https://w3c.github.io/gamepad/#remapping): D-pad buttons 12-15 for
// direction, button 0 (A) to confirm, button 1 (B) to cancel.
const STANDARD_BUTTON_MAP: ButtonMap = { 12: "up", 13: "down", 14: "left", 15: "right", 0: "confirm", 1: "cancel" };

// SWAPPED_BUTTON_MAP is STANDARD_BUTTON_MAP with confirm/cancel
// swapped, for players used to a Nintendo-style layout -- selected via
// the Settings screen's "Confirm/Cancel" toggle (specs/screens/settings.md).
const SWAPPED_BUTTON_MAP: ButtonMap = { ...STANDARD_BUTTON_MAP, 0: "cancel", 1: "confirm" };

// buttonMapFor picks the active button map for the player's current
// confirm/cancel setting.
export function buttonMapFor(swapConfirmCancel: boolean): ButtonMap {
  return swapConfirmCancel ? SWAPPED_BUTTON_MAP : STANDARD_BUTTON_MAP;
}

// diffButtonStates compares two frames of boolean button/direction
// state and returns the indices that just went from not-pressed to
// pressed -- a plain array diff, with no Gamepad object threaded
// through it, so it's exercised directly by unit tests without any
// real Gamepad hardware. A missing prev entry is treated as
// not-pressed, so the very first frame a pad is seen always reports
// its already-held buttons as fresh presses.
export function diffButtonStates(prev: readonly boolean[], curr: readonly boolean[]): number[] {
  const pressed: number[] = [];
  for (let i = 0; i < curr.length; i++) {
    if (curr[i] && !(prev[i] ?? false)) {
      pressed.push(i);
    }
  }
  return pressed;
}

// AXIS_DEADZONE is how far a stick must be pushed, on a -1..1 axis,
// before it counts as a directional press.
export const AXIS_DEADZONE = 0.5;

// AXIS_DIRECTIONS indexes axisDirections' returned array -- index i's
// boolean corresponds to AXIS_DIRECTIONS[i].
export const AXIS_DIRECTIONS: readonly NavAction[] = ["up", "down", "left", "right"];

// axisDirections turns a stick's raw x/y axis values into which of
// the four directions are currently held past deadzone, in
// AXIS_DIRECTIONS' order -- fed through diffButtonStates the same as
// button state, so holding the stick over doesn't repeat-fire every
// frame.
export function axisDirections(x: number, y: number, deadzone: number = AXIS_DEADZONE): boolean[] {
  return [y < -deadzone, y > deadzone, x < -deadzone, x > deadzone];
}

export interface GamepadInputHandle {
  stop(): void;
}

// startGamepadInput polls navigator.getGamepads() via
// requestAnimationFrame, edge-detecting button and stick presses and
// reporting each as an onAction(NavAction) call. getSwapConfirmCancel
// is read fresh on every frame rather than once, so a mid-session
// Settings change takes effect immediately. The poll loop only runs
// while at least one gamepad is connected, so a session with no
// controller plugged in pays no per-frame cost.
export function startGamepadInput(onAction: (action: NavAction) => void, getSwapConfirmCancel: () => boolean): GamepadInputHandle {
  let rafId: number | undefined;
  let running = false;
  const prevButtons = new Map<number, boolean[]>();
  const prevAxes = new Map<number, boolean[]>();

  function poll(): void {
    const map = buttonMapFor(getSwapConfirmCancel());
    for (const pad of navigator.getGamepads()) {
      if (!pad) {
        continue;
      }
      const currButtons = pad.buttons.map((b) => b.pressed);
      const prevButtonState = prevButtons.get(pad.index) ?? [];
      for (const i of diffButtonStates(prevButtonState, currButtons)) {
        const action = map[i];
        if (action) {
          onAction(action);
        }
      }
      prevButtons.set(pad.index, currButtons);

      const currAxes = axisDirections(pad.axes[0] ?? 0, pad.axes[1] ?? 0);
      const prevAxisState = prevAxes.get(pad.index) ?? [false, false, false, false];
      for (const i of diffButtonStates(prevAxisState, currAxes)) {
        onAction(AXIS_DIRECTIONS[i] as NavAction);
      }
      prevAxes.set(pad.index, currAxes);
    }
    if (running) {
      rafId = requestAnimationFrame(poll);
    }
  }

  function hasGamepad(): boolean {
    return navigator.getGamepads().some((p) => p !== null);
  }

  function start(): void {
    if (running) {
      return;
    }
    running = true;
    rafId = requestAnimationFrame(poll);
  }

  function stopPolling(): void {
    running = false;
    if (rafId !== undefined) {
      cancelAnimationFrame(rafId);
    }
    prevButtons.clear();
    prevAxes.clear();
  }

  if (hasGamepad()) {
    start();
  }
  const onConnect = () => start();
  const onDisconnect = () => {
    if (!hasGamepad()) {
      stopPolling();
    }
  };
  window.addEventListener("gamepadconnected", onConnect);
  window.addEventListener("gamepaddisconnected", onDisconnect);

  return {
    stop(): void {
      stopPolling();
      window.removeEventListener("gamepadconnected", onConnect);
      window.removeEventListener("gamepaddisconnected", onDisconnect);
    },
  };
}
