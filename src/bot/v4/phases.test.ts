import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCard } from "../../card/card.ts";
import { score } from "../../card/score.ts";
import { exchange, knock, trade, type Hand, type PlayerView, type Pot } from "../../game/types.ts";
import { Rng } from "../../rng.ts";
import type { CandidateMetrics } from "./candidates.ts";
import {
  alwaysKnockPhase,
  discardPhase,
  handSelectionPhase,
  improveHandPhase,
  knockPhase,
  mistakePhase,
  resultingScore,
  updateBestScore,
  type BestScoreState,
} from "./phases.ts";
import type { Trace } from "./trace.ts";

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

test("mistakePhase rolls chance against mistakeChance", () => {
  assert.equal(mistakePhase(new FixedRng(0.1), 0.5), true);
  assert.equal(mistakePhase(new FixedRng(0.9), 0.5), false);
  assert.equal(mistakePhase(new FixedRng(0.1), 0), false);
});

const handSelectionCases: {
  name: string;
  hand: [string, string, string];
  mistake: boolean;
  skillRule: (hand: Hand, rng: Rng) => boolean;
  wantType: "exchange" | "knock";
}[] = [
  {
    name: "no mistake, skill rule says exchange",
    hand: ["7c", "8d", "9s"],
    mistake: false,
    skillRule: () => true,
    wantType: "exchange",
  },
  {
    name: "no mistake, skill rule says keep",
    hand: ["7c", "8d", "9s"],
    mistake: false,
    skillRule: () => false,
    wantType: "knock",
  },
  {
    name: "mistake overrides skill rule: expert would keep (shared suits), so mistake exchanges",
    hand: ["7c", "8c", "9s"],
    mistake: true,
    skillRule: () => false,
    wantType: "exchange",
  },
  {
    name: "mistake overrides skill rule: expert would exchange (all different suits), so mistake keeps",
    hand: ["7c", "8d", "9s"],
    mistake: true,
    skillRule: () => true,
    wantType: "knock",
  },
];

for (const c of handSelectionCases) {
  test(`handSelectionPhase: ${c.name}`, () => {
    const v = baseView({ hand: mustHand(...c.hand), isFirstTurnOfRound: true });
    const action = handSelectionPhase(v, c.mistake, new FixedRng(0.5), c.skillRule);
    assert.equal(action.type, c.wantType);
  });
}

test("improveHandPhase: no candidate improves the hand and the pot doesn't beat it -- no action", () => {
  // Hand is already 30.5 (three 9s); nothing in the pot can beat that,
  // and the pot itself scores far lower.
  const v = baseView({ hand: mustHand("9c", "9d", "9s"), pot: mustPot("7c", "8d", "Th") });
  assert.equal(improveHandPhase(v, new FixedRng(0.5), 27, noMetrics), undefined);
});

test("improveHandPhase: trades into the best improving candidate", () => {
  // Hand: 7c 8c 9s (clubs sum 15). Pot's Tc replacing 9s makes 7c+8c+Tc
  // = 25 clubs, the best of every improving swap (verified by hand:
  // the only other candidate tied at 25 is Kd replacing 9s, and this
  // one sorts first as it's generated first and all else ties).
  const v = baseView({ hand: mustHand("7c", "8c", "9s"), pot: mustPot("Tc", "7h", "Kd") });
  const action = improveHandPhase(v, new FixedRng(0.5), 27, noMetrics);
  assert.equal(action?.type, "trade");
  if (action?.type === "trade") {
    assert.equal(action.potIndex, 0);
    assert.equal(action.handIndex, 2);
  }
});

test("improveHandPhase: exchanges the whole pot when it's at or above the given threshold", () => {
  // Pot scores 30 (7+8+... ) all clubs, well above the 27 threshold
  // and above the hand's own low score and any single-card swap.
  const v = baseView({ hand: mustHand("7d", "8h", "9s"), pot: mustPot("Tc", "Jc", "Qc") });
  const action = improveHandPhase(v, new FixedRng(0.5), 27, noMetrics);
  assert.equal(action?.type, "exchange");
});

