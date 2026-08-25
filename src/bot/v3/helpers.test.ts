import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCard } from "../../card/card.ts";
import type { Card } from "../../card/card.ts";
import { score } from "../../card/score.ts";
import { Rng } from "../../rng.ts";
import type { Hand, Pot, PlayerView, PublicTurn } from "../../game/types.ts";
import {
  allDifferentSuits,
  applyKnownCards,
  applyPublicTurn,
  bestImprovingSwap,
  bestSwaps,
  candidateSwaps,
  chooseFavorableByKnownHand,
  chooseFavorableBySuit,
  choosePairMaker,
  chooseSafeByKnownHand,
  chooseSafeBySuit,
  chooseSkeletonAction,
  dominantSuit,
  improvesKnownHand,
  NeighborTracker,
  partialScore,
  randInt,
  resultingScore,
  unnecessaryIndices,
} from "./helpers.ts";

// SequenceRng returns each of the given next() values in order, then
// keeps repeating the last one -- for asserting exactly which draws a
// call consumes (see the ranged-knockScore test below).
class SequenceRng extends Rng {
  private values: number[];
  private i = 0;
  constructor(values: number[]) {
    super(0);
    this.values = values;
  }
  next(): number {
    const v = this.values[Math.min(this.i, this.values.length - 1)] as number;
    this.i++;
    return v;
  }
}

