import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCard } from "../../card/card.ts";
import type { Hand, PlayerView, Pot } from "../../game/types.ts";
import { Rng } from "../../rng.ts";
import { allDifferentSuits, chance, excludeDangerous, forcedTradePool, randInt, sortCandidates, tradeCandidates, type CandidateMetrics, type TradeCandidate } from "./candidates.ts";

const noMetrics: CandidateMetrics = { danger: false, pairs: false };

function mustHand(...notation: [string, string, string]): Hand {
  return [parseCard(notation[0]), parseCard(notation[1]), parseCard(notation[2])];
}
function mustPot(...notation: [string, string, string]): Pot {
  return mustHand(...notation);
}

function baseView(overrides: Partial<PlayerView>): PlayerView {
  return {
    hand: mustHand("7c", "8d", "9s"),
    pot: mustPot("Kc", "Qd", "Js"),
    seat: 0,
    opponentCount: 3,
    isFirstTurnOfRound: false,
    lap: 1,
    isLastTurn: false,
    ...overrides,
  };
}

// FixedRng always returns the same next() value.
class FixedRng extends Rng {
  private value: number;
  constructor(value: number) {
    super(0);
    this.value = value;
  }
  next(): number {
    return this.value;
  }
}

test("tradeCandidates enumerates all nine pot/hand pairings with resulting scores", () => {
  const hand = mustHand("7c", "8c", "9d");
  const pot = mustPot("Tc", "7h", "Kd");
  const candidates = tradeCandidates(baseView({ hand, pot }), new FixedRng(0.5), noMetrics);

  assert.equal(candidates.length, 9);
  for (let potIdx = 0; potIdx < 3; potIdx++) {
    for (let handIdx = 0; handIdx < 3; handIdx++) {
      const c = candidates[potIdx * 3 + handIdx] as TradeCandidate;
      assert.equal(c.potIdx, potIdx);
      assert.equal(c.handIdx, handIdx);
      assert.equal(c.dangerScore, 0);
      assert.equal(c.pairs, 0);
      assert.equal(c.random, 0.5);
    }
  }

  // Swapping hand[0]=7c for pot[0]=Tc gives 8c+Tc = 18 clubs.
  const swap00 = candidates[0] as TradeCandidate;
  assert.equal(swap00.handScore, 18);
  // The pot then holds 7c, 7h, Kd -- no shared suit, so the highest
  // single-card sum (Kd=10) wins.
  assert.equal(swap00.potScore, 10);
});

const dangerCases: {
  name: string;
  hand: [string, string, string];
  pot: [string, string, string];
  potIdx: number;
  handIdx: number;
  wantDanger: number;
}[] = [
  {
    name: "5: resulting pot scores 31",
    hand: ["Ac", "7h", "8s"],
    pot: ["Kc", "Qc", "9d"],
    potIdx: 2,
    handIdx: 0,
    wantDanger: 5,
  },
  {
    name: "4: resulting pot is three aces (32)",
    hand: ["Ah", "7s", "8s"],
    pot: ["Ac", "Ad", "9d"],
    potIdx: 2,
    handIdx: 0,
    wantDanger: 4,
  },
  {
    name: "3: resulting pot is three of a non-ace rank (30.5)",
    hand: ["Kh", "7s", "8s"],
    pot: ["Kc", "Kd", "9d"],
    potIdx: 2,
    handIdx: 0,
    wantDanger: 3,
  },
  {
    name: "2: resulting pot scores >= 27 but isn't a special value",
    hand: ["Tc", "7h", "8s"],
    pot: ["9c", "8c", "9d"],
    potIdx: 2,
    handIdx: 0,
    wantDanger: 2,
  },
  {
    name: "1: card given to the pot is an Ace, no other tier applies",
    hand: ["Ah", "7d", "9s"],
    pot: ["7c", "8d", "9s"],
    potIdx: 0,
    handIdx: 0,
    wantDanger: 1,
  },
  {
    name: "0: no special consideration",
    hand: ["7c", "8d", "9s"],
    pot: ["7h", "8s", "9d"],
    potIdx: 0,
    handIdx: 0,
    wantDanger: 0,
  },
];

for (const c of dangerCases) {
  test(`tradeCandidates: dangerScore tier ${c.name}`, () => {
    const candidates = tradeCandidates(baseView({ hand: mustHand(...c.hand), pot: mustPot(...c.pot) }), new FixedRng(0.5), { danger: true, pairs: false });
    const found = candidates.find((cand) => cand.potIdx === c.potIdx && cand.handIdx === c.handIdx) as TradeCandidate;
    assert.equal(found.dangerScore, c.wantDanger);
  });
}