test("improveHandPhase: pot beats the hand but isn't eligible (below the given threshold) -- falls back to trading", () => {
  const v = baseView({ hand: mustHand("7d", "8h", "9s"), pot: mustPot("Tc", "7c", "Qd") });
  const potScore = score(mustPot("Tc", "7c", "Qd"));
  assert.ok(potScore < 27, `test setup: expected pot score < 27, got ${potScore}`);
  const action = improveHandPhase(v, new FixedRng(0.5), 27, noMetrics);
  assert.equal(action?.type, "trade");
});

test("improveHandPhase: pot at 27 is eligible for advanced's threshold but not novice's", () => {
  const v = baseView({ hand: mustHand("7d", "8h", "9s"), pot: mustPot("9c", "8c", "Tc") });
  const potScore = score(mustPot("9c", "8c", "Tc"));
  assert.equal(potScore, 27, `test setup: expected pot score of exactly 27, got ${potScore}`);
  assert.equal(improveHandPhase(v, new FixedRng(0.5), 27, noMetrics)?.type, "exchange");
  assert.equal(improveHandPhase(v, new FixedRng(0.5), 28, noMetrics)?.type, "trade");
});

test("improveHandPhase: skipped mode falls through without evaluating anything", () => {
  // Fixture that would normally exchange for the pot -- skipped mode
  // must not take that or any other action.
  const v = baseView({ hand: mustHand("7d", "8h", "9s"), pot: mustPot("Tc", "Jc", "Qc") });
  assert.equal(improveHandPhase(v, new FixedRng(0.5), 27, noMetrics, "skipped"), undefined);
});

test("improveHandPhase: mistake mode ignores pot exchange and picks by rng index among improving candidates", () => {
  // Pot (30, all clubs) would win the pot-exchange check under normal
  // mode; mistake mode must ignore that path entirely.
  const v = baseView({ hand: mustHand("7d", "8h", "9s"), pot: mustPot("Tc", "Jc", "Qc") });
  const action = improveHandPhase(v, new FixedRng(0.999), 27, noMetrics, "mistake");
  assert.equal(action?.type, "trade");
});

test("improveHandPhase: mistake mode's rng draw can pick a different candidate than the top-sorted one", () => {
  // Same fixture as "trades into the best improving candidate" above,
  // where the best candidate is known: potIdx 0, handIdx 2.
  const v = baseView({ hand: mustHand("7c", "8c", "9s"), pot: mustPot("Tc", "7h", "Kd") });
  const top = improveHandPhase(v, new FixedRng(0), 27, noMetrics, "mistake");
  assert.equal(top?.type, "trade");
  if (top?.type === "trade") {
    assert.equal(top.potIndex, 0);
    assert.equal(top.handIndex, 2);
  }
  const other = improveHandPhase(v, new FixedRng(0.999), 27, noMetrics, "mistake");
  assert.equal(other?.type, "trade");
  if (other?.type === "trade" && top?.type === "trade") {
    assert.ok(other.potIndex !== top.potIndex || other.handIndex !== top.handIndex, "a different rng draw should be able to pick a different candidate than the top one");
  }
});

test("improveHandPhase: mistake mode with no improving candidate falls through same as normal", () => {
  const v = baseView({ hand: mustHand("9c", "9d", "9s"), pot: mustPot("7c", "8d", "Th") });
  assert.equal(improveHandPhase(v, new FixedRng(0.5), 27, noMetrics, "mistake"), undefined);
});

