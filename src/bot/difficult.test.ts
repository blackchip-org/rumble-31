import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCard } from "../card/card.ts";
import { score } from "../card/score.ts";
import type { Hand, Pot, PlayerView, PublicTurn } from "../game/types.ts";
import { DifficultBot } from "./difficult.ts";
import { bestImprovingSwap } from "./helpers.ts";

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
    isFirstTurnOfRound: false,
    ownTurnNumber: 1,
    ...overrides,
  };
}

function turn(seat: number, type: PublicTurn["type"], given: string[], taken: string[]): PublicTurn {
  return { seat, type, given: given.map(parseCard), taken: taken.map(parseCard) };
}

test("decide on the first turn: take pot only if it improves the hand", () => {
  const cases: Array<{ name: string; hand: [string, string, string]; pot: [string, string, string]; wantAction: string }> = [
    { name: "same-suit pot beats hand score", hand: ["7c", "8d", "9s"], pot: ["Ah", "Kh", "Qh"], wantAction: "exchange" },
    { name: "pot does not beat hand score", hand: ["Ah", "Kh", "Qh"], pot: ["7c", "8d", "9s"], wantAction: "knock" },
    { name: "a mixed-suit pot can beat the hand too", hand: ["7c", "8d", "9s"], pot: ["Ah", "Kc", "Qd"], wantAction: "exchange" },
  ];
  for (const { name, hand, pot, wantAction } of cases) {
    const v = baseView({ hand: mustHand(...hand), pot: mustPot(...pot), isFirstTurnOfRound: true, ownTurnNumber: 1 });
    const b = new DifficultBot();
    assert.equal(b.decide(v).type, wantAction, name);
  }
});

test("knocks once the bot's own turn number reaches the [25-30] range, regardless of hand/pot", () => {
  const v = baseView({ ownTurnNumber: 100 });
  const b = new DifficultBot();
  assert.equal(b.decide(v).type, "knock");
});

test("does not force a turn-limit knock below the [25-30] range", () => {
  const v = baseView({ ownTurnNumber: 1 });
  const b = new DifficultBot();
  assert.notEqual(b.decide(v).type, "knock");
});

test("exchanges all cards whenever the pot's score is >= 30", () => {
  const v = baseView({ hand: mustHand("7c", "8d", "9s"), pot: mustPot("Ah", "Kh", "Qh"), ownTurnNumber: 2 });
  const b = new DifficultBot();
  assert.equal(b.decide(v).type, "exchange");
});

test("knocks when the hand ties its best-ever score and that best was reached more than [3-5] of its own turns ago", () => {
  const v = baseView({ hand: mustHand("7c", "8d", "9s"), pot: mustPot("Kc", "Qd", "Js"), ownTurnNumber: 8 });
  const b = new DifficultBot({ bestScore: 9, bestTurn: 1 });
  assert.equal(b.decide(v).type, "knock");
});

test("does not force that knock too soon after the best score was set", () => {
  const v = baseView({ hand: mustHand("7c", "8d", "9s"), pot: mustPot("Kc", "Qd", "Js"), ownTurnNumber: 2 });
  const b = new DifficultBot({ bestScore: 9, bestTurn: 2 });
  assert.notEqual(b.decide(v).type, "knock");
});

test("resets best score and turn at the start of each round", () => {
  // Simulate having reached a best of 9 at turn 1 of a prior round --
  // if this carried over unreset, turn 8 below would be far enough
  // past turn 1 to trigger the stagnation knock.
  const b = new DifficultBot({ bestScore: 9, bestTurn: 1 });
  b.onRoundStart();

  const v = baseView({ hand: mustHand("7c", "8d", "9s"), pot: mustPot("Kc", "Qd", "Js"), ownTurnNumber: 8 });
  assert.notEqual(b.decide(v).type, "knock");
});

test("trades to improve the hand when a pot card would help it", () => {
  const hand = mustHand("7c", "8d", "9s");
  const pot = mustPot("Ah", "Kd", "7s");
  const v = baseView({ hand, pot, ownTurnNumber: 2 });
  const b = new DifficultBot();
  const action = b.decide(v);

  const want = bestImprovingSwap(v);
  assert.ok(want);
  assert.equal(action.type, "trade");
  assert.equal(action.potIndex, want?.potIdx);
  assert.equal(action.handIndex, want?.handIdx);
});

test("knocks once the hand score reaches 27, when no swap improves it further", () => {
  const v = baseView({ hand: mustHand("Kh", "Qh", "7h"), pot: mustPot("7c", "8d", "9s"), ownTurnNumber: 2 });
  assert.equal(score(v.hand), 27);
  assert.equal(bestImprovingSwap(v), undefined);
  const b = new DifficultBot();
  assert.equal(b.decide(v).type, "knock");
});