test("tradeCandidates: pairs is 1 when the resulting hand contains a pair, 0 otherwise", () => {
  const hand = mustHand("7c", "8d", "9s");
  const pot = mustPot("8h", "Qd", "Js");
  const candidates = tradeCandidates(baseView({ hand, pot }), new FixedRng(0.5), { danger: false, pairs: true });

  // Swapping hand[0]=7c for pot[0]=8h gives 8h,8d,9s -- a pair.
  const paired = candidates.find((c) => c.potIdx === 0 && c.handIdx === 0) as TradeCandidate;
  assert.equal(paired.pairs, 1);

  // Swapping hand[0]=7c for pot[1]=Qd gives Qd,8d,9s -- no pair.
  const unpaired = candidates.find((c) => c.potIdx === 1 && c.handIdx === 0) as TradeCandidate;
  assert.equal(unpaired.pairs, 0);
});

test("tradeCandidates: disabled metrics are forced to 0 even when the raw value would be non-zero", () => {
  const hand = mustHand("Ac", "7h", "8s");
  const pot = mustPot("Kc", "Qc", "9d");
  const candidates = tradeCandidates(baseView({ hand, pot }), new FixedRng(0.5), noMetrics);
  for (const c of candidates) {
    assert.equal(c.dangerScore, 0);
    assert.equal(c.pairs, 0);
    assert.equal(c.ace, 0);
  }
});

test("tradeCandidates: ace is 1 when the pot card taken is an Ace, 0 otherwise, only when enabled", () => {
  const hand = mustHand("7c", "8d", "9s");
  const pot = mustPot("Ah", "Qd", "Js");
  const disabled = tradeCandidates(baseView({ hand, pot }), new FixedRng(0.5), { danger: false, pairs: false });
  for (const c of disabled) {
    assert.equal(c.ace, 0);
  }

  const enabled = tradeCandidates(baseView({ hand, pot }), new FixedRng(0.5), { danger: false, pairs: false, ace: true });
  const takesAce = enabled.find((c) => c.potIdx === 0) as TradeCandidate;
  assert.equal(takesAce.ace, 1);
  const takesNonAce = enabled.find((c) => c.potIdx === 1) as TradeCandidate;
  assert.equal(takesNonAce.ace, 0);
});

const sortCases: {
  name: string;
  candidates: Partial<TradeCandidate>[];
  wantOrder: number[]; // expected order by index into candidates
}[] = [
  {
    name: "higher hand score sorts first",
    candidates: [{ handScore: 20 }, { handScore: 25 }],
    wantOrder: [1, 0],
  },
  {
    name: "lower danger score sorts first on a hand score tie, even if its pot score is worse",
    candidates: [
      { handScore: 20, dangerScore: 3, potScore: 5 },
      { handScore: 20, dangerScore: 1, potScore: 20 },
    ],
    wantOrder: [1, 0],
  },
  {
    name: "lower pot score sorts first on a hand/danger/pairs score tie",
    candidates: [
      { handScore: 20, potScore: 15 },
      { handScore: 20, potScore: 10 },
    ],
    wantOrder: [1, 0],
  },
  {
    name: "higher pairs sorts first on a hand/danger/pot score tie",
    candidates: [
      { handScore: 20, potScore: 10, pairs: 0 },
      { handScore: 20, potScore: 10, pairs: 1 },
    ],
    wantOrder: [1, 0],
  },
  {
    name: "higher pairs sorts first on a hand/danger score tie, even if its pot score is worse",
    candidates: [
      { handScore: 20, potScore: 10, pairs: 0 },
      { handScore: 20, potScore: 20, pairs: 1 },
    ],
    wantOrder: [1, 0],
  },
  {
    name: "higher random sorts first on every other tie",
    candidates: [
      { handScore: 20, potScore: 10, random: 0.2 },
      { handScore: 20, potScore: 10, random: 0.9 },
    ],
    wantOrder: [1, 0],
  },
];

for (const c of sortCases) {
  test(`sortCandidates: ${c.name}`, () => {
    const full: TradeCandidate[] = c.candidates.map((p, i) => ({
      potIdx: i,
      handIdx: i,
      handScore: 0,
      dangerScore: 0,
      potScore: 0,
      pairs: 0,
      ace: 0,
      random: 0,
      ...p,
    }));
    const sorted = sortCandidates(full);
    const gotOrder = sorted.map((s) => full.indexOf(s));
    assert.deepEqual(gotOrder, c.wantOrder);
  });
}

test("sortCandidates: preferAce off (default) leaves an ace difference with no effect", () => {
  const full: TradeCandidate[] = [
    { potIdx: 0, handIdx: 0, handScore: 20, dangerScore: 0, potScore: 15, pairs: 0, ace: 0, random: 0 },
    { potIdx: 1, handIdx: 1, handScore: 20, dangerScore: 0, potScore: 15, pairs: 0, ace: 1, random: 0 },
  ];
  const sorted = sortCandidates(full);
  // Pot score ties (both 15) and ace is ignored, so random (also tied
  // at 0) decides -- neither index is preferred over the other here,
  // this just confirms preferAce's default doesn't reorder by ace.
  assert.deepEqual(
    sorted.map((c) => c.ace),
    [0, 1],
  );
});