// Heads Up danger-4/5 exclusion (specs/bots_v4.md's Heads Up section).
// Fixture: hand As/9c/Ac (score 21), pot Ks/Js/Qc. The single best
// improving candidate trades As for Qc, making the hand all clubs
// (score 30) -- but it leaves the pot Ks/Js/As, all spades summing to
// 31 (danger 5). The next-best improving candidate (danger 0) trades
// 9c for Ks, making the hand As/Ks/Ac (score 21).
const dangerousTopFixture = { hand: mustHand("As", "9c", "Ac"), pot: mustPot("Ks", "Js", "Qc") } as const;
const dangerMetrics: CandidateMetrics = { danger: true, pairs: false };
const expertMetrics: CandidateMetrics = { danger: true, pairs: true };

test("improveHandPhase: without headsUp, trades into the top candidate even though it's danger 5", () => {
  const v = baseView(dangerousTopFixture);
  const action = improveHandPhase(v, new FixedRng(0.5), 99, dangerMetrics);
  assert.equal(action?.type, "trade");
  if (action?.type === "trade") {
    assert.equal(action.potIndex, 2);
    assert.equal(action.handIndex, 0);
  }
});

test("improveHandPhase: headsUp excludes the danger 5 top candidate, trading into the next-best safe one", () => {
  const v = baseView(dangerousTopFixture);
  const action = improveHandPhase(v, new FixedRng(0.5), 99, dangerMetrics, "normal", undefined, true);
  assert.equal(action?.type, "trade");
  if (action?.type === "trade") {
    assert.equal(action.potIndex, 0);
    assert.equal(action.handIndex, 1);
  }
});

test("improveHandPhase: headsUp mistake mode never draws the excluded danger 5 candidate", () => {
  const v = baseView(dangerousTopFixture);
  for (const roll of [0, 0.25, 0.5, 0.75, 0.999]) {
    const action = improveHandPhase(v, new FixedRng(roll), 99, dangerMetrics, "mistake", undefined, true);
    assert.equal(action?.type, "trade");
    if (action?.type === "trade") {
      assert.ok(!(action.potIndex === 2 && action.handIndex === 0), `roll ${roll} picked the excluded danger 5 candidate`);
    }
  }
});

test("improveHandPhase: headsUp falls through when the only improving candidate is danger 5", () => {
  // Fixture: hand Ts/Qd/As (score 21), pot Ad/Qs/Jd. The only
  // improving candidate trades Qd for Qs, making the hand all spades
  // (score 31) -- but it leaves the pot Ad/Qd/Jd, all diamonds
  // summing to 31 (danger 5).
  const v = baseView({ hand: mustHand("Ts", "Qd", "As"), pot: mustPot("Ad", "Qs", "Jd") });
  const withoutHeadsUp = improveHandPhase(v, new FixedRng(0.5), 99, dangerMetrics);
  assert.equal(withoutHeadsUp?.type, "trade");
  const withHeadsUp = improveHandPhase(v, new FixedRng(0.5), 99, dangerMetrics, "normal", undefined, true);
  assert.equal(withHeadsUp, undefined);
});

const knockCases: {
  name: string;
  hand?: [string, string, string];
  best?: BestScoreState;
  knockRepeatThreshold?: number;
  knockScoreThreshold?: number;
  lap?: number;
  failsafeLap?: number;
  wantAction: boolean;
}[] = [
  { name: "below every threshold: no action", wantAction: false },
  { name: "repeat counter at threshold: knock", best: { score: 9, repeatCount: 2 }, knockRepeatThreshold: 2, wantAction: true },
  { name: "repeat counter below threshold: no action", best: { score: 9, repeatCount: 1 }, knockRepeatThreshold: 2, wantAction: false },
  { name: "hand score at threshold: knock", hand: ["7c", "Tc", "Jc"], knockScoreThreshold: 27, wantAction: true },
  { name: "hand score below threshold: no action", knockScoreThreshold: 27, wantAction: false },
  { name: "failsafe lap reached: knock", lap: 13, failsafeLap: 13, wantAction: true },
  { name: "failsafe lap not yet reached: no action", lap: 12, failsafeLap: 13, wantAction: false },
];