test("does not force a score-threshold knock below 27", () => {
  const v = baseView({ hand: mustHand("Th", "9h", "7h"), pot: mustPot("7c", "8d", "9s"), ownTurnNumber: 2 });
  assert.equal(score(v.hand), 26);
  assert.equal(bestImprovingSwap(v), undefined);
  const b = new DifficultBot();
  assert.notEqual(b.decide(v).type, "knock");
});

test("trades toward a favorable pickup using known-held upstream cards, seeded directly", () => {
  // Hand: 7c/8c necessary (clubs, 15), 9s unnecessary. Pot: Th would
  // improve a known Qh (hearts 10+10=20 > 10); Td and 7d would only
  // tie it (diamonds vs. hearts), so they're favorable.
  const hand = mustHand("7c", "8c", "9s");
  const pot = mustPot("Th", "Td", "7d");
  const v = baseView({ hand, pot, ownTurnNumber: 2 });
  assert.equal(bestImprovingSwap(v), undefined);

  const b = new DifficultBot({ upstreamKnown: [parseCard("Qh")] });
  const action = b.decide(v);
  assert.equal(action.type, "trade");
  assert.notEqual(action.potIndex, 0, "must avoid Th, which would improve the known Qh");
  assert.equal(action.potIndex, 1);
  assert.equal(action.handIndex, 2);
});

test("wires observed neighbor turns through to the exact known-hand favorable-pickup preference", () => {
  const b = new DifficultBot();
  b.onRoundStart();

  // Seat 0 is the bot, turn order 0, 1, 2, 3. Replay the round the way
  // the engine actually broadcasts it: every turn, including the bot's
  // own, goes through observe().
  const priming = b.decide(
    baseView({ seat: 0, isFirstTurnOfRound: true, hand: mustHand("Ah", "Kh", "Qh"), pot: mustPot("7c", "8d", "9s") }),
  );
  assert.equal(priming.type, "knock");
  b.observe(turn(0, "knock", [], []));

  b.observe(turn(1, "trade", ["7h"], ["7s"]));
  b.observe(turn(2, "trade", ["8h"], ["9d"]));
  // Seat 3 acts immediately before the bot's next turn -- it becomes
  // upstream once decide() runs below, and its taken card (Qh) is what
  // the favorable-pickup check judges pot cards against.
  b.observe(turn(3, "trade", ["9h"], ["Qh"]));

  const hand = mustHand("7c", "8c", "9s");
  const pot = mustPot("Th", "Td", "7d");
  const v = baseView({ seat: 0, hand, pot, ownTurnNumber: 2 });
  assert.equal(bestImprovingSwap(v), undefined);

  const action = b.decide(v);
  assert.equal(action.type, "trade");
  assert.notEqual(action.potIndex, 0, "must avoid Th, which would improve upstream's known Qh");
  assert.equal(action.potIndex, 1);
  assert.equal(action.handIndex, 2);
});

test("snapshot/restore round-trips tracked memory, including discovered neighbor adjacency", () => {
  // Same priming sequence as the favorable-pickup test above, up to
  // (but not including) the decision it's used to inform.
  const b = new DifficultBot();
  b.onRoundStart();
  b.decide(baseView({ seat: 0, isFirstTurnOfRound: true, hand: mustHand("Ah", "Kh", "Qh"), pot: mustPot("7c", "8d", "9s") }));
  b.observe(turn(0, "knock", [], []));
  b.observe(turn(1, "trade", ["7h"], ["7s"]));
  b.observe(turn(2, "trade", ["8h"], ["9d"]));
  b.observe(turn(3, "trade", ["9h"], ["Qh"]));

  // Restore into a brand new instance instead of continuing on b --
  // the restored bot alone must still know upstream is seat 3 holding
  // the known Qh, without ever having observed those turns itself.
  const restored = new DifficultBot(b.snapshot());

  const hand = mustHand("7c", "8c", "9s");
  const pot = mustPot("Th", "Td", "7d");
  const v = baseView({ seat: 0, hand, pot, ownTurnNumber: 2 });
  assert.equal(bestImprovingSwap(v), undefined);

  const action = restored.decide(v);
  assert.equal(action.type, "trade");
  assert.notEqual(action.potIndex, 0, "must avoid Th, which would improve upstream's known Qh");
  assert.equal(action.potIndex, 1);
  assert.equal(action.handIndex, 2);
});
