import { test } from "node:test";
import assert from "node:assert/strict";
import { AXIS_DEADZONE, axisDirections, buttonMapFor, diffButtonStates, type NavAction } from "./gamepadInput.ts";

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

test("axisDirections", () => {
  const cases: Array<{ name: string; x: number; y: number; deadzone?: number; want: boolean[] }> = [
    { name: "centered stick", x: 0, y: 0, want: [false, false, false, false] },
    { name: "pushed up", x: 0, y: -1, want: [true, false, false, false] },
    { name: "pushed down", x: 0, y: 1, want: [false, true, false, false] },
    { name: "pushed left", x: -1, y: 0, want: [false, false, true, false] },
    { name: "pushed right", x: 1, y: 0, want: [false, false, false, true] },
    { name: "within deadzone: no direction", x: 0.2, y: -0.2, want: [false, false, false, false] },
    { name: "just past default deadzone", x: 0, y: -(AXIS_DEADZONE + 0.01), want: [true, false, false, false] },
    { name: "custom deadzone", x: 0.3, y: 0, deadzone: 0.2, want: [false, false, false, true] },
  ];

  for (const c of cases) {
    assert.deepEqual(axisDirections(c.x, c.y, c.deadzone), c.want, c.name);
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
