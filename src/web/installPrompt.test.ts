import { test } from "node:test";
import assert from "node:assert/strict";
import { detectPlatform } from "./installPrompt.ts";

test("detectPlatform", () => {
  const cases: Array<{ name: string; ua: string; touchPoints: number; want: string }> = [
    {
      name: "iPhone",
      ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15",
      touchPoints: 5,
      want: "ios",
    },
    {
      name: "iPad (legacy UA)",
      ua: "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15",
      touchPoints: 5,
      want: "ios",
    },
    {
      name: "iPad (iPadOS 13+ reports as a touch-capable Mac)",
      ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/605.1.15",
      touchPoints: 5,
      want: "ios",
    },
    {
      name: "Android phone",
      ua: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36",
      touchPoints: 5,
      want: "android",
    },
    {
      name: "desktop Mac (no touch)",
      ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/605.1.15",
      touchPoints: 0,
      want: "other",
    },
    {
      name: "desktop Windows",
      ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      touchPoints: 0,
      want: "other",
    },
  ];

  for (const { name, ua, touchPoints, want } of cases) {
    assert.equal(detectPlatform(ua, touchPoints), want, name);
  }
});
