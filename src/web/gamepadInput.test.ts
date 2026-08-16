import { test } from "node:test";
import assert from "node:assert/strict";
import { SCROLL_BUTTON_MAP, SCROLL_DEADZONE, SCROLL_MAX_SPEED, buttonMapFor, diffButtonStates, scrollDeltaFromAxis, type NavAction } from "./gamepadInput.ts";

test("diffButtonStates", () => {
  const cases: Array<{ name: string; prev: boolean[]; curr: boolean[]; want: number[] }> = [
    { name: "nothing pressed", prev: [false, false], curr: [false, false], want: [] },
    { name: "fresh press", prev: [false, false], curr: [true, false], want: [0] },
    { name: "held button doesn't repeat-fire", prev: [true], curr: [true], want: [] },
    { name: "release reports nothing", prev: [true], curr: [false], want: [] },
    { name: "multiple simultaneous presses", prev: [false, false, false], curr: [true, false, true], want: [0, 2] },
    { name: "one held, one freshly pressed", prev: [true, false], curr: [true, true], want: [1] },
    { name: "prev shorter than curr treats missing entries as unpressed", prev: [], curr: [true, false, true], want: [0, 2] },
  ];

  for (const c of cases) {
    assert.deepEqual(diffButtonStates(c.prev, c.curr), c.want, c.name);
  }
});

test("scrollDeltaFromAxis", () => {
  const cases: Array<{ name: string; y: number; deadzone?: number; maxSpeed?: number; want: number }> = [
    { name: "centered stick", y: 0, want: 0 },
    { name: "within deadzone: no scroll", y: SCROLL_DEADZONE - 0.01, want: 0 },
    { name: "exactly at deadzone: no scroll", y: SCROLL_DEADZONE, want: 0 },
    { name: "full deflection down: max speed", y: 1, want: SCROLL_MAX_SPEED },
    { name: "full deflection up: negative max speed", y: -1, want: -SCROLL_MAX_SPEED },
    { name: "halfway between deadzone and full deflection", y: (SCROLL_DEADZONE + 1) / 2, want: SCROLL_MAX_SPEED / 2 },
    { name: "custom deadzone/maxSpeed", y: 0.6, deadzone: 0.5, maxSpeed: 10, want: 2 },
  ];

  for (const c of cases) {
    assert.ok(Math.abs(scrollDeltaFromAxis(c.y, c.deadzone, c.maxSpeed) - c.want) < 1e-9, c.name);
  }
});

test("SCROLL_BUTTON_MAP", () => {
  const cases: Array<{ name: string; button: number; want: "up" | "down" | undefined }> = [
    { name: "L1 scrolls up", button: 4, want: "up" },
    { name: "R1 scrolls down", button: 5, want: "down" },
    { name: "unmapped button", button: 0, want: undefined },
  ];

  for (const c of cases) {
    assert.equal(SCROLL_BUTTON_MAP[c.button], c.want, c.name);
  }
});

test("buttonMapFor", () => {
  const cases: Array<{ name: string; swap: boolean; button: number; want: NavAction | undefined }> = [
    { name: "standard: A confirms", swap: false, button: 0, want: "confirm" },
    { name: "standard: B cancels", swap: false, button: 1, want: "cancel" },
    { name: "standard: D-pad up", swap: false, button: 12, want: "up" },
    { name: "swapped: A cancels", swap: true, button: 0, want: "cancel" },
    { name: "swapped: B confirms", swap: true, button: 1, want: "confirm" },
    { name: "swapped: D-pad unaffected", swap: true, button: 13, want: "down" },
    { name: "unmapped button", swap: false, button: 7, want: undefined },
  ];

  for (const c of cases) {
    assert.equal(buttonMapFor(c.swap)[c.button], c.want, c.name);
  }
});