test("sortCandidates: preferAce true prefers taking an Ace on a hand/danger/pairs tie, even if its pot score is worse", () => {
  const full: TradeCandidate[] = [
    { potIdx: 0, handIdx: 0, handScore: 20, dangerScore: 0, potScore: 10, pairs: 0, ace: 0, random: 0 },
    { potIdx: 1, handIdx: 1, handScore: 20, dangerScore: 0, potScore: 20, pairs: 0, ace: 1, random: 0 },
  ];
  const sorted = sortCandidates(full, true);
  assert.equal(sorted[0]?.ace, 1);
});

test("sortCandidates: preferAce true still ranks an actual pair above an ace-denying non-pair", () => {
  const full: TradeCandidate[] = [
    { potIdx: 0, handIdx: 0, handScore: 20, dangerScore: 0, potScore: 20, pairs: 1, ace: 0, random: 0 },
    { potIdx: 1, handIdx: 1, handScore: 20, dangerScore: 0, potScore: 10, pairs: 0, ace: 1, random: 0 },
  ];
  const sorted = sortCandidates(full, true);
  assert.equal(sorted[0]?.pairs, 1);
});

const suitCases: { name: string; hand: [string, string, string]; want: boolean }[] = [
  { name: "three different suits", hand: ["7c", "8d", "9h"], want: true },
  { name: "two cards share a suit", hand: ["7c", "8c", "9h"], want: false },
  { name: "all three share a suit", hand: ["7c", "8c", "9c"], want: false },
];

for (const c of suitCases) {
  test(`allDifferentSuits: ${c.name}`, () => {
    assert.equal(allDifferentSuits(mustHand(...c.hand)), c.want);
  });
}

test("randInt stays within [lo, hi] inclusive across the full roll range", () => {
  for (const value of [0, 0.5, 0.999]) {
    const n = randInt(new FixedRng(value), 18, 20);
    assert.ok(n >= 18 && n <= 20, `${n} not in [18, 20]`);
  }
});

test("chance compares the roll against the probability", () => {
  assert.equal(chance(new FixedRng(0.1), 0.5), true);
  assert.equal(chance(new FixedRng(0.9), 0.5), false);
});

const excludeDangerousCases: { name: string; dangerScores: number[]; wantDangerScores: number[] }[] = [
  { name: "keeps every candidate below danger 4", dangerScores: [0, 1, 2, 3], wantDangerScores: [0, 1, 2, 3] },
  { name: "drops danger 5 and 4, keeps the rest", dangerScores: [5, 4, 3, 0], wantDangerScores: [3, 0] },
  { name: "all candidates danger 4/5 -- returns empty", dangerScores: [5, 4, 4, 5], wantDangerScores: [] },
];

for (const c of excludeDangerousCases) {
  test(`excludeDangerous: ${c.name}`, () => {
    const candidates: TradeCandidate[] = c.dangerScores.map((dangerScore, i) => ({
      potIdx: i,
      handIdx: i,
      handScore: 0,
      dangerScore,
      potScore: 0,
      pairs: 0,
      ace: 0,
      random: 0,
    }));
    const got = excludeDangerous(candidates).map((c) => c.dangerScore);
    assert.deepEqual(got, c.wantDangerScores);
  });
}

// A real 9-candidate deal can never be all danger 4/5 (at most one of
// a pot slot's three possible hand-card swaps can hit the exact rank
// needed), so forcedTradePool's fallback branch is only exercisable
// with a synthetic all-dangerous list like this one.
const forcedTradePoolCases: { name: string; dangerScores: number[]; wantPoolDangerScores: number[]; wantFellBack: boolean }[] = [
  { name: "some safe candidates -- pool excludes danger 4/5, no fallback", dangerScores: [5, 4, 3, 0], wantPoolDangerScores: [3, 0], wantFellBack: false },
  { name: "every candidate danger 4/5 -- falls back to the full list", dangerScores: [5, 4, 4, 5], wantPoolDangerScores: [5, 4, 4, 5], wantFellBack: true },
];

for (const c of forcedTradePoolCases) {
  test(`forcedTradePool: ${c.name}`, () => {
    const candidates: TradeCandidate[] = c.dangerScores.map((dangerScore, i) => ({
      potIdx: i,
      handIdx: i,
      handScore: 0,
      dangerScore,
      potScore: 0,
      pairs: 0,
      ace: 0,
      random: 0,
    }));
    const { pool, fellBack } = forcedTradePool(candidates);
    assert.deepEqual(
      pool.map((c) => c.dangerScore),
      c.wantPoolDangerScores,
    );
    assert.equal(fellBack, c.wantFellBack);
  });
}
