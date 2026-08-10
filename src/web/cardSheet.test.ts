import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCard } from "../card/card.ts";
import { tilePosition } from "./cardSheet.ts";

test("tilePosition", () => {
  const cases: Array<{ name: string; card: string; wantRow: number; wantCol: number }> = [
    { name: "ace is column 1, not the last column", card: "Ah", wantRow: 3, wantCol: 1 },
    { name: "spades use the black row", card: "7s", wantRow: 2, wantCol: 7 },
    { name: "hearts use the red row", card: "8h", wantRow: 3, wantCol: 8 },
    { name: "diamonds use the blue row", card: "9d", wantRow: 6, wantCol: 9 },
    { name: "clubs use the green row", card: "Tc", wantRow: 7, wantCol: 10 },
    { name: "king is the last column", card: "Kc", wantRow: 7, wantCol: 13 },
    { name: "jack", card: "Js", wantRow: 2, wantCol: 11 },
    { name: "queen", card: "Qd", wantRow: 6, wantCol: 12 },
  ];

  for (const { name, card, wantRow, wantCol } of cases) {
    const got = tilePosition(parseCard(card));
    assert.deepEqual(got, { row: wantRow, col: wantCol }, name);
  }
});