for (const c of knockCases) {
  test(`knockPhase: ${c.name}`, () => {
    const v = baseView({ hand: mustHand(...(c.hand ?? ["7c", "8d", "9s"])), lap: c.lap ?? 1 });
    const action = knockPhase(v, c.best ?? { score: 0, repeatCount: 0 }, c.knockRepeatThreshold ?? 99, c.knockScoreThreshold ?? 99, c.failsafeLap ?? 99);
    if (c.wantAction) {
      assert.equal(action?.type, "knock");
    } else {
      assert.equal(action, undefined);
    }
  });
}

test("knockPhase: skipped mode falls through even when every threshold is met", () => {
  const v = baseView({ hand: mustHand("7c", "Tc", "Jc"), lap: 13 });
  const action = knockPhase(v, { score: 9, repeatCount: 5 }, 2, 27, 13, "skipped");
  assert.equal(action, undefined);
});

test("knockPhase: mistake mode never knocks even when every threshold is met", () => {
  const v = baseView({ hand: mustHand("7c", "Tc", "Jc"), lap: 13 });
  const action = knockPhase(v, { score: 9, repeatCount: 5 }, 2, 27, 13, "mistake");
  assert.equal(action, undefined);
});

const resultingScoreCases: { name: string; hand: [string, string, string]; pot: [string, string, string]; action: "knock" | "exchange" | "trade"; potIdx?: number; handIdx?: number; want: number }[] = [
  { name: "knock leaves the hand's own score untouched", hand: ["7c", "8d", "9s"], pot: ["Kc", "Qd", "Js"], action: "knock", want: 9 },
  { name: "exchange resolves to the pot's score", hand: ["7c", "8d", "9s"], pot: ["Tc", "Jc", "Qc"], action: "exchange", want: 30 },
  { name: "trade swaps a single card before scoring", hand: ["7c", "8c", "9s"], pot: ["Tc", "7h", "Kd"], action: "trade", potIdx: 0, handIdx: 2, want: 25 },
];

for (const c of resultingScoreCases) {
  test(`resultingScore: ${c.name}`, () => {
    const v = baseView({ hand: mustHand(...c.hand), pot: mustPot(...c.pot) });
    const action = c.action === "knock" ? knock() : c.action === "exchange" ? exchange() : trade(c.potIdx as number, c.handIdx as number);
    assert.equal(resultingScore(v, action), c.want);
  });
}

const updateBestScoreCases: { name: string; best: BestScoreState; newScore: number; want: BestScoreState }[] = [
  { name: "a new best resets the repeat counter to zero", best: { score: 9, repeatCount: 3 }, newScore: 12, want: { score: 12, repeatCount: 0 } },
  { name: "tying the best increments the repeat counter", best: { score: 12, repeatCount: 0 }, newScore: 12, want: { score: 12, repeatCount: 1 } },
  { name: "falling below the best leaves both untouched", best: { score: 12, repeatCount: 1 }, newScore: 9, want: { score: 12, repeatCount: 1 } },
];

for (const c of updateBestScoreCases) {
  test(`updateBestScore: ${c.name}`, () => {
    assert.deepEqual(updateBestScore(c.best, c.newScore), c.want);
  });
}

test("alwaysKnockPhase always knocks", () => {
  assert.equal(alwaysKnockPhase().type, "knock");
});

test("discardPhase always returns a forced trade for the topmost candidate", () => {
  const v = baseView({ hand: mustHand("9c", "9d", "9s"), pot: mustPot("7c", "8d", "Th") });
  const action = discardPhase(v, new FixedRng(0.5), noMetrics);
  assert.equal(action.type, "trade");
});

