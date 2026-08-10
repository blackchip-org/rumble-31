import { test } from "node:test";
import assert from "node:assert/strict";
import { trade } from "../game/types.ts";
import { TradeSelection } from "./tradeSelection.ts";

type Click = { zone: "hand" | "pot"; index: number };

function apply(s: TradeSelection, clicks: readonly Click[]): void {
  for (const c of clicks) {
    if (c.zone === "hand") {
      s.clickHand(c.index);
    } else {
      s.clickPot(c.index);
    }
  }
}

test("TradeSelection", () => {
  const cases: Array<{
    name: string;
    clicks: Click[];
    wantHand: number | null;
    wantPot: number | null;
    wantReady: boolean;
  }> = [
    {
      name: "nothing clicked yet",
      clicks: [],
      wantHand: null,
      wantPot: null,
      wantReady: false,
    },
    {
      name: "hand only",
      clicks: [{ zone: "hand", index: 1 }],
      wantHand: 1,
      wantPot: null,
      wantReady: false,
    },
    {
      name: "pot only",
      clicks: [{ zone: "pot", index: 2 }],
      wantHand: null,
      wantPot: 2,
      wantReady: false,
    },
    {
      name: "hand then pot completes the pair",
      clicks: [
        { zone: "hand", index: 0 },
        { zone: "pot", index: 2 },
      ],
      wantHand: 0,
      wantPot: 2,
      wantReady: true,
    },
    {
      name: "pot then hand completes the pair",
      clicks: [
        { zone: "pot", index: 2 },
        { zone: "hand", index: 0 },
      ],
      wantHand: 0,
      wantPot: 2,
      wantReady: true,
    },
    {
      name: "re-clicking the same hand card deselects it",
      clicks: [
        { zone: "hand", index: 1 },
        { zone: "hand", index: 1 },
      ],
      wantHand: null,
      wantPot: null,
      wantReady: false,
    },
    {
      name: "re-clicking the same pot card deselects it",
      clicks: [
        { zone: "pot", index: 1 },
        { zone: "pot", index: 1 },
      ],
      wantHand: null,
      wantPot: null,
      wantReady: false,
    },
    {
      name: "clicking a different hand card moves the pick",
      clicks: [
        { zone: "hand", index: 0 },
        { zone: "hand", index: 2 },
      ],
      wantHand: 2,
      wantPot: null,
      wantReady: false,
    },
    {
      name: "clicking a different pot card moves the pick",
      clicks: [
        { zone: "pot", index: 0 },
        { zone: "pot", index: 2 },
      ],
      wantHand: null,
      wantPot: 2,
      wantReady: false,
    },
  ];

  for (const { name, clicks, wantHand, wantPot, wantReady } of cases) {
    const s = new TradeSelection();
    apply(s, clicks);
    assert.equal(s.handIndex(), wantHand, `${name}: handIndex`);
    assert.equal(s.potIndex(), wantPot, `${name}: potIndex`);
    assert.equal(s.ready(), wantReady, `${name}: ready`);
  }
});

test("TradeSelection.action returns trade(potIndex, handIndex) once ready", () => {
  const s = new TradeSelection();
  s.clickHand(1);
  s.clickPot(2);
  assert.deepEqual(s.action(), trade(2, 1));
});

test("TradeSelection.action throws before ready", () => {
  const s = new TradeSelection();
  s.clickHand(1);
  assert.throws(() => s.action());
});
