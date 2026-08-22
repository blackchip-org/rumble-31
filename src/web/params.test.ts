import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDebugParams, type ScreenId } from "./params.ts";
import type { Hand, Pot } from "../game/types.ts";
import type { Platform } from "./installPrompt.ts";

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
    wantSecondChance?: [boolean, boolean, boolean, boolean];
    wantAssignedHands?: Array<[number, Hand]>;
    wantAssignedPot?: Pot;
    wantFirstSeat?: number;
    wantTurnIndex?: number;
    wantSkipDealAnimation: boolean;
    wantNoInitialDeal?: boolean;
    wantScreen?: ScreenId;
    wantClear?: boolean;
    wantPlatform?: Platform;
    wantShowBots?: boolean;
    wantAgeMinutes?: number;
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
      name: "strikes with s/S grants an active second chance instead of eliminating",
      search: "strikes=sS10",
      wantInitialStrikes: [3, 3, 1, 0],
      wantSecondChance: [true, true, false, false],
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
      name: "screen=licenses",
      search: "screen=licenses",
      wantInitialStrikes: [0, 0, 0, 0],
      wantSkipDealAnimation: false,
      wantNoInitialDeal: true,
      wantScreen: "licenses",
    },
    {
      name: "screen=menu",
      search: "screen=menu",
      wantInitialStrikes: [0, 0, 0, 0],
      wantSkipDealAnimation: false,
      wantNoInitialDeal: true,
      wantScreen: "menu",
    },
    {
      name: "screen doesn't interfere with unrelated params",
      search: "screen=main&strikes=1000",
      wantInitialStrikes: [1, 0, 0, 0],
      wantSkipDealAnimation: false,
      wantNoInitialDeal: true,
      wantScreen: "main",
    },
    {
      name: "clear=true alone",
      search: "clear=true",
      wantInitialStrikes: [0, 0, 0, 0],
      wantSkipDealAnimation: false,
      wantNoInitialDeal: true,
      wantClear: true,
    },
    {
      name: "clear=false alone",
      search: "clear=false",
      wantInitialStrikes: [0, 0, 0, 0],
      wantSkipDealAnimation: false,
      wantNoInitialDeal: true,
      wantClear: false,
    },
    {
      name: "clear doesn't interfere with unrelated params",
      search: "clear=true&north=7s8h9c",
      wantInitialStrikes: [0, 0, 0, 0],
      wantAssignedHands: [[2, hand7s8h9c]],
      wantSkipDealAnimation: true,
      wantClear: true,
    },
    {
      name: "platform=ios",
      search: "platform=ios",
      wantInitialStrikes: [0, 0, 0, 0],
      wantSkipDealAnimation: false,
      wantNoInitialDeal: true,
      wantPlatform: "ios",
    },
    {
      name: "platform=android",
      search: "platform=android",
      wantInitialStrikes: [0, 0, 0, 0],
      wantSkipDealAnimation: false,
      wantNoInitialDeal: true,
      wantPlatform: "android",
    },
    {
      name: "platform=other",
      search: "platform=other",
      wantInitialStrikes: [0, 0, 0, 0],
      wantSkipDealAnimation: false,
      wantNoInitialDeal: true,
      wantPlatform: "other",
    },
    {
      name: "platform doesn't interfere with unrelated params",
      search: "platform=ios&screen=main",
      wantInitialStrikes: [0, 0, 0, 0],
      wantSkipDealAnimation: false,
      wantNoInitialDeal: true,
      wantScreen: "main",
      wantPlatform: "ios",
    },
    {
      name: "showBots=true",
      search: "showBots=true",
      wantInitialStrikes: [0, 0, 0, 0],
      wantSkipDealAnimation: false,
      wantNoInitialDeal: true,
      wantShowBots: true,
    },
    {
      name: "showBots=false",
      search: "showBots=false",
      wantInitialStrikes: [0, 0, 0, 0],
      wantSkipDealAnimation: false,
      wantNoInitialDeal: true,
      wantShowBots: false,
    },
    {
      name: "showBots doesn't interfere with unrelated params",
      search: "showBots=true&screen=main",
      wantInitialStrikes: [0, 0, 0, 0],
      wantSkipDealAnimation: false,
      wantNoInitialDeal: true,
      wantScreen: "main",
      wantShowBots: true,
    },
    {
      name: "age=10",
      search: "age=10",
      wantInitialStrikes: [0, 0, 0, 0],
      wantSkipDealAnimation: false,
      wantNoInitialDeal: true,
      wantAgeMinutes: 10,
    },
    {
      name: "age=0",
      search: "age=0",
      wantInitialStrikes: [0, 0, 0, 0],
      wantSkipDealAnimation: false,
      wantNoInitialDeal: true,
      wantAgeMinutes: 0,
    },
    {
      name: "age doesn't interfere with unrelated params",
      search: "age=10&screen=main",
      wantInitialStrikes: [0, 0, 0, 0],
      wantSkipDealAnimation: false,
      wantNoInitialDeal: true,
      wantScreen: "main",
      wantAgeMinutes: 10,
    },
  ];

  for (const c of cases) {
    const got = parseDebugParams(c.search);
    assert.deepEqual(got.initialStrikes.strikes, c.wantInitialStrikes, `${c.name}: initialStrikes`);
    assert.deepEqual(got.initialStrikes.secondChance, c.wantSecondChance ?? [false, false, false, false], `${c.name}: secondChance`);
    assert.equal(got.skipDealAnimation, c.wantSkipDealAnimation, `${c.name}: skipDealAnimation`);
    assert.equal(got.screen, c.wantScreen, `${c.name}: screen`);
    assert.equal(got.clear, c.wantClear ?? false, `${c.name}: clear`);
    assert.equal(got.platform, c.wantPlatform, `${c.name}: platform`);
    assert.equal(got.showBots, c.wantShowBots ?? false, `${c.name}: showBots`);
    assert.equal(got.ageMinutes, c.wantAgeMinutes, `${c.name}: ageMinutes`);

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
    { name: "clear is not true or false", search: "clear=yes" },
    { name: "platform names an unknown platform", search: "platform=bogus" },
    { name: "showBots is not true or false", search: "showBots=yes" },
    { name: "age is negative", search: "age=-1" },
    { name: "age is not a number", search: "age=soon" },
  ];

  for (const { name, search } of cases) {
    assert.throws(() => parseDebugParams(search), name);
  }
});