test("discardPhase: mistake mode's rng draw can pick a candidate other than the topmost one", () => {
  const v = baseView({ hand: mustHand("7c", "8d", "9s"), pot: mustPot("Kc", "Qd", "Js") });
  const top = discardPhase(v, new FixedRng(0.5), noMetrics);
  const topMistake = discardPhase(v, new FixedRng(0), noMetrics, "mistake");
  assert.deepEqual(topMistake, top, "an rng draw of 0 selects the same topmost candidate as normal mode");
  const other = discardPhase(v, new FixedRng(0.999), noMetrics, "mistake");
  assert.ok(other.potIndex !== top.potIndex || other.handIndex !== top.handIndex, "a different rng draw should be able to pick a different candidate than the top one");
});

test("discardPhase: without headsUp, picks the top candidate even though it's danger 5", () => {
  const v = baseView(dangerousTopFixture);
  const action = discardPhase(v, new FixedRng(0.5), dangerMetrics);
  assert.equal(action.potIndex, 2);
  assert.equal(action.handIndex, 0);
});

test("discardPhase: headsUp excludes the danger 5 top candidate, picking the next-best safe one", () => {
  const v = baseView(dangerousTopFixture);
  const action = discardPhase(v, new FixedRng(0.5), dangerMetrics, "normal", undefined, true);
  assert.equal(action.potIndex, 0);
  assert.equal(action.handIndex, 1);
});

test("discardPhase: headsUp mistake mode never draws the excluded danger 5 candidate", () => {
  const v = baseView(dangerousTopFixture);
  for (const roll of [0, 0.25, 0.5, 0.75, 0.999]) {
    const action = discardPhase(v, new FixedRng(roll), dangerMetrics, "mistake", undefined, true);
    assert.ok(!(action.potIndex === 2 && action.handIndex === 0), `roll ${roll} picked the excluded danger 5 candidate`);
  }
});

// Pairs-before-pot-score (specs/bots_v4.md's Trade Candidates order).
// Hand As/Ks/Qh scores 21 (As+Ks spades); Kc/Jd/Th are all off-suit
// from spades, so every trade discarding Qh ties at 21 -- none of the
// 9 trades improve the hand, forcing this into Discard. Among the
// three ties (all danger 0, since Qh isn't an Ace and no resulting
// pot hits a danger tier), taking Kc pairs with Ks (a live shot at
// 30.5) even though it leaves a worse pot (20, Qh+Th hearts) than
// taking Th would (10, all different suits).
test("discardPhase: pairs beats a lower pot score when every candidate ties on hand score and danger", () => {
  const v = baseView({ hand: mustHand("As", "Ks", "Qh"), pot: mustPot("Kc", "Jd", "Th") });
  const action = discardPhase(v, new FixedRng(0.5), expertMetrics);
  assert.equal(action.potIndex, 0, "should take Kc, not the safer-potscore Th");
  assert.equal(action.handIndex, 2, "should discard Qh, the card not part of the spade pair");
});

// Decision Logging (specs/bots_v4.md): each phase's trace has exactly
// one acted=true entry (the one whose phase produced the returned
// action), and every entry names that same phase -- except Mistake,
// which never acts on its own.
test("mistakePhase records a non-acting Mistake entry either way", () => {
  for (const mistake of [true, false]) {
    const trace: Trace = [];
    mistakePhase(new FixedRng(mistake ? 0.1 : 0.9), 0.5, trace);
    assert.equal(trace.length, 1);
    assert.equal(trace[0]?.phase, "Mistake");
    assert.equal(trace[0]?.acted, false);
  }
});

test("handSelectionPhase records exactly one acted Hand Selection entry", () => {
  const trace: Trace = [];
  const v = baseView({ hand: mustHand("7c", "8d", "9s"), isFirstTurnOfRound: true });
  handSelectionPhase(v, false, new FixedRng(0.5), () => true, trace);
  assert.equal(trace.length, 1);
  assert.equal(trace[0]?.phase, "Hand Selection");
  assert.equal(trace[0]?.acted, true);
  assert.ok(trace[0]?.summary);
});

