import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCard } from "../../card/card.ts";
import { score } from "../../card/score.ts";
import type { Hand, Pot, PlayerView, PublicTurn } from "../../game/types.ts";
import { ExpertBot } from "./expert.ts";
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
    const v = baseView({ hand: mustHand(...hand), isFirstTurnOfRound: true, lap: 1 });
    const b = new ExpertBot();
    assert.equal(b.decide(v).type, wantAction, name);
  }
});

test("knocks once the bot's lap reaches the [25-30] range, regardless of hand/pot", () => {
  const v = baseView({ lap: 100 });
  const b = new ExpertBot();
  assert.equal(b.decide(v).type, "knock");
});

test("does not force a turn-limit knock below the [25-30] range", () => {
  const v = baseView({ lap: 1 });
  const b = new ExpertBot();
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
      // knocks here, well below every other knock threshold Expert has.
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
    const v = baseView({ hand: mustHand(...c.hand), pot: mustPot(...c.pot), isLastTurn: true, lap: 1 });
    const b = new ExpertBot();
    const action = b.decide(v);
    assert.equal(action.type, c.wantType, c.name);
    if (c.wantPotIndex !== undefined) {
      assert.equal(action.potIndex, c.wantPotIndex, c.name);
      assert.equal(action.handIndex, c.wantHandIndex, c.name);
    }
  }
});

test("exchanges only when the pot is both knock-worthy (>= 24) and beats the hand", () => {
  // Exchanging is itself a knock from the round's second turn on
  // (specs/rules.md), so "the pot beats my hand" alone isn't enough --
  // a pot that's merely better than a bad hand would otherwise lock in
  // a likely-losing score. Both conditions must hold.
  const cases: Array<{ name: string; hand: [string, string, string]; pot: [string, string, string]; wantExchange: boolean }> = [
    { name: "pot well above 24 and above the hand: exchanges", hand: ["7c", "8d", "9s"], pot: ["Ah", "Kh", "Qh"], wantExchange: true },
    { name: "pot clears 24 and beats the hand: exchanges", hand: ["7c", "8d", "9s"], pot: ["7h", "8h", "9h"], wantExchange: true },
    { name: "pot beats the hand but isn't knock-worthy (20 < 24): does not exchange", hand: ["7c", "8d", "9s"], pot: ["Kc", "Qc", "7d"], wantExchange: false },
    { name: "pot ties the hand's score instead of beating it: does not exchange", hand: ["Ah", "Kh", "8h"], pot: ["Ad", "Kd", "8d"], wantExchange: false },
  ];
  for (const c of cases) {
    const v = baseView({ hand: mustHand(...c.hand), pot: mustPot(...c.pot), lap: 2 });
    const b = new ExpertBot();
    assert.equal(b.decide(v).type === "exchange", c.wantExchange, c.name);
  }
});

test("knocks when the hand ties its best-ever score and that best was reached more than [3-5] laps ago", () => {
  const v = baseView({ hand: mustHand("7c", "8d", "9s"), pot: mustPot("Kc", "Qd", "Js"), lap: 8 });
  const b = new ExpertBot({ bestScore: 9, bestLap: 1 });
  assert.equal(b.decide(v).type, "knock");
});

test("does not force that knock too soon after the best score was set", () => {
  const v = baseView({ hand: mustHand("7c", "8d", "9s"), pot: mustPot("Kc", "Qd", "Js"), lap: 2 });
  const b = new ExpertBot({ bestScore: 9, bestLap: 2 });
  assert.notEqual(b.decide(v).type, "knock");
});

test("knocks immediately, bypassing the stagnation wait, once a fully-known neighbor's exact score is confirmed beaten by a clear margin", () => {
  // Hand: Kc/Qc clubs = 20. Upstream is fully known (3 cards) at 15
  // (7h/8h hearts), a 5-point margin -- meets CONFIRMED_EDGE_MARGIN, so
  // this should knock despite bestScore starting at 0 (no stagnation
  // tie) and turn 2 being nowhere near the [25-30] turn-limit range.
  const hand = mustHand("Kc", "Qc", "7d");
  const pot = mustPot("7s", "8s", "Td");
  const v = baseView({ hand, pot, lap: 2 });
  assert.equal(score(v.hand), 20);

  const upstreamKnown = mustHand("7h", "8h", "9c");
  assert.equal(score(upstreamKnown), 15);
  const b = new ExpertBot({ upstreamKnown });
  assert.equal(b.decide(v).type, "knock");
});

test("does not force that knock when the margin over a fully-known neighbor isn't clear enough", () => {
  // Same hand (20) and pot as above, but upstream's known hand is now
  // 16 (7h/9h hearts) -- only a 4-point margin, short of
  // CONFIRMED_EDGE_MARGIN (5).
  const hand = mustHand("Kc", "Qc", "7d");
  const pot = mustPot("7s", "8s", "Td");
  const v = baseView({ hand, pot, lap: 2 });
  assert.equal(score(v.hand), 20);

  const upstreamKnown = mustHand("7h", "9h", "9c");
  assert.equal(score(upstreamKnown), 16);
  const b = new ExpertBot({ upstreamKnown });
  assert.notEqual(b.decide(v).type, "knock");
});

