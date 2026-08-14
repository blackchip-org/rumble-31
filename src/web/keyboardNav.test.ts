import { test } from "node:test";
import assert from "node:assert/strict";
import { keyToAction } from "./keyboardNav.ts";
import type { NavAction } from "./gamepadInput.ts";

test("keyToAction", () => {
  const cases: Array<{ key: string; want: NavAction | undefined }> = [
    { key: "ArrowUp", want: "up" },
    { key: "ArrowDown", want: "down" },
    { key: "ArrowLeft", want: "left" },
    { key: "ArrowRight", want: "right" },
    { key: "Enter", want: "confirm" },
    { key: "Escape", want: "cancel" },
    { key: "a", want: undefined },
    { key: " ", want: undefined },
  ];

  for (const c of cases) {
    assert.equal(keyToAction(c.key), c.want, c.key);
  }
});
