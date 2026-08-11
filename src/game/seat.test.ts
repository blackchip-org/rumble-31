import { test } from "node:test";
import assert from "node:assert/strict";
import { seatByName, seatName } from "./seat.ts";

test("seatByName", () => {
  const cases: Array<{ name: string; input: string; want: number | undefined }> = [
    { name: "south, lowercase", input: "south", want: 0 },
    { name: "west, lowercase", input: "west", want: 1 },
    { name: "north, lowercase", input: "north", want: 2 },
    { name: "east, lowercase", input: "east", want: 3 },
    { name: "mixed case", input: "North", want: 2 },
    { name: "all caps", input: "EAST", want: 3 },
    { name: "unknown name", input: "northeast", want: undefined },
    { name: "empty string", input: "", want: undefined },
  ];

  for (const { name, input, want } of cases) {
    assert.equal(seatByName(input), want, name);
  }
});

test("seatByName round-trips with seatName", () => {
  for (let seat = 0; seat < 4; seat++) {
    assert.equal(seatByName(seatName(seat)), seat);
  }
});