test("resets best score and turn at the start of each round", () => {
  // Simulate having reached a best of 9 at turn 1 of a prior round --
  // if this carried over unreset, turn 8 below would be far enough
  // past turn 1 to trigger the stagnation knock.
  const b = new ExpertBot({ bestScore: 9, bestLap: 1 });
  b.onRoundStart();

  const v = baseView({ hand: mustHand("7c", "8d", "9s"), pot: mustPot("Kc", "Qd", "Js"), lap: 8 });
  assert.notEqual(b.decide(v).type, "knock");
});

test("trades to improve the hand when a pot card would help it", () => {
  const hand = mustHand("7c", "8d", "9s");
  const pot = mustPot("Ah", "Kd", "7s");
  const v = baseView({ hand, pot, lap: 2 });
  const b = new ExpertBot();
  const action = b.decide(v);

  const want = bestImprovingSwap(v);
  assert.ok(want);
  assert.equal(action.type, "trade");
  assert.equal(action.potIndex, want?.potIdx);
  assert.equal(action.handIndex, want?.handIdx);
});

test("among equally-improving swaps, prefers denying upstream a card that would help their known hand", () => {
  // Hand: 7c/8c necessary (clubs, 15), 7d unnecessary. Both Tc and Jc
  // complete the same club run (7+8+10=25), tying for the best
  // improving swap -- plain lowest-(potIdx, handIdx) tie-break would
  // pick Tc (potIdx 0). But upstream is known to hold Jd/Jh already:
  // Jc would let them complete a three-of-a-kind (30.5), while Tc
  // wouldn't help them at all -- so the denial tie-break should pick
  // Jc (potIdx 1) instead, purely to keep it away from upstream.
  const hand = mustHand("7c", "7d", "8c");
  const pot = mustPot("Tc", "Jc", "8d");
  const v = baseView({ hand, pot, lap: 2 });
  assert.equal(score(v.hand), 15);

  const plain = bestImprovingSwap(v);
  assert.equal(plain?.potIdx, 0, "sanity check: without denial, the plain tie-break picks Tc");
  assert.equal(plain?.score, 25);

  const b = new ExpertBot({ upstreamKnown: [parseCard("7h"), parseCard("Jd"), parseCard("Jh")] });
  const action = b.decide(v);
  assert.equal(action.type, "trade");
  assert.equal(action.potIndex, 1, "must deny Jc, which would complete upstream's jacks");
  assert.equal(action.handIndex, 1);
});

test("knocks once the hand score reaches 24, when no swap improves it further", () => {
  const v = baseView({ hand: mustHand("7h", "8h", "9h"), pot: mustPot("7c", "8d", "9s"), lap: 2 });
  assert.equal(score(v.hand), 24);
  assert.equal(bestImprovingSwap(v), undefined);
  const b = new ExpertBot();
  assert.equal(b.decide(v).type, "knock");
});

test("does not force a score-threshold knock below 24", () => {
  const v = baseView({ hand: mustHand("Ah", "Kh", "9c"), pot: mustPot("7c", "8d", "9s"), lap: 2 });
  assert.equal(score(v.hand), 21);
  assert.equal(bestImprovingSwap(v), undefined);
  const b = new ExpertBot();
  assert.notEqual(b.decide(v).type, "knock");
});

test("lowers the score-threshold-knock bar once downstream's known hand is dangerously close to it", () => {
  // Same 21-score hand/pot as above (normally short of the 24 bar), but
  // downstream is known to be sitting on 21 (Ad/Kd diamonds) -- within
  // DOWNSTREAM_DANGER_MARGIN (4) of KNOCK_SCORE (24) -- so the bar
  // drops by DOWNSTREAM_RISK_DISCOUNT (3) to 21, which this hand now
  // clears.
  const v = baseView({ hand: mustHand("Ah", "Kh", "9c"), pot: mustPot("7c", "8d", "9s"), lap: 2 });
  assert.equal(score(v.hand), 21);
  assert.equal(bestImprovingSwap(v), undefined);

  const downstreamKnown = [parseCard("Ad"), parseCard("Kd")];
  const b = new ExpertBot({ downstreamKnown });
  assert.equal(b.decide(v).type, "knock");
});

test("does not lower the score-threshold-knock bar when downstream isn't dangerous enough yet", () => {
  const v = baseView({ hand: mustHand("Ah", "Kh", "9c"), pot: mustPot("7c", "8d", "9s"), lap: 2 });
  assert.equal(score(v.hand), 21);
  assert.equal(bestImprovingSwap(v), undefined);

  const downstreamKnown = [parseCard("Kd")];
  const b = new ExpertBot({ downstreamKnown });
  assert.notEqual(b.decide(v).type, "knock");
});

