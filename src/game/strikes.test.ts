import { test } from "node:test";
import assert from "node:assert/strict";
import { parseStrikesDigits } from "./strikes.ts";

test("parseStrikesDigits", () => {
  const cases: Array<{ name: string; value: string; want?: [number, number, number, number]; wantErr?: boolean }> = [
    { name: "four digits, seat 0 first", value: "1121", want: [1, 1, 2, 1] },
    { name: "all zeros", value: "0000", want: [0, 0, 0, 0] },
    { name: "digits above 3 are accepted (still >= 3 == eliminated)", value: "9999", want: [9, 9, 9, 9] },
    { name: "empty string", value: "", wantErr: true },
    { name: "too few digits", value: "12", wantErr: true },
    { name: "too many digits", value: "12345", wantErr: true },
    { name: "non-digit characters", value: "12a1", wantErr: true },
  ];

  for (const { name, value, want, wantErr } of cases) {
    if (wantErr) {
      assert.throws(() => parseStrikesDigits(value), name);
    } else {
      assert.deepEqual(parseStrikesDigits(value), want, name);
    }
  }
});
