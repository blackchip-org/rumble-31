import { test } from "node:test";
import assert from "node:assert/strict";
import { formatErrorDetail } from "./errorScreen.ts";

test("formatErrorDetail", () => {
  const v8Style = new Error("boom");
  v8Style.stack = "Error: boom\n    at foo (file.ts:1:1)\n    at bar (file.ts:2:2)";

  const firefoxStyle = new Error("boom");
  firefoxStyle.stack = "foo@file.ts:1:1\nbar@file.ts:2:2";

  const noStack = new Error("no stack here");
  delete noStack.stack;

  const namedError = new TypeError("wrong type");
  namedError.stack = "wrong type\n    at foo (file.ts:1:1)";

  const cases: Array<{ name: string; err: unknown; want: string }> = [
    {
      name: "V8-style stack already has the header — used as-is",
      err: v8Style,
      want: "Error: boom\n    at foo (file.ts:1:1)\n    at bar (file.ts:2:2)",
    },
    {
      name: "Firefox/Safari-style stack has no header — one gets prepended",
      err: firefoxStyle,
      want: "Error: boom\nfoo@file.ts:1:1\nbar@file.ts:2:2",
    },
    { name: "no stack at all falls back to the header alone", err: noStack, want: "Error: no stack here" },
    {
      name: "a non-Error subclass's name appears in the header",
      err: namedError,
      want: "TypeError: wrong type\nwrong type\n    at foo (file.ts:1:1)",
    },
    { name: "string thrown", err: "just a string", want: "just a string" },
    { name: "number thrown", err: 42, want: "42" },
    { name: "object thrown", err: { code: "E_BAD" }, want: "[object Object]" },
  ];

  for (const c of cases) {
    assert.equal(formatErrorDetail(c.err), c.want, c.name);
  }
});
