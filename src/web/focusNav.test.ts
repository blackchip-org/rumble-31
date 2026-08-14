import { test } from "node:test";
import assert from "node:assert/strict";
import { moveIndex } from "./focusNav.ts";
import type { NavAction } from "./gamepadInput.ts";

test("moveIndex", () => {
  const cases: Array<{ name: string; current: number; count: number; dir: NavAction; want: number }> = [
    { name: "down moves forward", current: 0, count: 3, dir: "down", want: 1 },
    { name: "right moves forward", current: 0, count: 3, dir: "right", want: 1 },
    { name: "up moves backward", current: 1, count: 3, dir: "up", want: 0 },
    { name: "left moves backward", current: 1, count: 3, dir: "left", want: 0 },
    { name: "down wraps past the end", current: 2, count: 3, dir: "down", want: 0 },
    { name: "up wraps past the start", current: 0, count: 3, dir: "up", want: 2 },
    { name: "single-element list stays put", current: 0, count: 1, dir: "down", want: 0 },
    { name: "empty list returns 0", current: 0, count: 0, dir: "down", want: 0 },
  ];

  for (const c of cases) {
    assert.equal(moveIndex(c.current, c.count, c.dir), c.want, c.name);
  }
});
