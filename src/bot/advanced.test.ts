import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCard } from "../card/card.ts";
import { score } from "../card/score.ts";
import type { Hand, Pot, PlayerView } from "../game/types.ts";
import { AdvancedBot } from "./advanced.ts";
import { bestImprovingSwap, unnecessaryIndices } from "./helpers.ts";
import { Rng } from "../rng.ts";

function mustHand(...notation: [string, string, string]): Hand {
  return [parseCard(notation[0]), parseCard(notation[1]), parseCard(notation[2])];
}
function mustPot(...notation: [string, string, string]): Pot {
  return mustHand(...notation);
}

// FixedRng always returns the same next() value, for deterministically
// forcing one side of a chance() coin flip in a test.
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

// QueueRng returns each queued value in turn, then repeats the last one
// -- for tests that need to force two different chance() rolls (e.g.
// blunder, then the bullet under test) within the same decide() call.
class QueueRng extends Rng {
  private values: number[];
  constructor(values: number[]) {
    super(0);
    this.values = values;
  }
  next(): number {
    return this.values.length > 1 ? (this.values.shift() as number) : (this.values[0] as number);
  }
}

// NO_BLUNDER forces the blunder roll to miss (it's always < 1) without
// landing on a range's exact boundary, so tests below can assert on a
// specific bullet without the new blunder check picking a random trade
// instead.
const NO_BLUNDER = (): Rng => new FixedRng(0.999);

function baseView(overrides: Partial<PlayerView>): PlayerView {
  return {
    hand: mustHand("7c", "8d", "9s"),
    pot: mustPot("Kc", "Qd", "Js"),
    seat: 0,
    isFirstTurnOfRound: false,
    ownTurnNumber: 1,
    isLastTurn: false,
    ...overrides,
  };
}

test("decide on the first turn: takes the pot only when the hand's three cards are three different suits", () => {
  // The pot is private on the first turn (specs/rules.md), so this
  // reads purely off the hand's own suit shape -- fully deterministic,
  // no random roll.
  const cases: Array<{ name: string; hand: [string, string, string]; wantAction: string }> = [
    { name: "three different suits: takes the pot", hand: ["7c", "8d", "9s"], wantAction: "exchange" },
    { name: "two cards share a suit: keeps the hand", hand: ["7c", "8c", "9s"], wantAction: "knock" },
    { name: "all three cards share a suit: keeps the hand", hand: ["7c", "8c", "9c"], wantAction: "knock" },
  ];
  for (const { name, hand, wantAction } of cases) {
    const v = baseView({ hand: mustHand(...hand), isFirstTurnOfRound: true, ownTurnNumber: 1 });
    const b = new AdvancedBot();
    assert.equal(b.decide(v).type, wantAction, name);
  }
});

test("knocks once the bot's own turn number reaches the [25-30] range, regardless of hand/pot", () => {
  const v = baseView({ ownTurnNumber: 100 });
  const b = new AdvancedBot({ rng: NO_BLUNDER() });
  assert.equal(b.decide(v).type, "knock");
});

test("does not force a turn-limit knock below the [25-30] range", () => {
  const v = baseView({ ownTurnNumber: 1 });
  const b = new AdvancedBot();
  assert.notEqual(b.decide(v).type, "knock");
});

test("on the last turn (another player has knocked), takes whichever of knock/exchange/trade scores highest", () => {
  const cases: Array<{
    name: string;
    hand: [string, string, string];
    pot: [string, string, string];
    wantType: string;
    wantPotIndex?: number;
    wantHandIndex?: number;
  }> = [
    {
      // Matches the motivating case: an 18 that nothing beats still
      // knocks here, well below every other knock threshold Advanced has.
      name: "no exchange or trade beats the hand: knocks even below every other knock threshold",
      hand: ["7h", "Ah", "8s"],
      pot: ["7c", "8d", "9c"],
      wantType: "knock",
    },
    {
      name: "the whole pot clearly beats both the hand and every single-card trade: exchanges",
      hand: ["7c", "8d", "9s"],
      pot: ["Ah", "Kh", "9h"],
      wantType: "exchange",
    },
    {
      name: "a single pot card completes a better suit than the hand or the whole pot: trades that card",
      hand: ["7h", "8h", "9s"],
      pot: ["Th", "7d", "8d"],
      wantType: "trade",
      wantPotIndex: 0,
      wantHandIndex: 2,
    },
  ];
  for (const c of cases) {
    const v = baseView({ hand: mustHand(...c.hand), pot: mustPot(...c.pot), isLastTurn: true, ownTurnNumber: 1 });
    const b = new AdvancedBot();
    const action = b.decide(v);
    assert.equal(action.type, c.wantType, c.name);
    if (c.wantPotIndex !== undefined) {
      assert.equal(action.potIndex, c.wantPotIndex, c.name);
      assert.equal(action.handIndex, c.wantHandIndex, c.name);
    }
  }
});

