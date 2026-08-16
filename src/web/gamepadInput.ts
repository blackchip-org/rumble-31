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

// ScrollEvent is the input-source-agnostic scroll instruction reported
// alongside NavActions, for scrollNav.ts to apply to whichever screen's
// panel is currently visible: "axis" for the left stick's continuous,
// proportional scroll (reported every poll frame, including 0 once the
// stick re-centers) and "page" for a single L1/R1 bumper press
// (edge-triggered like the D-pad/face buttons).
export type ScrollEvent = { kind: "axis"; deltaY: number } | { kind: "page"; dir: "up" | "down" };

// SCROLL_BUTTON_MAP is the L1/R1 shoulder bumpers (W3C Standard
// Gamepad indices 4/5) -- a backup for controllers whose stick isn't
// usable for fine analog scrolling.
export const SCROLL_BUTTON_MAP: Readonly<Record<number, "up" | "down">> = { 4: "up", 5: "down" };

// SCROLL_DEADZONE/SCROLL_MAX_SPEED tune the left stick's continuous
// scroll -- a small deadzone so scrolling ramps in smoothly rather
// than snapping to "on" past a coarse threshold.
export const SCROLL_DEADZONE = 0.15;
export const SCROLL_MAX_SPEED = 24; // px per polled frame at full deflection

// scrollDeltaFromAxis turns a stick's raw Y axis (-1..1, positive =
// down) into a per-frame scroll delta in pixels: 0 within deadzone,
// ramping linearly from 0 at the deadzone edge to maxSpeed at full
// deflection.
export function scrollDeltaFromAxis(y: number, deadzone: number = SCROLL_DEADZONE, maxSpeed: number = SCROLL_MAX_SPEED): number {
  const magnitude = Math.abs(y);
  if (magnitude <= deadzone) {
    return 0;
  }
  const scale = (magnitude - deadzone) / (1 - deadzone);
  return Math.sign(y) * scale * maxSpeed;
}

export interface GamepadInputHandle {
  stop(): void;
}

// startGamepadInput polls navigator.getGamepads() via
// requestAnimationFrame, edge-detecting D-pad/face/bumper button
// presses and reporting each as an onAction(NavAction) or
// onScroll({kind: "page", ...}) call, plus the left stick's raw Y axis
// every frame as an onScroll({kind: "axis", ...}) call.
// getSwapConfirmCancel is read fresh on every frame rather than once,
// so a mid-session Settings change takes effect immediately. The poll
// loop only runs while at least one gamepad is connected, so a session
// with no controller plugged in pays no per-frame cost.
export function startGamepadInput(onAction: (action: NavAction) => void, getSwapConfirmCancel: () => boolean, onScroll: (event: ScrollEvent) => void): GamepadInputHandle {
  let rafId: number | undefined;
  let running = false;
  const prevButtons = new Map<number, boolean[]>();

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
        const scrollDir = SCROLL_BUTTON_MAP[i];
        if (scrollDir) {
          onScroll({ kind: "page", dir: scrollDir });
        }
      }
      prevButtons.set(pad.index, currButtons);

      onScroll({ kind: "axis", deltaY: scrollDeltaFromAxis(pad.axes[1] ?? 0) });
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