const improveHandTraceCases: { name: string; hand: [string, string, string]; pot: [string, string, string]; wantActedPhase: string | undefined; wantHasCandidateLines: boolean }[] = [
  {
    name: "no improvement: falls through with a non-acting entry, no candidate lines",
    hand: ["9c", "9d", "9s"],
    pot: ["7c", "8d", "Th"],
    wantActedPhase: undefined,
    wantHasCandidateLines: false,
  },
  {
    name: "trades into the best candidate: acted entry plus ranked candidate lines",
    hand: ["7c", "8c", "9s"],
    pot: ["Tc", "7h", "Kd"],
    wantActedPhase: "Improve Hand",
    wantHasCandidateLines: true,
  },
  {
    name: "exchanges the pot: acted entry, no candidate lines needed",
    hand: ["7d", "8h", "9s"],
    pot: ["Tc", "Jc", "Qc"],
    wantActedPhase: "Improve Hand",
    wantHasCandidateLines: false,
  },
];

for (const c of improveHandTraceCases) {
  test(`improveHandPhase trace: ${c.name}`, () => {
    const trace: Trace = [];
    const v = baseView({ hand: mustHand(...c.hand), pot: mustPot(...c.pot) });
    improveHandPhase(v, new FixedRng(0.5), 27, noMetrics, "normal", trace);
    assert.ok(trace.every((e) => e.phase === "Improve Hand"));
    const acted = trace.filter((e) => e.acted);
    assert.equal(acted.length, c.wantActedPhase === undefined ? 0 : 1);
    if (c.wantActedPhase !== undefined) {
      assert.equal(acted[0]?.phase, c.wantActedPhase);
    }
    assert.equal(
      trace.some((e) => e.detail.startsWith("  [")),
      c.wantHasCandidateLines,
    );
  });
}

test("knockPhase records a non-acting entry when nothing triggers, an acted entry when knocking", () => {
  const v = baseView({ hand: mustHand("7c", "8d", "9s"), lap: 1 });
  const noAction: Trace = [];
  knockPhase(v, { score: 0, repeatCount: 0 }, 99, 99, 99, "normal", noAction);
  assert.equal(noAction.length, 1);
  assert.equal(noAction[0]?.acted, false);

  const knocks: Trace = [];
  knockPhase(v, { score: 9, repeatCount: 2 }, 2, 99, 99, "normal", knocks);
  assert.equal(knocks.length, 1);
  assert.equal(knocks[0]?.phase, "Knock");
  assert.equal(knocks[0]?.acted, true);
});

test("alwaysKnockPhase records exactly one acted Always Knock entry", () => {
  const trace: Trace = [];
  alwaysKnockPhase(trace);
  assert.deepEqual(trace.length, 1);
  assert.equal(trace[0]?.phase, "Always Knock");
  assert.equal(trace[0]?.acted, true);
});

test("discardPhase records every candidate ranked, plus one acted entry", () => {
  const trace: Trace = [];
  const v = baseView({ hand: mustHand("9c", "9d", "9s"), pot: mustPot("7c", "8d", "Th") });
  discardPhase(v, new FixedRng(0.5), noMetrics, "normal", trace);
  assert.ok(trace.every((e) => e.phase === "Discard"));
  // 9 candidates plus the "candidates ranked --" header and the final
  // acted "trades..." line.
  assert.equal(trace.length, 11);
  assert.equal(trace.filter((e) => e.acted).length, 1);
});

// Decision Logging: forced-skip and mistake-site entries (specs/
// bots_v4.md's Mistake section and its updated Decision Logging
// example).
test("improveHandPhase: skipped mode records a single non-acting entry naming the skip", () => {
  const trace: Trace = [];
  const v = baseView({ hand: mustHand("7d", "8h", "9s"), pot: mustPot("Tc", "Jc", "Qc") });
  improveHandPhase(v, new FixedRng(0.5), 27, noMetrics, "skipped", trace);
  assert.equal(trace.length, 1);
  assert.equal(trace[0]?.acted, false);
  assert.ok(trace[0]?.detail.startsWith("skipped"));
});