test("exchanges only when the pot is both knock-worthy (>= 26) and beats the hand", () => {
  // Exchanging is itself a knock from the round's second turn on
  // (specs/rules.md), so "the pot beats my hand" alone isn't enough --
  // a pot that's merely better than a bad hand would otherwise lock in
  // a likely-losing score. Both conditions must hold.
  const cases: Array<{ name: string; hand: [string, string, string]; pot: [string, string, string]; wantExchange: boolean }> = [
    { name: "pot well above 26 and above the hand: exchanges", hand: ["7c", "8d", "9s"], pot: ["Ah", "Kh", "Qh"], wantExchange: true },
    { name: "pot clears 26 and beats the hand: exchanges", hand: ["7c", "8d", "9s"], pot: ["7h", "9h", "Th"], wantExchange: true },
    { name: "pot beats the hand but isn't knock-worthy (20 < 26): does not exchange", hand: ["7c", "8d", "9s"], pot: ["Kc", "Qc", "7d"], wantExchange: false },
    { name: "pot ties the hand's score instead of beating it: does not exchange", hand: ["Ah", "Kh", "8h"], pot: ["Ad", "Kd", "8d"], wantExchange: false },
  ];
  for (const c of cases) {
    const v = baseView({ hand: mustHand(...c.hand), pot: mustPot(...c.pot), ownTurnNumber: 2 });
    const b = new AdvancedBot({ rng: NO_BLUNDER() });
    assert.equal(b.decide(v).type === "exchange", c.wantExchange, c.name);
  }
});

test("knocks when the hand ties its best-ever score and that best was reached more than [3-5] of its own turns ago", () => {
  const v = baseView({ hand: mustHand("7c", "8d", "9s"), pot: mustPot("Kc", "Qd", "Js"), ownTurnNumber: 8 });
  const b = new AdvancedBot({ rng: NO_BLUNDER(), bestScore: 9, bestTurn: 1 });
  assert.equal(b.decide(v).type, "knock");
});

test("does not force that knock too soon after the best score was set", () => {
  const v = baseView({ hand: mustHand("7c", "8d", "9s"), pot: mustPot("Kc", "Qd", "Js"), ownTurnNumber: 2 });
  const b = new AdvancedBot({ bestScore: 9, bestTurn: 2 });
  assert.notEqual(b.decide(v).type, "knock");
});

test("resets best score and turn at the start of each round", () => {
  // Simulate having reached a best of 9 at turn 1 of a prior round --
  // if this carried over unreset, turn 8 below would be far enough
  // past turn 1 to trigger the stagnation knock.
  const b = new AdvancedBot({ bestScore: 9, bestTurn: 1 });
  b.onRoundStart();

  const v = baseView({ hand: mustHand("7c", "8d", "9s"), pot: mustPot("Kc", "Qd", "Js"), ownTurnNumber: 8 });
  assert.notEqual(b.decide(v).type, "knock");
});

test("trades to improve the hand when a pot card would help it", () => {
  const hand = mustHand("7c", "8d", "9s");
  const pot = mustPot("Ah", "Kd", "7s");
  const v = baseView({ hand, pot, ownTurnNumber: 2 });
  const b = new AdvancedBot({ rng: NO_BLUNDER() });
  const action = b.decide(v);

  const want = bestImprovingSwap(v);
  assert.ok(want);
  assert.equal(action.type, "trade");
  assert.equal(action.potIndex, want?.potIdx);
  assert.equal(action.handIndex, want?.handIdx);
});

test("knocks once the hand score reaches 26, when no swap improves it further", () => {
  const v = baseView({ hand: mustHand("7h", "9h", "Th"), pot: mustPot("7c", "8d", "9s"), ownTurnNumber: 2 });
  assert.equal(score(v.hand), 26);
  assert.equal(bestImprovingSwap(v), undefined);
  const b = new AdvancedBot({ rng: NO_BLUNDER() });
  assert.equal(b.decide(v).type, "knock");
});