test("trades to deny an unnecessary-slot pickup that would help a known upstream hand, seeded directly", () => {
  // Hand: 7c/8c necessary (clubs, 15), 9s unnecessary. Pot: Th would
  // improve a known Qh (hearts 10+10=20 > 10), so the denial bullet
  // takes it purely to keep it away from upstream, ahead of the
  // favorable-pickup bullet that would otherwise settle for Td or 7d.
  const hand = mustHand("7c", "8c", "9s");
  const pot = mustPot("Th", "Td", "7d");
  const v = baseView({ hand, pot, lap: 2 });
  assert.equal(bestImprovingSwap(v), undefined);

  const b = new ExpertBot({ upstreamKnown: [parseCard("Qh")] });
  const action = b.decide(v);
  assert.equal(action.type, "trade");
  assert.equal(action.potIndex, 0, "must take Th, denying it to upstream's known Qh");
  assert.equal(action.handIndex, 2);
});

test("wires observed neighbor turns through to the exact known-hand denial preference", () => {
  const b = new ExpertBot();
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
  // the denial check judges pot cards against.
  b.observe(turn(3, "trade", ["9h"], ["Qh"]));

  const hand = mustHand("7c", "8c", "9s");
  const pot = mustPot("Th", "Td", "7d");
  const v = baseView({ seat: 0, hand, pot, lap: 2 });
  assert.equal(bestImprovingSwap(v), undefined);

  const action = b.decide(v);
  assert.equal(action.type, "trade");
  assert.equal(action.potIndex, 0, "must take Th, denying it to upstream's known Qh");
  assert.equal(action.handIndex, 2);
});

test("snapshot/restore round-trips tracked memory, including discovered neighbor adjacency", () => {
  // Same priming sequence as the denial-preference test above, up to
  // (but not including) the decision it's used to inform.
  const b = new ExpertBot();
  b.onRoundStart();
  b.decide(baseView({ seat: 0, isFirstTurnOfRound: true, hand: mustHand("Ah", "Kh", "Qh"), pot: mustPot("7c", "8d", "9s") }));
  b.observe(turn(0, "knock", [], []));
  b.observe(turn(1, "trade", ["7h"], ["7s"]));
  b.observe(turn(2, "trade", ["8h"], ["9d"]));
  b.observe(turn(3, "trade", ["9h"], ["Qh"]));

  // Restore into a brand new instance instead of continuing on b --
  // the restored bot alone must still know upstream is seat 3 holding
  // the known Qh, without ever having observed those turns itself.
  const restored = new ExpertBot(b.snapshot());

  const hand = mustHand("7c", "8c", "9s");
  const pot = mustPot("Th", "Td", "7d");
  const v = baseView({ seat: 0, hand, pot, lap: 2 });
  assert.equal(bestImprovingSwap(v), undefined);

  const action = restored.decide(v);
  assert.equal(action.type, "trade");
  assert.equal(action.potIndex, 0, "must take Th, denying it to upstream's known Qh");
  assert.equal(action.handIndex, 2);
});

test("trades an unnecessary card for one that makes a pair", () => {
  // Hand: 8h/9h necessary (hearts, 17), 7c the lone unnecessary card.
  // Pot: 8s pairs with the hand's 8h; 7d/8d (diamonds, absent from the
  // hand) keep the pot's own score at 15, well under Expert's
  // exchange-all bar (24). Hearts already dominate at 17, comfortably
  // above anything a single pot card could reach, so no swap improves
  // the hand either. With nothing known about upstream, the denial and
  // favorable-pickup bullets both no-op, so Expert's pair-maker
  // bullet decides instead, deterministically: 8s (potIdx 0) pairs with
  // 8h, outside the 7c slot (handIdx 0) -- the lowest (potIdx, handIdx)
  // pairing choosePairMaker finds.
  const hand = mustHand("7c", "8h", "9h");
  const pot = mustPot("8s", "7d", "8d");
  const v = baseView({ hand, pot, lap: 2 });
  assert.equal(bestImprovingSwap(v), undefined);

  const b = new ExpertBot();
  const action = b.decide(v);
  assert.equal(action.type, "trade");
  assert.equal(action.potIndex, 0);
  assert.equal(action.handIndex, 0);
});

test("falls back to a favorable (non-denying) pickup when nothing is worth denying", () => {
  // Upstream's known hand (Ah/Kh/Qh, hearts summing to 31) is already
  // so strong that no realistic pot card could push it any higher --
  // chooseDenialTrade has nothing to deny, so the favorable-pickup
  // bullet decides instead: Th/Td/7d are all "favorable" here (none of
  // them improve upstream further either), so it picks the lowest
  // index, Th.
  const hand = mustHand("7c", "8c", "9s");
  const pot = mustPot("Th", "Td", "7d");
  const v = baseView({ hand, pot, lap: 2 });
  assert.equal(bestImprovingSwap(v), undefined);

  const b = new ExpertBot({ upstreamKnown: [parseCard("Ah"), parseCard("Kh"), parseCard("Qh")] });
  const action = b.decide(v);
  assert.equal(action.type, "trade");
  assert.equal(action.potIndex, 0);
  assert.equal(action.handIndex, 2);
});