function mustHand(...notation: [string, string, string]): Hand {
  return [parseCard(notation[0]), parseCard(notation[1]), parseCard(notation[2])];
}
function mustPot(...notation: [string, string, string]): Pot {
  return mustHand(...notation);
}
function mustCards(...notation: string[]): Card[] {
  return notation.map(parseCard);
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

function turn(seat: number, type: PublicTurn["type"], given: string[], taken: string[]): PublicTurn {
  return { seat, type, given: given.map(parseCard), taken: taken.map(parseCard) };
}

test("candidateSwaps enumerates all 9 swaps in pot-major/hand-minor order", () => {
  const v = baseView({});
  const swaps = candidateSwaps(v);
  assert.equal(swaps.length, 9);
  const order = swaps.map((s) => [s.potIdx, s.handIdx]);
  assert.deepEqual(order, [
    [0, 0],
    [0, 1],
    [0, 2],
    [1, 0],
    [1, 1],
    [1, 2],
    [2, 0],
    [2, 1],
    [2, 2],
  ]);
});

test("bestSwaps returns every swap tied for the max score", () => {
  const v = baseView({ hand: mustHand("7h", "7d", "7c"), pot: mustPot("7s", "7s", "7s") });
  const swaps = bestSwaps(v);
  assert.equal(swaps.length, 9);
  assert.ok(swaps.every((s) => s.score === 30.5));
});

test("bestImprovingSwap", () => {
  const cases: Array<{ name: string; hand: [string, string, string]; pot: [string, string, string]; wantUndefined: boolean }> = [
    { name: "pot has an improving ace", hand: ["7c", "8d", "9s"], pot: ["Ah", "Kh", "7d"], wantUndefined: false },
    { name: "no improving swap available", hand: ["Ah", "Kh", "Qh"], pot: ["7c", "8d", "9s"], wantUndefined: true },
  ];
  for (const { name, hand, pot, wantUndefined } of cases) {
    const h = mustHand(...hand);
    const p = mustPot(...pot);
    const v = baseView({ hand: h, pot: p });
    const got = bestImprovingSwap(v);
    assert.equal(got === undefined, wantUndefined, name);
    if (got) {
      const trial = [...h] as [Card, Card, Card];
      trial[got.handIdx] = p[got.potIdx] as Card;
      assert.ok(score(trial) > score(h), name);
    }
  }
});

test("bestImprovingSwap ties break to the lowest indices", () => {
  const v = baseView({ hand: mustHand("7c", "8d", "9s"), pot: mustPot("Ah", "Ad", "Ac") });
  const got = bestImprovingSwap(v);
  assert.ok(got);

  const current = score(v.hand);
  const improving = candidateSwaps(v).filter((s) => s.score > current);
  const best = Math.max(...improving.map((s) => s.score));
  const firstBest = improving.find((s) => s.score === best);
  assert.deepEqual(got, firstBest);
});

test("resultingScore", () => {
  const v = baseView({ hand: mustHand("7c", "8d", "9s"), pot: mustPot("Ac", "Kd", "Qs") });
  assert.equal(resultingScore(v, { type: "knock", potIndex: 0, handIndex: 0 }), score(v.hand));
  assert.equal(resultingScore(v, { type: "exchange", potIndex: 0, handIndex: 0 }), score(v.pot));
  assert.equal(resultingScore(v, { type: "trade", potIndex: 0, handIndex: 0 }), score(mustHand("Ac", "8d", "9s")));
});

test("unnecessaryIndices", () => {
  const cases: Array<{ name: string; hand: [string, string, string]; want: number[] }> = [
    { name: "one dominant suit, two unnecessary", hand: ["7c", "8d", "9s"], want: [0, 1] },
    { name: "all one suit, nothing unnecessary", hand: ["7c", "8c", "9c"], want: [] },
    { name: "same-rank trio, nothing unnecessary despite mixed suits", hand: ["7c", "7d", "7h"], want: [] },
    { name: "three different suits tied at equal value, nothing unnecessary", hand: ["Tc", "Jd", "Qh"], want: [] },
  ];
  for (const { name, hand, want } of cases) {
    assert.deepEqual(unnecessaryIndices(mustHand(...hand)), want, name);
  }
});

test("allDifferentSuits", () => {
  const cases: Array<{ name: string; hand: [string, string, string]; want: boolean }> = [
    { name: "three different suits", hand: ["7c", "8d", "9s"], want: true },
    { name: "two cards share a suit", hand: ["7c", "8c", "9s"], want: false },
    { name: "all three cards share a suit", hand: ["7c", "8c", "9c"], want: false },
  ];
  for (const { name, hand, want } of cases) {
    assert.equal(allDifferentSuits(mustHand(...hand)), want, name);
  }
});

test("choosePairMaker", () => {
  // Hand: 7c (unnecessary, clubs), 8d (unnecessary, diamonds), 9s
  // (necessary, spades -- the best-scoring suit). Pot's Td doesn't pair
  // anything; pot's 7h pairs the 7c if 8d is discarded.
  const v = baseView({ hand: mustHand("7c", "8d", "9s"), pot: mustPot("Td", "7h", "Qs") });
  const unnecessary = unnecessaryIndices(v.hand);
  assert.deepEqual(unnecessary, [0, 1]);

  const got = choosePairMaker(v, unnecessary);
  assert.deepEqual(got, { potIdx: 1, handIdx: 1 });
});

test("choosePairMaker returns undefined when nothing pairs", () => {
  const v = baseView({ hand: mustHand("7c", "8d", "9s"), pot: mustPot("Td", "Jh", "Qs") });
  assert.equal(choosePairMaker(v, unnecessaryIndices(v.hand)), undefined);
});

test("chooseFavorableBySuit", () => {
  const v = baseView({ hand: mustHand("7c", "8d", "9s"), pot: mustPot("Th", "Td", "Ts") });
  const unnecessary = unnecessaryIndices(v.hand);
  assert.deepEqual(unnecessary, [0, 1]);

  assert.equal(chooseFavorableBySuit(v, [], "h", undefined), undefined, "no unnecessary card: bullet doesn't apply");
  assert.equal(chooseFavorableBySuit(v, unnecessary, undefined, undefined), undefined, "collecting suit unknown: skip this case");

  const allHearts = baseView({ hand: v.hand, pot: mustPot("Th", "Kh", "Qh") });
  assert.equal(chooseFavorableBySuit(allHearts, unnecessary, "h", undefined), undefined, "every pot card matches the collecting suit");

  assert.deepEqual(
    chooseFavorableBySuit(v, unnecessary, "h", undefined),
    { potIdx: 1, handIdx: 0 },
    "lowest-index favorable pot card when nothing is more favorable",
  );
  assert.deepEqual(
    chooseFavorableBySuit(v, unnecessary, "h", "s"),
    { potIdx: 2, handIdx: 0 },
    "a more-favorable (discarded-suit) card wins even at a higher index",
  );
  assert.deepEqual(
    chooseFavorableBySuit(v, unnecessary, "h", "c"),
    { potIdx: 1, handIdx: 0 },
    "a discarded suit matching nothing favorable falls back to plain favorable",
  );
});

test("chooseSafeBySuit", () => {
  const v = baseView({ hand: mustHand("7c", "8d", "9s") });
  assert.equal(chooseSafeBySuit(v, undefined), undefined, "collecting suit unknown: skip this case");
  assert.equal(chooseSafeBySuit(v, "d"), 0, "lowest-index hand card not matching the collecting suit");

  const allClubs = baseView({ hand: mustHand("7c", "8c", "9c") });
  assert.equal(chooseSafeBySuit(allClubs, "c"), undefined, "every hand card matches the collecting suit");
});

test("chooseFavorableByKnownHand", () => {
  const v = baseView({ pot: mustPot("Ks", "7d", "9c") });
  const unnecessary = [0, 2];

  assert.equal(chooseFavorableByKnownHand(v, [], mustCards("7s")), undefined, "no unnecessary card: bullet doesn't apply");
  assert.equal(chooseFavorableByKnownHand(v, unnecessary, []), undefined, "no information: skip this case");

  // Ks and 9c would each improve a lone 7s; 7d ties it (does not
  // improve), so it's the only favorable pot card.
  assert.deepEqual(chooseFavorableByKnownHand(v, unnecessary, mustCards("7s")), { potIdx: 1, handIdx: 0 });
});

test("chooseSafeByKnownHand", () => {
  const v = baseView({ hand: mustHand("Ks", "7d", "9c") });

  assert.equal(chooseSafeByKnownHand(v, []), undefined, "no information: skip this case");
  // Same logic as chooseFavorableByKnownHand, applied to the hand: only
  // 7d ties (rather than improves) a lone known 7s.
  assert.equal(chooseSafeByKnownHand(v, mustCards("7s")), 1);
});

test("partialScore", () => {
  const cases: Array<{ name: string; cards: string[]; want: number }> = [
    { name: "no known cards", cards: [], want: 0 },
    { name: "one known card", cards: ["7s"], want: 7 },
    { name: "two known cards, same suit sums", cards: ["7s", "8s"], want: 15 },
    { name: "two known cards, different suits take the max", cards: ["7s", "8d"], want: 8 },
    { name: "three known cards uses real scoring (pair bonus)", cards: ["7s", "7d", "7h"], want: 30.5 },
  ];
  for (const { name, cards, want } of cases) {
    assert.equal(partialScore(mustCards(...cards)), want, name);
  }
});

test("improvesKnownHand", () => {
  const cases: Array<{ name: string; known: string[]; candidate: string; want: boolean }> = [
    { name: "no information: any card reads as an improvement", known: [], candidate: "7c", want: true },
    { name: "the example from specs/bots_v3.md: any spade improves a lone 7s", known: ["7s"], candidate: "Ks", want: true },
    { name: "a card that cannot beat the current partial score does not improve it", known: ["7s", "Ks"], candidate: "9c", want: false },
    { name: "fully-known hand: replacing the weakest card can still improve it", known: ["7s", "8s", "9s"], candidate: "Ts", want: true },
    { name: "fully-known hand: no replacement improves an already-strong hand", known: ["Ah", "Kh", "Qh"], candidate: "7c", want: false },
  ];
  for (const { name, known, candidate, want } of cases) {
    assert.equal(improvesKnownHand(mustCards(...known), parseCard(candidate)), want, name);
  }
});

test("dominantSuit", () => {
  assert.equal(dominantSuit(mustCards("7s")), "s");
  assert.equal(dominantSuit(mustCards("7s", "8s", "9d")), "s");
  assert.equal(dominantSuit(mustCards("7s", "7d")), "s", "ties break to the first suit encountered");
});

test("chooseSkeletonAction rolls a ranged knockScore once per turn and reuses it for every bullet that reads it", () => {
  // 7h/Th/Jh (27, hearts) has no improving swap against 7c/8d/9s, and
  // ties nothing recorded as best (default best score 0), so this
  // reaches the score-threshold-knock bullet with no rng draws
  // consumed in between beyond the mandatory knockLapRange roll and
  // the knockScore roll itself. Its score (27) sits at the range's low
  // end, so the assertion below only passes if the low-end roll from
  // the exchange-all bullet is reused rather than re-rolled.
  const hand = mustHand("7h", "Th", "Jh");
  const pot = mustPot("7c", "8d", "9s");
  const v = baseView({ hand, pot, lap: 1 });
  assert.equal(bestImprovingSwap(v), undefined);
  assert.equal(score(hand), 27);

  // Draw order: [0] feeds knockLapRange (irrelevant here -- lap 1 is
  // always below [25-30]); [1] feeds the ranged knockScore, resolving
  // to its low end (27) -- pot (score 9) is nowhere near it, so the
  // exchange-all bullet reads but doesn't act on this roll; [2] would
  // resolve to the range's high end (29) if drawn again -- present
  // only to catch a bug that re-rolls knockScore for the
  // score-threshold bullet instead of reusing [1]'s 27 (29 > 27 would
  // then fail the hand's score, falling through to a random trade).
  const rng = new SequenceRng([0, 0, 0.9]);
  const action = chooseSkeletonAction(
    v,
    rng,
    { blunderChance: 0, knockLapRange: [25, 30], bestScoreLapsAgoRange: [3, 5], knockScore: [27, 29] },
    { score: 0, lap: 0 },
  );
  assert.equal(action.type, "knock", "must reuse the 27 already rolled for the exchange-all bullet, not re-roll to 29");
});

test("randInt stays within [lo, hi] and lo === hi always returns lo", () => {
  const rng = new Rng(1234);
  for (let i = 0; i < 200; i++) {
    const n = randInt(rng, 18, 22);
    assert.ok(Number.isInteger(n) && n >= 18 && n <= 22);
  }
  assert.equal(randInt(rng, 5, 5), 5);
});

test("applyKnownCards replays a seat's known-held cards across trades and an exchange", () => {
  const steps: Array<{ name: string; turn: PublicTurn; want: string[] }> = [
    { name: "first trade reveals one card", turn: turn(1, "trade", ["7h"], ["Kd"]), want: ["Kd"] },
    { name: "re-trading the known card swaps it, count unchanged", turn: turn(1, "trade", ["Kd"], ["Qs"]), want: ["Qs"] },
    { name: "trading an unseen original card grows the known set", turn: turn(1, "trade", ["8h"], ["9c"]), want: ["Qs", "9c"] },
    {
      name: "an exchange fully reveals the hand regardless of prior knowledge",
      turn: turn(1, "exchange", ["Qs", "9c", "Th"], ["Ac", "Ad", "As"]),
      want: ["Ac", "Ad", "As"],
    },
  ];

  let known: Card[] = [];
  for (const { name, turn: t, want } of steps) {
    known = applyKnownCards(known, t);
    assert.deepEqual(known, want.map(parseCard), name);
  }
});

test("applyPublicTurn replays a seat's known-held cards (delegates to applyKnownCards)", () => {
  const held = new Map<number, Card[]>();
  applyPublicTurn(held, turn(1, "trade", ["7h"], ["Kd"]));
  applyPublicTurn(held, turn(2, "trade", ["7c"], ["Qh"]));
  assert.deepEqual(held.get(1), [parseCard("Kd")]);
  assert.deepEqual(held.get(2), [parseCard("Qh")]);
});

test("applyPublicTurn on a knock changes nothing", () => {
  const held = new Map<number, Card[]>([[1, [parseCard("Kd")]]]);
  applyPublicTurn(held, turn(1, "knock", [], []));
  assert.deepEqual(held.get(1), [parseCard("Kd")]);
});

// Seat 2 is the bot throughout these tests, in turn order 0, 1, 2, 3.
// setOwnSeat is called at the top of every simulated decide() (matching
// how the bots call it), and every turn -- including the bot's own --
// is observe()'d afterward (matching round.ts broadcasting every turn
// to every strategy, itself included).

test("NeighborTracker discovers downstream live, and upstream only once decide() runs for the turn that needs it", () => {
  const events: string[] = [];
  const t = new NeighborTracker();
  t.configure(
    (turn) => events.push(`up:${turn.seat}`),
    (turn) => events.push(`down:${turn.seat}`),
  );

  t.setOwnSeat(2); // own turn 1: nothing observed yet, nothing to discover
  assert.equal(t.upstreamSeat, undefined);
  t.observe(turn(2, "trade", ["8h"], ["9c"])); // broadcast of our own turn 1

  t.observe(turn(3, "trade", ["Jc"], ["Tc"])); // seat 3, right after us
  assert.equal(t.downstreamSeat, 3, "discovered live, no decide() needed for it");
  assert.deepEqual(events, ["down:3"]);

  t.observe(turn(0, "trade", ["7h"], ["Kd"]));
  t.observe(turn(1, "trade", ["7c"], ["Qh"])); // seat 1, right before our turn 2
  assert.equal(t.upstreamSeat, undefined, "not discovered yet -- decide() for turn 2 hasn't run");

  t.setOwnSeat(2); // own turn 2: seat 1 was the last thing observed
  assert.equal(t.upstreamSeat, 1);
  assert.deepEqual(events, ["down:3", "up:1"], "available in time to inform this decision, not the next one");

  events.length = 0;
  t.observe(turn(2, "trade", ["8h"], ["9c"])); // broadcast of our own turn 2
  t.observe(turn(3, "trade", ["9c"], ["9d"]));
  t.observe(turn(0, "trade", ["7d"], ["8d"]));
  t.observe(turn(1, "trade", ["9d"], ["Td"])); // seat 1 again -- live update, no re-discovery
  assert.deepEqual(events, ["down:3", "up:1"], "neighbors' later turns keep firing live");
});

test("NeighborTracker: bot acting first in the round has no upstream until its second turn", () => {
  const t = new NeighborTracker();
  t.configure(
    () => {},
    () => {},
  );

  t.setOwnSeat(0); // own turn 1, nothing observed yet: nothing to discover
  assert.equal(t.upstreamSeat, undefined);
  t.observe(turn(0, "knock", [], []));

  t.observe(turn(1, "trade", ["7h"], ["Kd"]));
  assert.equal(t.downstreamSeat, 1, "downstream doesn't need a decide() call to be discovered");
  assert.equal(t.upstreamSeat, undefined, "still not discovered -- our turn 2 hasn't been decided yet");
});

test("NeighborTracker: sparse seats (an eliminated seat missing) are handled by the live sequence alone", () => {
  const t = new NeighborTracker();
  t.configure(
    () => {},
    () => {},
  );
  t.setOwnSeat(2);
  t.observe(turn(2, "trade", ["8h"], ["9c"]));

  // Seat 1 is eliminated: the round's turn order is 0, 2, 3, 0, 2, 3, ...
  t.observe(turn(3, "trade", ["Jc"], ["Tc"]));
  assert.equal(t.downstreamSeat, 3);

  t.observe(turn(0, "trade", ["7h"], ["Kd"]));
  t.setOwnSeat(2); // own turn 2
  assert.equal(t.upstreamSeat, 0);
});

test("NeighborTracker.reset clears adjacency and history but keeps own seat and configured callbacks", () => {
  const events: string[] = [];
  const t = new NeighborTracker();
  t.configure(
    (turn) => events.push(`up:${turn.seat}`),
    () => {},
  );
  t.setOwnSeat(2);
  t.observe(turn(2, "trade", ["8h"], ["9c"]));
  t.observe(turn(1, "trade", ["7h"], ["Kd"]));
  t.setOwnSeat(2);
  assert.equal(t.upstreamSeat, 1);

  t.reset();
  assert.equal(t.upstreamSeat, undefined);
  assert.equal(t.downstreamSeat, undefined);

  // Re-discovery works after reset, without calling configure again.
  events.length = 0;
  t.observe(turn(2, "trade", ["8h"], ["9c"]));
  t.observe(turn(3, "trade", ["7c"], ["Qh"]));
  t.setOwnSeat(2);
  assert.equal(t.upstreamSeat, 3);
  assert.deepEqual(events, ["up:3"]);
});

test("NeighborTracker.snapshot/restore round-trips discovered adjacency and turn history", () => {
  const events: string[] = [];
  const source = new NeighborTracker();
  source.configure(
    (t) => events.push(`up:${t.seat}`),
    (t) => events.push(`down:${t.seat}`),
  );
  source.setOwnSeat(2);
  source.observe(turn(2, "trade", ["8h"], ["9c"]));
  source.observe(turn(3, "trade", ["Jc"], ["Tc"]));
  source.observe(turn(1, "trade", ["7c"], ["Qh"]));
  source.setOwnSeat(2);
  assert.equal(source.upstreamSeat, 1);
  assert.equal(source.downstreamSeat, 3);

  const snap = source.snapshot();
  const restored = new NeighborTracker();
  restored.configure(
    (t) => events.push(`restored-up:${t.seat}`),
    (t) => events.push(`restored-down:${t.seat}`),
  );
  restored.restore(snap);
  assert.equal(restored.upstreamSeat, 1);
  assert.equal(restored.downstreamSeat, 3);

  // restore() only carries over adjacency/history, not the private
  // own-seat state setOwnSeat() manages -- exactly like a real bot
  // rebuilt from memory, whose very next decide() calls setOwnSeat()
  // again before relying on observe() (src/bot/advanced.ts,
  // src/bot/expert.ts both do this every decide()).
  restored.setOwnSeat(2);

  // Live updates keep firing after restore, same as before it.
  events.length = 0;
  restored.observe(turn(1, "trade", ["9d"], ["Td"]));
  restored.observe(turn(3, "trade", ["9c"], ["9d"]));
  assert.deepEqual(events, ["restored-up:1", "restored-down:3"]);
});
