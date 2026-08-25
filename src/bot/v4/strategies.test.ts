import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCard } from "../../card/card.ts";
import type { Hand, PlayerView, Pot } from "../../game/types.ts";
import { Rng } from "../../rng.ts";
import type { BestScoreState } from "./phases.ts";
import { decideV4, SKILL_CONFIGS } from "./strategies.ts";
import type { Trace } from "./trace.ts";

// noRepeat/farFailsafeLap keep the Knock phase's repeat-counter and
// failsafe-lap bullets from firing unexpectedly in tests that aren't
// exercising them.
const noRepeat: BestScoreState = { score: 0, repeatCount: 0 };
const farFailsafeLap = 99;

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

// FixedRng always returns the same next() value -- used here to force
// mistakePhase's roll to miss (mistakeChance is 0 for every skill level
// right now, so any fixed value >= 0 misses).
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

const skillLevels = ["novice", "advanced", "expert"] as const;

const strategyCases: { name: string; view: Partial<PlayerView> }[] = [
  {
    name: "First: round's own first turn always resolves via Hand Selection (exchange or knock, never trade)",
    view: { isFirstTurnOfRound: true },
  },
  {
    name: "Knocked: another player has already knocked",
    view: { isLastTurn: true },
  },
  {
    name: "Heads Up: exactly one opponent remains",
    view: { opponentCount: 1 },
  },
  {
    name: "Standard: two or three opponents remain",
    view: { opponentCount: 2 },
  },
];

for (const skillLevel of skillLevels) {
  for (const c of strategyCases) {
    test(`decideV4 (${skillLevel}): ${c.name}`, () => {
      const v = baseView(c.view);
      const action = decideV4(v, new FixedRng(0.999), SKILL_CONFIGS[skillLevel], noRepeat, farFailsafeLap);
      assert.ok(["trade", "exchange", "knock"].includes(action.type));
      if (v.isFirstTurnOfRound) {
        assert.notEqual(action.type, "trade");
      }
    });
  }
}

test("decideV4: First strategy exchanges/keeps per each skill level's Hand Selection rule", () => {
  const cases: { skillLevel: (typeof skillLevels)[number]; hand: [string, string, string]; rng: number; want: "exchange" | "knock" }[] = [
    { skillLevel: "advanced", hand: ["7c", "8d", "9s"], rng: 0.999, want: "exchange" }, // all different suits
    { skillLevel: "advanced", hand: ["7c", "8c", "9d"], rng: 0.999, want: "knock" }, // two share a suit
    { skillLevel: "expert", hand: ["7c", "8d", "9s"], rng: 0.999, want: "exchange" }, // score 9 <= 16
    { skillLevel: "expert", hand: ["8c", "9c", "Td"], rng: 0.999, want: "knock" }, // score 17 > 16
  ];
  for (const c of cases) {
    const v = baseView({ isFirstTurnOfRound: true, hand: mustHand(...c.hand) });
    const action = decideV4(v, new FixedRng(c.rng), SKILL_CONFIGS[c.skillLevel], noRepeat, farFailsafeLap);
    assert.equal(action.type, c.want, `${c.skillLevel} with ${c.hand.join(",")}`);
  }
});

test("decideV4: Novice's Hand Selection is a 25% random roll, but only when the hand scores below 28", () => {
  // mistakeChance forced to 0 -- this isolates Novice's own Hand
  // Selection skill rule from the Mistake mechanic (covered by its own
  // tests below), since a shared FixedRng would otherwise let a low
  // rng value trip both the mistake roll and the skill rule's roll at
  // once.
  const cfg = { ...SKILL_CONFIGS.novice, mistakeChance: 0 };
  const weakHand = mustHand("7c", "8d", "9s"); // score 9 -- below the 28 gate

  const exchanges = decideV4(baseView({ isFirstTurnOfRound: true, hand: weakHand }), new FixedRng(0.1), cfg, noRepeat, farFailsafeLap);
  assert.equal(exchanges.type, "exchange");

  const keeps = decideV4(baseView({ isFirstTurnOfRound: true, hand: weakHand }), new FixedRng(0.5), cfg, noRepeat, farFailsafeLap);
  assert.equal(keeps.type, "knock");

  const strongHand = mustHand("9c", "Tc", "Jc"); // score 29 -- at/above the 28 gate, always keeps
  const gated = decideV4(baseView({ isFirstTurnOfRound: true, hand: strongHand }), new FixedRng(0.1), cfg, noRepeat, farFailsafeLap);
  assert.equal(gated.type, "knock");
});

test("decideV4: Knocked strategy knocks (via Always Knock) when Improve Hand can't act", () => {
  const v = baseView({ isLastTurn: true, hand: mustHand("9c", "9d", "9s"), pot: mustPot("7c", "8d", "Th") });
  const action = decideV4(v, new FixedRng(0.999), SKILL_CONFIGS.novice, noRepeat, farFailsafeLap);
  assert.equal(action.type, "knock");
});

// Stuck: the hand's own three different suits cap its score at Ks
// (10), and the pot is entirely hearts -- a suit neither hand card
// holds -- worth too little (24) to clear any skill's pot exchange
// threshold, so no trade or exchange ever improves the hand. Standard/
// HeadsUp fall through Improve Hand into the Knock phase every time.
const stuckHand: [string, string, string] = ["7c", "8d", "Ks"]; // score 10, well below every skill's knockScoreThreshold
const stuckPot: [string, string, string] = ["7h", "8h", "9h"];