test("does not force a score-threshold knock below 26", () => {
  const v = baseView({ hand: mustHand("7h", "8h", "Th"), pot: mustPot("7c", "8d", "9s"), ownTurnNumber: 2 });
  assert.equal(score(v.hand), 25);
  assert.equal(bestImprovingSwap(v), undefined);
  const b = new AdvancedBot();
  assert.notEqual(b.decide(v).type, "knock");
});

test("records the resulting score as its best even from the round's first turn", () => {
  const b = new AdvancedBot({ rng: NO_BLUNDER() });
  b.onRoundStart();

  // 7c/8d/9s are three different suits, so the pot is always taken
  // regardless of either card's score.
  const first = b.decide(baseView({ hand: mustHand("7c", "8d", "9s"), pot: mustPot("7s", "8s", "9s"), isFirstTurnOfRound: true }));
  assert.equal(first.type, "exchange"); // resulting score = score(pot) = 24, at turn 1

  // Later in the same round -- turn 8 is more than [3-5] turns past
  // the turn-1 best of 24 -- tying it with no better swap available
  // triggers the stagnation knock.
  const v = baseView({ hand: mustHand("7s", "8s", "9s"), pot: mustPot("Kd", "Qh", "Jc"), ownTurnNumber: 8 });
  assert.equal(bestImprovingSwap(v), undefined, "tying the recorded best of 24 with no better swap available");
  assert.equal(b.decide(v).type, "knock");
});

test("takes a pair-maker trade on the 50% chance hit", () => {
  // 7c/8d remain unnecessary (9h is the sole best suit), no pot swap
  // improves the hand, and 7s (potIdx 0) pairs with 7c, outside the 8d
  // slot (handIdx 1) -- the lowest (potIdx, handIdx) pairing
  // choosePairMaker finds. QueueRng's first roll (1, always a miss)
  // forces the blunder check to fall through so the PAIR_MAKER_CHANCE
  // roll is reached at all; its second roll (0) then forces that coin
  // flip to hit.
  const hand = mustHand("7c", "8d", "9h");
  const pot = mustPot("7s", "8s", "9s");
  const v = baseView({ hand, pot, ownTurnNumber: 2 });
  assert.equal(bestImprovingSwap(v), undefined);

  const b = new AdvancedBot({ rng: new QueueRng([1, 0]) });
  const action = b.decide(v);
  assert.equal(action.type, "trade");
  assert.equal(action.potIndex, 0);
  assert.equal(action.handIndex, 1);
});

test("falls through to a fully random trade on the 50% chance miss", () => {
  // Same fixture as the chance-hit case above: QueueRng's first roll
  // (1) misses the blunder check, and its second roll (0.9, at or
  // above 0.5) misses the PAIR_MAKER_CHANCE coin flip too -- Advanced
  // continues to the next bullet (the fully-random trade) as if no
  // pairing card had been found, per specs/bots.md. That final trade
  // reuses the same 0.9 (QueueRng repeats its last value).
  const hand = mustHand("7c", "8d", "9h");
  const pot = mustPot("7s", "8s", "9s");
  const v = baseView({ hand, pot, ownTurnNumber: 2 });
  assert.equal(bestImprovingSwap(v), undefined);

  const b = new AdvancedBot({ rng: new QueueRng([1, 0.9]) });
  const action = b.decide(v);
  assert.equal(action.type, "trade");
  assert.equal(action.potIndex, 2);
  assert.equal(action.handIndex, 2);
});

test("trades fully at random when nothing improves the hand, no card is unnecessary, and no pair is available", () => {
  // Tc/Jd/Qh ties 3 ways at 10 -- unnecessaryIndices treats all 3 as
  // necessary -- so the pair-maker bullet has nothing to act on, and
  // 7s/8s/9s never beats that tie.
  const hand = mustHand("Tc", "Jd", "Qh");
  const pot = mustPot("7s", "8s", "9s");
  const v = baseView({ hand, pot, ownTurnNumber: 2 });
  assert.equal(bestImprovingSwap(v), undefined);
  assert.deepEqual(unnecessaryIndices(hand), []);
  assert.ok(score(v.pot) < 26 && score(hand) < 26);

  const b = new AdvancedBot();
  const action = b.decide(v);
  assert.equal(action.type, "trade");
  assert.ok(action.potIndex >= 0 && action.potIndex <= 2);
  assert.ok(action.handIndex >= 0 && action.handIndex <= 2);
});
