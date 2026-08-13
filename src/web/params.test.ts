import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDebugParams, type ScreenId } from "./params.ts";
import type { Hand, Pot } from "../game/types.ts";

const hand7s8h9c: Hand = [
  { rank: "7", suit: "s" },
  { rank: "8", suit: "h" },
  { rank: "9", suit: "c" },
];
const potTcJdQh: Pot = [
  { rank: "T", suit: "c" },
  { rank: "J", suit: "d" },
  { rank: "Q", suit: "h" },
];

test("parseDebugParams: valid combinations", () => {
  const cases: Array<{
    name: string;
    search: string;
    wantInitialStrikes: [number, number, number, number];
    wantAssignedHands?: Array<[number, Hand]>;
    wantAssignedPot?: Pot;
    wantFirstSeat?: number;
    wantTurnIndex?: number;
    wantSkipDealAnimation: boolean;
    wantNoInitialDeal?: boolean;
    wantScreen?: ScreenId;
  }> = [
    {
      name: "no params at all",
      search: "",
      wantInitialStrikes: [0, 0, 0, 0],
      wantSkipDealAnimation: false,
      wantNoInitialDeal: true,
    },
    {
      name: "strikes alone doesn't touch initialDeal",
      search: "strikes=1121",
      wantInitialStrikes: [1, 1, 2, 1],
      wantSkipDealAnimation: false,
      wantNoInitialDeal: true,
    },
    {
      name: "one hand alone",
      search: "north=7s8h9c",
      wantInitialStrikes: [0, 0, 0, 0],
      wantAssignedHands: [[2, hand7s8h9c]],
      wantSkipDealAnimation: true,
    },
    {
      name: "pot alone",
      search: "pot=TcJdQh",
      wantInitialStrikes: [0, 0, 0, 0],
      wantAssignedPot: potTcJdQh,
      wantSkipDealAnimation: true,
    },
    {
      name: "turn alone does not skip the deal animation",
      search: "turn=east",
      wantInitialStrikes: [0, 0, 0, 0],
      wantFirstSeat: 3,
      wantTurnIndex: 1,
      wantSkipDealAnimation: false,
    },
    {
      name: "turn is case-insensitive",
      search: "turn=EAST",
      wantInitialStrikes: [0, 0, 0, 0],
      wantFirstSeat: 3,
      wantTurnIndex: 1,
      wantSkipDealAnimation: false,
    },
    {
      name: "turn with first=true is the round's actual first turn",
      search: "turn=east&first=true",
      wantInitialStrikes: [0, 0, 0, 0],
      wantFirstSeat: 3,
      wantTurnIndex: 0,
      wantSkipDealAnimation: false,
    },
    {
      name: "turn with first=false is not the round's first turn",
      search: "turn=east&first=false",
      wantInitialStrikes: [0, 0, 0, 0],
      wantFirstSeat: 3,
      wantTurnIndex: 1,
      wantSkipDealAnimation: false,
    },
    {
      name: "hand, pot, and turn together",
      search: "north=7s8h9c&pot=TcJdQh&turn=north",
      wantInitialStrikes: [0, 0, 0, 0],
      wantAssignedHands: [[2, hand7s8h9c]],
      wantAssignedPot: potTcJdQh,
      wantFirstSeat: 2,
      wantTurnIndex: 1,
      wantSkipDealAnimation: true,
    },
    {
      name: "screen=game",
      search: "screen=game",
      wantInitialStrikes: [0, 0, 0, 0],
      wantSkipDealAnimation: false,
      wantNoInitialDeal: true,
      wantScreen: "game",
    },
    {
      name: "screen=main",
      search: "screen=main",
      wantInitialStrikes: [0, 0, 0, 0],
      wantSkipDealAnimation: false,
      wantNoInitialDeal: true,
      wantScreen: "main",
    },
    {
      name: "screen=over",
      search: "screen=over",
      wantInitialStrikes: [0, 0, 0, 0],
      wantSkipDealAnimation: false,
      wantNoInitialDeal: true,
      wantScreen: "over",
    },
    {
      name: "screen=error",
      search: "screen=error",
      wantInitialStrikes: [0, 0, 0, 0],
      wantSkipDealAnimation: false,
      wantNoInitialDeal: true,
      wantScreen: "error",
    },
    {
      name: "screen=settings",
      search: "screen=settings",
      wantInitialStrikes: [0, 0, 0, 0],
      wantSkipDealAnimation: false,
      wantNoInitialDeal: true,
      wantScreen: "settings",
    },
    {
      name: "screen=about",
      search: "screen=about",
      wantInitialStrikes: [0, 0, 0, 0],
      wantSkipDealAnimation: false,
      wantNoInitialDeal: true,
      wantScreen: "about",
    },
    {
      name: "screen doesn't interfere with unrelated params",
      search: "screen=main&strikes=1000",
      wantInitialStrikes: [1, 0, 0, 0],
      wantSkipDealAnimation: false,
      wantNoInitialDeal: true,
      wantScreen: "main",
    },
  ];

  for (const c of cases) {
    const got = parseDebugParams(c.search);
    assert.deepEqual(got.initialStrikes, c.wantInitialStrikes, `${c.name}: initialStrikes`);
    assert.equal(got.skipDealAnimation, c.wantSkipDealAnimation, `${c.name}: skipDealAnimation`);
    assert.equal(got.screen, c.wantScreen, `${c.name}: screen`);

    if (c.wantNoInitialDeal) {
      assert.equal(got.initialDeal, undefined, `${c.name}: initialDeal`);
      continue;
    }
    assert.ok(got.initialDeal, `${c.name}: expected an initialDeal`);
    for (const [seat, hand] of c.wantAssignedHands ?? []) {
      assert.deepEqual(got.initialDeal?.assignedHands?.get(seat), hand, `${c.name}: assignedHands[${seat}]`);
    }
    if (c.wantAssignedPot) {
      assert.deepEqual(got.initialDeal?.assignedPot, c.wantAssignedPot, `${c.name}: assignedPot`);
    }
    assert.equal(got.initialDeal?.firstSeat, c.wantFirstSeat, `${c.name}: firstSeat`);
    assert.equal(got.initialDeal?.turnIndex, c.wantTurnIndex, `${c.name}: turnIndex`);
  }
});

test("parseDebugParams: invalid input throws", () => {
  const cases: Array<{ name: string; search: string }> = [
    { name: "malformed strikes: too few digits", search: "strikes=12" },
    { name: "malformed strikes: non-digit", search: "strikes=112a" },
    { name: "bad card notation", search: "north=1s8h9c" },
    { name: "wrong-length hand", search: "north=7s8h9" },
    { name: "wrong-length pot", search: "pot=7s8h9c9d" },
    { name: "duplicate card across two hand params", search: "north=7s8h9c&south=7sAhKd" },
    { name: "duplicate card between a hand and the pot", search: "north=7s8h9c&pot=7sAhKd" },
    { name: "hand assigned to a seat eliminated by strikes", search: "strikes=3000&south=7s8h9c" },
    { name: "turn names a seat eliminated by strikes", search: "strikes=0300&turn=west" },
    { name: "turn names an unknown seat", search: "turn=northwest" },
    { name: "first given without turn", search: "first=true" },
    { name: "first is not true or false", search: "turn=east&first=yes" },
    { name: "screen names an unknown screen", search: "screen=bogus" },
  ];

  for (const { name, search } of cases) {
    assert.throws(() => parseDebugParams(search), name);
  }
});