test("knockPhase: skipped mode records a single non-acting entry naming the skip", () => {
  const trace: Trace = [];
  const v = baseView({ hand: mustHand("7c", "Tc", "Jc"), lap: 13 });
  knockPhase(v, { score: 9, repeatCount: 5 }, 2, 27, 13, "skipped", trace);
  assert.equal(trace.length, 1);
  assert.equal(trace[0]?.acted, false);
  assert.ok(trace[0]?.detail.startsWith("skipped"));
});

test("knockPhase: mistake mode records a non-acting entry (it never itself knocks)", () => {
  const trace: Trace = [];
  const v = baseView({ hand: mustHand("7c", "Tc", "Jc"), lap: 13 });
  knockPhase(v, { score: 9, repeatCount: 5 }, 2, 27, 13, "mistake", trace);
  assert.equal(trace.length, 1);
  assert.equal(trace[0]?.acted, false);
  assert.equal(trace[0]?.detail, "mistake -- fails to knock");
});

test("improveHandPhase: mistake mode's acted entry names the mistake in Full Trace detail but not in the Summary text", () => {
  const trace: Trace = [];
  const v = baseView({ hand: mustHand("7c", "8c", "9s"), pot: mustPot("Tc", "7h", "Kd") });
  improveHandPhase(v, new FixedRng(0.999), 27, noMetrics, "mistake", trace);
  const acted = trace.find((e) => e.acted);
  assert.ok(acted?.detail.startsWith("mistake --"));
  assert.ok(!acted?.summary?.startsWith("mistake"));
});

test("discardPhase: mistake mode's acted entry names the mistake in Full Trace detail but not in the Summary text", () => {
  const trace: Trace = [];
  const v = baseView({ hand: mustHand("7c", "8d", "9s"), pot: mustPot("Kc", "Qd", "Js") });
  discardPhase(v, new FixedRng(0.999), noMetrics, "mistake", trace);
  const acted = trace.find((e) => e.acted);
  assert.ok(acted?.detail.startsWith("mistake --"));
  assert.ok(!acted?.summary?.startsWith("mistake"));
});

// Heads Up's exception to Decision Logging's "only list survivors"
// rule: a danger 4/5 candidate is still listed, flagged as excluded,
// even though it's dropped from the pool that's actually picked from
// (specs/bots_v4.md's Decision Logging, Full Trace).
test("improveHandPhase: headsUp Full Trace lists the excluded danger 5 candidate, flagged", () => {
  const trace: Trace = [];
  const v = baseView(dangerousTopFixture);
  improveHandPhase(v, new FixedRng(0.5), 99, dangerMetrics, "normal", trace, true);
  const excludedLine = trace.find((e) => e.detail.includes("danger 5"));
  assert.ok(excludedLine, "expected a logged line for the danger 5 candidate");
  assert.ok(excludedLine?.detail.includes("excluded"));
  const chosenLine = trace.find((e) => e.detail.includes("danger 0") && e.detail.startsWith("  ["));
  assert.ok(chosenLine, "expected a logged line for a safe candidate");
  assert.ok(!chosenLine?.detail.includes("excluded"));
});

test("discardPhase: headsUp Full Trace lists the excluded danger 5 candidate, flagged", () => {
  const trace: Trace = [];
  const v = baseView(dangerousTopFixture);
  discardPhase(v, new FixedRng(0.5), dangerMetrics, "normal", trace, true);
  const excludedLine = trace.find((e) => e.detail.includes("danger 5"));
  assert.ok(excludedLine, "expected a logged line for the danger 5 candidate");
  assert.ok(excludedLine?.detail.includes("excluded"));
});
