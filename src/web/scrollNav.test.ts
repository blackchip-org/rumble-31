import { test } from "node:test";
import assert from "node:assert/strict";
import { clampScrollTop } from "./scrollNav.ts";

test("clampScrollTop", () => {
  const cases: Array<{ name: string; current: number; delta: number; scrollHeight: number; clientHeight: number; want: number }> = [
    { name: "scrolls down within range", current: 0, delta: 20, scrollHeight: 500, clientHeight: 200, want: 20 },
    { name: "scrolls up within range", current: 50, delta: -20, scrollHeight: 500, clientHeight: 200, want: 30 },
    { name: "clamps at the top", current: 10, delta: -50, scrollHeight: 500, clientHeight: 200, want: 0 },
    { name: "clamps at the bottom", current: 290, delta: 50, scrollHeight: 500, clientHeight: 200, want: 300 },
    { name: "already at the bottom stays put", current: 300, delta: 20, scrollHeight: 500, clientHeight: 200, want: 300 },
    { name: "content shorter than the panel clamps to 0", current: 0, delta: 20, scrollHeight: 100, clientHeight: 200, want: 0 },
    { name: "zero delta is a no-op", current: 40, delta: 0, scrollHeight: 500, clientHeight: 200, want: 40 },
  ];

  for (const c of cases) {
    assert.equal(clampScrollTop(c.current, c.delta, c.scrollHeight, c.clientHeight), c.want, c.name);
  }
});
