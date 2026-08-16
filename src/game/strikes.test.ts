import { test } from "node:test";
import assert from "node:assert/strict";
import { parseStrikesDigits } from "./strikes.ts";
import type { ParsedStrikes } from "./strikes.ts";

test("parseStrikesDigits", () => {
  const cases: Array<{ name: string; value: string; want?: ParsedStrikes; wantErr?: boolean }> = [
    {
      name: "four digits, seat 0 first",
      value: "1121",
      want: { strikes: [1, 1, 2, 1], secondChance: [false, false, false, false], eliminated: [false, false, false, false] },
    },
    {
      name: "all zeros",
      value: "0000",
      want: { strikes: [0, 0, 0, 0], secondChance: [false, false, false, false], eliminated: [false, false, false, false] },
    },
    {
      name: "digits above 3 are accepted (still >= 3 == eliminated)",
      value: "9999",
      want: { strikes: [9, 9, 9, 9], secondChance: [false, false, false, false], eliminated: [true, true, true, true] },
    },
    {
      name: "s/S seats a seat with 3 strikes and an active second chance, not eliminated",
      value: "sS12",
      want: { strikes: [3, 3, 1, 2], secondChance: [true, true, false, false], eliminated: [false, false, false, false] },
    },
    { name: "empty string", value: "", wantErr: true },
    { name: "too few digits", value: "12", wantErr: true },
    { name: "too many digits", value: "12345", wantErr: true },
    { name: "non-digit, non-s/S characters", value: "12a1", wantErr: true },
  ];

  for (const { name, value, want, wantErr } of cases) {
    if (wantErr) {
      assert.throws(() => parseStrikesDigits(value), name);
    } else {
      assert.deepEqual(parseStrikesDigits(value), want, name);
    }
  }
});
