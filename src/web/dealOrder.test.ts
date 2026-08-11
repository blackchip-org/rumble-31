import { test } from "node:test";
import assert from "node:assert/strict";
import { dealOrder, type DealStep } from "./dealOrder.ts";

test("dealOrder", () => {
  const cases: Array<{ name: string; activeSeats: number[]; want: DealStep[] }> = [
    {
      name: "all four seats: round-robin three cards each, then the pot",
      activeSeats: [0, 1, 2, 3],
      want: [
        { kind: "hand", seat: 0, cardIndex: 0 },
        { kind: "hand", seat: 1, cardIndex: 0 },
        { kind: "hand", seat: 2, cardIndex: 0 },
        { kind: "hand", seat: 3, cardIndex: 0 },
        { kind: "hand", seat: 0, cardIndex: 1 },
        { kind: "hand", seat: 1, cardIndex: 1 },
        { kind: "hand", seat: 2, cardIndex: 1 },
        { kind: "hand", seat: 3, cardIndex: 1 },
        { kind: "hand", seat: 0, cardIndex: 2 },
        { kind: "hand", seat: 1, cardIndex: 2 },
        { kind: "hand", seat: 2, cardIndex: 2 },
        { kind: "hand", seat: 3, cardIndex: 2 },
        { kind: "pot", potIndex: 0 },
        { kind: "pot", potIndex: 1 },
        { kind: "pot", potIndex: 2 },
      ],
    },
    {
      name: "a sparse seat list (West eliminated) skips it entirely",
      activeSeats: [0, 2, 3],
      want: [
        { kind: "hand", seat: 0, cardIndex: 0 },
        { kind: "hand", seat: 2, cardIndex: 0 },
        { kind: "hand", seat: 3, cardIndex: 0 },
        { kind: "hand", seat: 0, cardIndex: 1 },
        { kind: "hand", seat: 2, cardIndex: 1 },
        { kind: "hand", seat: 3, cardIndex: 1 },
        { kind: "hand", seat: 0, cardIndex: 2 },
        { kind: "hand", seat: 2, cardIndex: 2 },
        { kind: "hand", seat: 3, cardIndex: 2 },
        { kind: "pot", potIndex: 0 },
        { kind: "pot", potIndex: 1 },
        { kind: "pot", potIndex: 2 },
      ],
    },
    {
      name: "two seats remaining",
      activeSeats: [0, 2],
      want: [
        { kind: "hand", seat: 0, cardIndex: 0 },
        { kind: "hand", seat: 2, cardIndex: 0 },
        { kind: "hand", seat: 0, cardIndex: 1 },
        { kind: "hand", seat: 2, cardIndex: 1 },
        { kind: "hand", seat: 0, cardIndex: 2 },
        { kind: "hand", seat: 2, cardIndex: 2 },
        { kind: "pot", potIndex: 0 },
        { kind: "pot", potIndex: 1 },
        { kind: "pot", potIndex: 2 },
      ],
    },
  ];

  for (const { name, activeSeats, want } of cases) {
    assert.deepEqual(dealOrder(activeSeats), want, name);
  }
});
