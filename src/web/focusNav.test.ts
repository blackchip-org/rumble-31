import { test } from "node:test";
import assert from "node:assert/strict";
import { moveGridPosition, moveListIndex } from "./focusNav.ts";
import type { NavAction } from "./gamepadInput.ts";

test("moveGridPosition", () => {
  const cases: Array<{ name: string; row: number; col: number; rowLengths: number[]; dir: NavAction; want: [number, number] }> = [
    // Single-column grids (one element per row) -- regression coverage
    // for Phase 1's plain button-stack screens.
    { name: "down moves to the next row", row: 0, col: 0, rowLengths: [1, 1, 1], dir: "down", want: [1, 0] },
    { name: "right on a single-column row acts like down", row: 0, col: 0, rowLengths: [1, 1, 1], dir: "right", want: [1, 0] },
    { name: "up moves to the previous row", row: 1, col: 0, rowLengths: [1, 1, 1], dir: "up", want: [0, 0] },
    { name: "left on a single-column row acts like up", row: 1, col: 0, rowLengths: [1, 1, 1], dir: "left", want: [0, 0] },
    { name: "down wraps past the last row", row: 2, col: 0, rowLengths: [1, 1, 1], dir: "down", want: [0, 0] },
    { name: "up wraps past the first row", row: 0, col: 0, rowLengths: [1, 1, 1], dir: "up", want: [2, 0] },
    { name: "single-row grid stays put", row: 0, col: 0, rowLengths: [1], dir: "down", want: [0, 0] },
    { name: "empty grid returns [0, 0]", row: 0, col: 0, rowLengths: [], dir: "down", want: [0, 0] },

    // Multi-column rows (card grids): left/right stay within the row.
    { name: "right moves within a row", row: 0, col: 0, rowLengths: [3], dir: "right", want: [0, 1] },
    { name: "left moves within a row", row: 0, col: 1, rowLengths: [3], dir: "left", want: [0, 0] },
    { name: "right wraps past the end of a row", row: 0, col: 2, rowLengths: [3], dir: "right", want: [0, 0] },
    { name: "left wraps past the start of a row", row: 0, col: 0, rowLengths: [3], dir: "left", want: [0, 2] },

    // Moving between rows of different lengths clamps the column.
    { name: "down into a shorter row clamps the column", row: 0, col: 2, rowLengths: [3, 2], dir: "down", want: [1, 1] },
    { name: "up into a shorter row clamps the column", row: 1, col: 2, rowLengths: [1, 3], dir: "up", want: [0, 0] },
    { name: "down into a longer row keeps the column", row: 0, col: 1, rowLengths: [2, 3], dir: "down", want: [1, 1] },
  ];

  for (const c of cases) {
    assert.deepEqual(moveGridPosition(c.row, c.col, c.rowLengths, c.dir), c.want, c.name);
  }
});

test("moveListIndex", () => {
  const cases: Array<{ name: string; index: number; length: number; dir: NavAction; want: number }> = [
    { name: "down moves to the next item", index: 0, length: 5, dir: "down", want: 1 },
    { name: "up moves to the previous item", index: 1, length: 5, dir: "up", want: 0 },
    { name: "right acts like down", index: 0, length: 5, dir: "right", want: 1 },
    { name: "left acts like up", index: 1, length: 5, dir: "left", want: 0 },
    { name: "down clamps at the last item instead of wrapping", index: 4, length: 5, dir: "down", want: 4 },
    { name: "up clamps at the first item instead of wrapping", index: 0, length: 5, dir: "up", want: 0 },
    { name: "empty list stays put", index: 0, length: 0, dir: "down", want: 0 },
  ];

  for (const c of cases) {
    assert.equal(moveListIndex(c.index, c.length, c.dir), c.want, c.name);
  }
});