for (const skillLevel of skillLevels) {
  test(`decideV4 (${skillLevel}): Standard knocks once the Knock phase's repeat counter reaches its threshold, even though the hand score is well below its own threshold`, () => {
    const v = baseView({ opponentCount: 2, hand: mustHand(...stuckHand), pot: mustPot(...stuckPot) });
    const cfg = SKILL_CONFIGS[skillLevel];
    const stuckAtThreshold: BestScoreState = { score: 10, repeatCount: cfg.knockRepeatThreshold };
    const action = decideV4(v, new FixedRng(0.999), cfg, stuckAtThreshold, farFailsafeLap);
    assert.equal(action.type, "knock");
  });
}

// Decision Logging (specs/bots_v4.md): decideV4 always starts a
// strategy's trace with a Mistake entry (every strategy lists it
// first), and ends with exactly one acted entry, from whichever phase
// actually produced the action.
for (const c of strategyCases) {
  test(`decideV4 trace: ${c.name}`, () => {
    const trace: Trace = [];
    const v = baseView(c.view);
    decideV4(v, new FixedRng(0.999), SKILL_CONFIGS.expert, noRepeat, farFailsafeLap, trace);
    assert.equal(trace[0]?.phase, "Mistake");
    const acted = trace.filter((e) => e.acted);
    assert.equal(acted.length, 1);
  });
}

// mistakeCfg forces mistakePhase's roll to always hit, regardless of
// rng, so the site-selection tests below can isolate mistakeSiteModes'
// own rng draw.
const mistakeCfg = { ...SKILL_CONFIGS.expert, mistakeChance: 1 };

// Mistake site selection (specs/bots_v4.md's Mistake section): Standard/
// Heads Up have 3 points (Improve Hand, Knock, Discard), so the site is
// rng.intn(3) -- a FixedRng's fixed next() value v maps to floor(v*3).
// Every point before the chosen site must be forced to skip, and the
// site itself must record a "mistake --" entry, so the mistake is
// never silently wasted.
const siteCases: { rngValue: number; wantSite: "Improve Hand" | "Knock" | "Discard" }[] = [
  { rngValue: 0, wantSite: "Improve Hand" },
  { rngValue: 0.4, wantSite: "Knock" },
  { rngValue: 0.7, wantSite: "Discard" },
];

for (const c of siteCases) {
  test(`decideV4: Standard picks mistake site ${c.wantSite} at rng ${c.rngValue}, skipping every point before it`, () => {
    const trace: Trace = [];
    const v = baseView({ opponentCount: 2 });
    decideV4(v, new FixedRng(c.rngValue), mistakeCfg, noRepeat, farFailsafeLap, trace);
    const siteEntries = trace.filter((e) => e.phase === c.wantSite);
    assert.ok(
      siteEntries.some((e) => e.detail.startsWith("mistake")),
      `expected a mistake entry at ${c.wantSite}, got: ${trace.map((e) => `${e.phase}: ${e.detail}`).join(" | ")}`,
    );
    const order = ["Improve Hand", "Knock", "Discard"];
    for (let i = 0; i < order.indexOf(c.wantSite); i++) {
      assert.ok(
        trace.some((e) => e.phase === order[i] && e.detail.startsWith("skipped")),
        `expected ${order[i]} to be forced to skip`,
      );
    }
  });
}

test("decideV4: Knocked strategy's only mistake-eligible point is Improve Hand -- Always Knock never mistakes", () => {
  const trace: Trace = [];
  const v = baseView({ isLastTurn: true });
  const action = decideV4(v, new FixedRng(0.5), mistakeCfg, noRepeat, farFailsafeLap, trace);
  assert.ok(trace.some((e) => e.phase === "Improve Hand" && e.detail.startsWith("mistake")));
  assert.ok(["trade", "knock"].includes(action.type));
});

// Heads Up's danger-4/5 exclusion (specs/bots_v4.md's Heads Up
// section) is what's supposed to make it diverge from Standard --
// same fixture as candidates/phases.test.ts's dangerousTopFixture:
// the single best trade (As for Qc) makes the hand all clubs (score
// 30), but leaves the pot Ks/Js/As all spades summing to 31 (danger
// 5). Standard takes it anyway; Heads Up must not.
for (const skillLevel of ["advanced", "expert"] as const) {
  test(`decideV4 (${skillLevel}): Heads Up excludes a danger 5 trade that Standard would take`, () => {
    const view = { hand: mustHand("As", "9c", "Ac"), pot: mustPot("Ks", "Js", "Qc") };
    const standard = decideV4(baseView({ ...view, opponentCount: 2 }), new FixedRng(0.999), SKILL_CONFIGS[skillLevel], noRepeat, farFailsafeLap);
    assert.equal(standard.type, "trade");
    if (standard.type === "trade") {
      assert.equal(standard.potIndex, 2);
      assert.equal(standard.handIndex, 0);
    }

    const headsUp = decideV4(baseView({ ...view, opponentCount: 1 }), new FixedRng(0.999), SKILL_CONFIGS[skillLevel], noRepeat, farFailsafeLap);
    assert.equal(headsUp.type, "trade");
    if (headsUp.type === "trade") {
      assert.ok(!(headsUp.potIndex === 2 && headsUp.handIndex === 0), "Heads Up must not take the danger 5 trade Standard took");
    }
  });
}

test("decideV4: First strategy's only point is Hand Selection, reached directly with no skip entries", () => {
  const trace: Trace = [];
  const v = baseView({ isFirstTurnOfRound: true });
  decideV4(v, new FixedRng(0.5), mistakeCfg, noRepeat, farFailsafeLap, trace);
  assert.ok(trace.some((e) => e.phase === "Hand Selection" && e.detail.startsWith("mistake")));
  assert.ok(trace.every((e) => !e.detail.startsWith("skipped")));
});
