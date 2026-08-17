import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCard } from "../card/card.ts";
import type { Card } from "../card/card.ts";
import { score } from "../card/score.ts";
import { Round, newRound, validateAction } from "./round.ts";
import type { RoundDealOverride } from "./round.ts";
import { trade, exchange, knock, strategyFunc } from "./types.ts";
import type { Action, Hand, Player, Pot, PlayerView, PublicTurn, Strategy, TurnRecord } from "./types.ts";

function mustHand(...notation: [string, string, string]): Hand {
  return [parseCard(notation[0]), parseCard(notation[1]), parseCard(notation[2])];
}

function mustPot(...notation: [string, string, string]): Pot {
  return mustHand(...notation);
}

const nilStrategy: Strategy = strategyFunc(() => {
  throw new Error("nilStrategy should never be called");
});

// passTurn returns a Strategy that never affects the round's
// knock-ending state: Keep (knock()) on the round's first turn, since
// trade isn't legal there, and an otherwise-inconsequential single-card
// trade on every later turn. Used throughout as a filler for seats
// whose exact action doesn't matter to a test.
function passTurn(): Strategy {
  return strategyFunc((v: PlayerView) => (v.isFirstTurnOfRound ? knock() : trade(0, 0)));
}

function newTestRound(
  hands: [[string, string, string], [string, string, string], [string, string, string], [string, string, string]],
  pot: [string, string, string],
  strategies: [Strategy, Strategy, Strategy, Strategy],
): Round {
  const players: Player[] = [0, 1, 2, 3].map((seat) => ({
    seat,
    hand: mustHand(...(hands[seat] as [string, string, string])),
    strategy: strategies[seat] as Strategy,
  }));
  return new Round(mustPot(...pot), players);
}

test("apply: trade swaps one card each way", () => {
  const r = newTestRound(
    [
      ["7h", "8h", "9h"],
      ["7c", "8c", "9c"],
      ["7d", "8d", "9d"],
      ["7s", "8s", "9s"],
    ],
    ["Ah", "Ac", "Ad"],
    [nilStrategy, nilStrategy, nilStrategy, nilStrategy],
  );

  const rec = r.apply(0, trade(1, 2), 0);

  assert.deepEqual(r.players[0]?.hand, mustHand("7h", "8h", "Ac"));
  assert.deepEqual(r.pot, mustPot("Ah", "9h", "Ad"));
  assert.equal(rec.scoreAfter, score(r.players[0]?.hand as Hand));
  assert.deepEqual(r.players[1]?.hand, mustHand("7c", "8c", "9c"));
});

test("apply: exchange swaps entire hand with pot", () => {
  const hand: [string, string, string] = ["7h", "8h", "9h"];
  const pot: [string, string, string] = ["Ah", "Ac", "Ad"];
  const r = newTestRound(
    [hand, ["7c", "8c", "9c"], ["7d", "8d", "9d"], ["7s", "8s", "9s"]],
    pot,
    [nilStrategy, nilStrategy, nilStrategy, nilStrategy],
  );

  r.apply(0, exchange(), 0);

  assert.deepEqual(r.players[0]?.hand, mustPot(...pot));
  assert.deepEqual(r.pot, mustHand(...hand));
});

test("apply: knock changes nothing", () => {
  const hand: [string, string, string] = ["7h", "8h", "9h"];
  const pot: [string, string, string] = ["Ah", "Ac", "Ad"];
  const r = newTestRound(
    [hand, ["7c", "8c", "9c"], ["7d", "8d", "9d"], ["7s", "8s", "9s"]],
    pot,
    [nilStrategy, nilStrategy, nilStrategy, nilStrategy],
  );

  r.apply(0, knock(), 0);

  assert.deepEqual(r.players[0]?.hand, mustHand(...hand));
  assert.deepEqual(r.pot, mustPot(...pot));
});

test("validateAction", () => {
  const cases: Array<{ name: string; action: Action; turnIdx: number; wantErr: boolean }> = [
    { name: "trade legal on a later turn", action: trade(0, 0), turnIdx: 1, wantErr: false },
    { name: "trade not legal on the round's first turn", action: trade(0, 0), turnIdx: 0, wantErr: true },
    { name: "trade pot index out of range", action: trade(3, 0), turnIdx: 1, wantErr: true },
    { name: "trade hand index negative", action: trade(0, -1), turnIdx: 1, wantErr: true },
    { name: "exchange legal on the first turn", action: exchange(), turnIdx: 0, wantErr: false },
    { name: "exchange legal on a later turn", action: exchange(), turnIdx: 1, wantErr: false },
    { name: "knock legal on the first turn", action: knock(), turnIdx: 0, wantErr: false },
    { name: "knock legal on a later turn", action: knock(), turnIdx: 1, wantErr: false },
  ];
  for (const { name, action, turnIdx, wantErr } of cases) {
    if (wantErr) {
      assert.throws(() => validateAction(action, turnIdx), name);
    } else {
      assert.doesNotThrow(() => validateAction(action, turnIdx), name);
    }
  }
});

test("computeResult ranks with ties sharing a rank", () => {
  const r = newTestRound(
    [
      ["7h", "7d", "7c"], // 30.5
      ["Ah", "Ad", "Ac"], // 32 - winner
      ["7h", "8h", "9h"], // 24
      ["Th", "Td", "Tc"], // 30.5 - tied with seat 0
    ],
    ["7s", "8s", "9s"],
    [nilStrategy, nilStrategy, nilStrategy, nilStrategy],
  );

  const result = r.computeResult();

  const wantRank: Record<number, number> = { 0: 2, 1: 1, 2: 4, 3: 2 };
  for (const [seat, want] of Object.entries(wantRank)) {
    assert.equal(result.players[Number(seat)]?.rank, want, `seat ${seat}`);
  }
  assert.deepEqual(result.winners, [1]);
});

test("computeResult picks a single winner even with other ties", () => {
  const r = newTestRound(
    [
      ["Ah", "Ad", "Ac"], // 32
      ["As", "7h", "7d"], // 18
      ["9h", "9d", "9c"], // 30.5
      ["7c", "7s", "8c"], // 15
    ],
    ["Th", "Td", "Tc"],
    [nilStrategy, nilStrategy, nilStrategy, nilStrategy],
  );

  const result = r.computeResult();
  assert.deepEqual(result.winners, [0]);
});

test("run: knock ends the round after one full lap", async () => {
  const pass = passTurn();
  const knockOnce = (): Strategy => {
    let called = false;
    return strategyFunc(() => {
      if (!called) {
        called = true;
        return knock();
      }
      throw new Error("knocking seat was asked to act again");
    });
  };

  const r = newTestRound(
    [
      ["7h", "8h", "9h"],
      ["7c", "8c", "9c"],
      ["7d", "8d", "9d"],
      ["7s", "8s", "9s"],
    ],
    ["Ah", "Ac", "Ad"],
    [pass, knockOnce(), pass, pass],
  );
  r.firstSeat = 0;

  const { log, endReason } = await r.run();

  // Seat 0 keeps (turn 0), seat 1 knocks (turn 1), seats 2 and 3
  // each get one more turn (turns 2, 3), seat 0 gets its promised extra
  // lap turn (turn 4), then the round stops before seat 1 acts again.
  assert.equal(log.length, 5);
  assert.deepEqual(
    log.map((rec) => rec.seat),
    [0, 1, 2, 3, 0],
  );
  assert.equal(log[1]?.action.type, "knock");
  assert.deepEqual(endReason, { type: "knock", seat: 1 });
});

test("run: onTurn callback fires once per logged turn, in order", async () => {
  const pass = passTurn();
  const knockOnce = (): Strategy => {
    let called = false;
    return strategyFunc(() => {
      if (!called) {
        called = true;
        return knock();
      }
      return knock();
    });
  };

  const r = newTestRound(
    [
      ["7h", "8h", "9h"],
      ["7c", "8c", "9c"],
      ["7d", "8d", "9d"],
      ["7s", "8s", "9s"],
    ],
    ["Ah", "Ac", "Ad"],
    [pass, knockOnce(), pass, pass],
  );
  r.firstSeat = 0;

  const seen: TurnRecord[] = [];
  r.onTurn = (rec) => {
    seen.push(rec);
  };

  const { log } = await r.run();

  assert.equal(seen.length, log.length);
  assert.deepEqual(seen, log);
});

// Regression test: onTurn can return a Promise (e.g. a UI animating the
// turn's trade), and run() must await it before the next seat acts —
// otherwise an async onTurn and the next decide() call could race, and
// a UI animation could be interrupted by the next turn starting.
test("run: awaits an async onTurn before the next seat acts", async () => {
  const pass = passTurn();

  const r = newTestRound(
    [
      ["7h", "8h", "9h"],
      ["7c", "8c", "9c"],
      ["7d", "8d", "9d"],
      ["7s", "8s", "9s"],
    ],
    ["Ah", "Ac", "Ad"],
    [pass, strategyFunc(() => knock()), pass, pass],
  );
  r.firstSeat = 0;

  let turnResolved = false;
  let sawTurnResolved: boolean | undefined;
  r.onTurn = () =>
    new Promise<void>((resolve) => {
      setTimeout(() => {
        turnResolved = true;
        resolve();
      }, 0);
    });

  const origDecide = pass.decide.bind(pass);
  pass.decide = (view) => {
    if (sawTurnResolved === undefined && view.seat !== r.firstSeat) {
      sawTurnResolved = turnResolved;
    }
    return origDecide(view);
  };

  await r.run();

  assert.equal(sawTurnResolved, true);
});

test("run: a hand already at 31 for the round's very first actor ends the round before any turn", async () => {
  const neverCalled = strategyFunc((): Action => {
    throw new Error("strategy invoked when a 31 was already dealt to the round's first actor");
  });

  const r = newTestRound(
    [
      ["Ah", "Kh", "Th"],
      ["7c", "8c", "9c"],
      ["7d", "8d", "9d"],
      ["7s", "8s", "9s"],
    ],
    ["Kc", "Qd", "Jc"],
    [neverCalled, neverCalled, neverCalled, neverCalled],
  );

  const { log, result, endReason } = await r.run();
  assert.equal(log.length, 0);
  assert.deepEqual(result.winners, [0]);
  assert.deepEqual(endReason, { type: "31", seat: 0 });
});

test("run: a hand already at 31 for a later seat ends the round the moment their turn starts", async () => {
  // Seat 2 is dealt a 31 hand outright. Seats 0 and 1 still get their
  // normal turns first; the round ends before seat 2's decide() is
  // ever called, and seat 3 never gets a turn at all.
  const players: Player[] = [
    { seat: 0, hand: mustHand("7c", "8c", "9c"), strategy: passTurn() },
    { seat: 1, hand: mustHand("7d", "8d", "9d"), strategy: passTurn() },
    { seat: 2, hand: mustHand("Ah", "Kh", "Th"), strategy: nilStrategy },
    { seat: 3, hand: mustHand("7s", "8s", "9s"), strategy: nilStrategy },
  ];
  const r = new Round(mustPot("Kc", "Qd", "Jc"), players, 0);

  const { log, result, endReason } = await r.run();
  assert.equal(log.length, 2);
  assert.deepEqual(
    log.map((rec) => rec.seat),
    [0, 1],
  );
  assert.deepEqual(result.winners, [2]);
  assert.deepEqual(endReason, { type: "31", seat: 2 });
});

test("run: an exchange bringing the round's first actor to 31 ends the round immediately", async () => {
  const takePot = strategyFunc(() => exchange());
  const neverCalled = strategyFunc((): Action => {
    throw new Error("strategy invoked after the round's first-turn 31 should have ended it");
  });

  const players: Player[] = [
    { seat: 0, hand: mustHand("7h", "8h", "9h"), strategy: takePot },
    { seat: 1, hand: mustHand("7c", "8c", "9c"), strategy: neverCalled },
    { seat: 2, hand: mustHand("7d", "8d", "9d"), strategy: neverCalled },
    { seat: 3, hand: mustHand("7s", "8s", "9s"), strategy: neverCalled },
  ];
  const r = new Round(mustPot("Ah", "Kh", "Th"), players, 0);

  const { log, endReason } = await r.run();
  assert.equal(log.length, 1);
  assert.equal(log[0]?.action.type, "exchange");
  assert.equal(log[0]?.scoreAfter, 31);
  assert.deepEqual(endReason, { type: "31", seat: 0 });
});

test("run: a trade bringing a hand to 31 on that player's own first turn ends the round immediately", async () => {
  // Seat 0 keeps on the round's first turn (harmless). Seat 1's own
  // first turn (turnIdx 1, not the round's first turn) trades into a
  // hand scoring 31 -- with no first-turn exception, this ends the
  // round right there; seats 2, 3, and seat 0's second turn never act.
  const drawTo31 = strategyFunc(() => trade(1, 2));

  const players: Player[] = [
    { seat: 0, hand: mustHand("7c", "8c", "9c"), strategy: strategyFunc(() => knock()) },
    { seat: 1, hand: mustHand("Ah", "Kh", "Jc"), strategy: drawTo31 },
    { seat: 2, hand: mustHand("7d", "8d", "9d"), strategy: nilStrategy },
    { seat: 3, hand: mustHand("7s", "8s", "9s"), strategy: nilStrategy },
  ];
  // Seat 1's trade(1, 2) swaps its Jc for the pot's Th, completing 31
  // (A + K + T of hearts).
  const r = new Round(mustPot("Kc", "Th", "Qd"), players, 0);

  const { log, result } = await r.run();

  assert.equal(log.length, 2);
  assert.deepEqual(
    log.map((rec) => rec.seat),
    [0, 1],
  );
  assert.equal(log[1]?.scoreAfter, 31);
  assert.deepEqual(result.winners, [1]);
});

test("run: a trade bringing a hand to 31 on a later turn ends the round immediately", async () => {
  // Seat 0 keeps on the round's first turn, then trades into a 31 hand
  // on its own second turn (turnIdx 4) — the round must end right
  // there, before seat 1 (whose own second turn would be next) acts
  // again.
  let seat0Calls = 0;
  const seat0Strategy = strategyFunc(() => {
    seat0Calls++;
    return seat0Calls === 1 ? knock() : trade(1, 2);
  });
  let seat1Calls = 0;
  const seat1Strategy = strategyFunc(() => {
    seat1Calls++;
    if (seat1Calls > 1) {
      throw new Error("seat 1 should not be asked to act a second time");
    }
    return trade(0, 0);
  });

  const players: Player[] = [
    { seat: 0, hand: mustHand("Ah", "Kh", "7c"), strategy: seat0Strategy },
    { seat: 1, hand: mustHand("7h", "8h", "9c"), strategy: seat1Strategy },
    { seat: 2, hand: mustHand("7d", "8d", "9d"), strategy: passTurn() },
    { seat: 3, hand: mustHand("7s", "8s", "9s"), strategy: passTurn() },
  ];
  const r = new Round(mustPot("Kc", "Th", "Qd"), players, 0);

  const { log } = await r.run();

  assert.equal(seat0Calls, 2);
  assert.equal(seat1Calls, 1, "seat 1 must not get a second turn once seat 0 reaches 31");
  assert.equal(log.length, 5);
  assert.deepEqual(
    log.map((rec) => rec.seat),
    [0, 1, 2, 3, 0],
  );
  assert.equal(log[4]?.scoreAfter, 31);
});

test("run: a player dealt three aces is not auto-ended at the deal, and only ends the round by knocking", async () => {
  let seat1Calls = 0;
  const seat1Strategy = strategyFunc(() => {
    seat1Calls++;
    return knock();
  });

  const players: Player[] = [
    { seat: 0, hand: mustHand("7h", "8h", "9h"), strategy: passTurn() },
    { seat: 1, hand: mustHand("Ah", "Ad", "Ac"), strategy: seat1Strategy },
    { seat: 2, hand: mustHand("7d", "8d", "9d"), strategy: passTurn() },
    { seat: 3, hand: mustHand("7s", "8s", "9s"), strategy: passTurn() },
  ];
  const r = new Round(mustPot("Kc", "Qd", "Jc"), players, 0);

  const { log, result } = await r.run();

  assert.equal(seat1Calls, 1, "seat 1's decide() must be called normally despite holding three aces at the deal");
  // seat 1's knock (not on the round's first turn) ends the round
  // after seats 2, 3, and seat 0's second turn each get one more turn.
  assert.equal(log.length, 5);
  assert.deepEqual(
    log.map((rec) => rec.seat),
    [0, 1, 2, 3, 0],
  );
  assert.deepEqual(result.winners, [1]);
});

test("run: a trade completing three aces mid-round does not end the round", async () => {
  const keepOnFirstTurn = strategyFunc(() => knock());
  const drawAce = strategyFunc(() => trade(2, 0));
  let seat2Calls = 0;
  const seat2Strategy = strategyFunc(() => {
    seat2Calls++;
    return knock();
  });

  const players: Player[] = [
    { seat: 0, hand: mustHand("7c", "8c", "9c"), strategy: keepOnFirstTurn },
    { seat: 1, hand: mustHand("7h", "Ad", "Ac"), strategy: drawAce },
    { seat: 2, hand: mustHand("7d", "8d", "9d"), strategy: seat2Strategy },
    { seat: 3, hand: mustHand("7s", "8s", "9s"), strategy: passTurn() },
  ];
  const r = new Round(mustPot("Kh", "Kc", "Ah"), players, 0);

  const { log } = await r.run();

  assert.equal(seat2Calls, 1, "play must continue past seat 1's three aces to seat 2");
  assert.equal(log[1]?.scoreAfter, 32);
  // seat 2's knock ends the round after seats 3, 0, and 1 each get one
  // more turn.
  assert.equal(log.length, 6);
  assert.deepEqual(
    log.map((rec) => rec.seat),
    [0, 1, 2, 3, 0, 1],
  );
});

test("run: a 32-holder's Keep on the round's first turn does not end it", async () => {
  let seat1Calls = 0;
  const seat1Strategy = strategyFunc(() => {
    seat1Calls++;
    return knock();
  });

  const players: Player[] = [
    { seat: 0, hand: mustHand("Ah", "Ad", "Ac"), strategy: strategyFunc(() => knock()) },
    { seat: 1, hand: mustHand("7c", "8c", "9c"), strategy: seat1Strategy },
    { seat: 2, hand: mustHand("7d", "8d", "9d"), strategy: passTurn() },
    { seat: 3, hand: mustHand("7s", "8s", "9s"), strategy: passTurn() },
  ];
  const r = new Round(mustPot("Kh", "Kc", "Kd"), players, 0);

  const { log } = await r.run();

  assert.equal(seat1Calls, 1, "play must continue past seat 0's Keep despite holding three aces");
  // seat 1's real knock ends the round after seats 2, 3, and seat 0's
  // second turn each get one more turn.
  assert.equal(log.length, 5);
  assert.deepEqual(
    log.map((rec) => rec.seat),
    [0, 1, 2, 3, 0],
  );
});

test("run: a 32 held by one player still wins even though the round ends via another player's 31 first", async () => {
  // North (seat 2) secretly completes three aces on an earlier turn,
  // but it isn't North's turn again by the time East (seat 3) trades
  // into a 31 -- East's 31 ends the round immediately, before North
  // ever gets a chance to knock. North still wins: computeResult
  // scores every player's final hand, and North's is still 32.
  const southKeep = strategyFunc(() => knock());
  const westSafeTrade = strategyFunc(() => trade(2, 0));
  let northCalls = 0;
  const northStrategy = strategyFunc(() => {
    northCalls++;
    if (northCalls > 1) {
      throw new Error("North should not be asked to act a second time");
    }
    return trade(0, 2);
  });
  const eastStrategy = strategyFunc(() => trade(1, 2));

  const players: Player[] = [
    { seat: 0, hand: mustHand("7d", "8d", "9d"), strategy: southKeep },
    { seat: 1, hand: mustHand("7h", "8h", "9h"), strategy: westSafeTrade },
    { seat: 2, hand: mustHand("Ah", "Ad", "7c"), strategy: northStrategy },
    { seat: 3, hand: mustHand("As", "Ks", "7s"), strategy: eastStrategy },
  ];
  const r = new Round(mustPot("Ac", "Qs", "9c"), players, 0);

  const { log, result } = await r.run();

  assert.equal(northCalls, 1, "North must not be asked to act again once East's 31 ends the round");
  assert.equal(log.length, 4);
  assert.deepEqual(
    log.map((rec) => rec.seat),
    [0, 1, 2, 3],
  );
  assert.equal(log[3]?.scoreAfter, 31);

  const north = result.players.find((pr) => pr.seat === 2);
  assert.equal(north?.score, 32, "North's hand must still score 32 at final scoring");
  assert.deepEqual(result.winners, [2], "North's 32 must win despite East's 31 ending the round");
});

test("run: isFirstTurnOfRound is true for exactly one decide call", async () => {
  let firstTurnCalls = 0;
  const spy = (): Strategy =>
    strategyFunc((v: PlayerView) => {
      if (v.isFirstTurnOfRound) {
        firstTurnCalls++;
      }
      return trade(0, 0);
    });
  const knockSoon = (): Strategy => {
    let n = 0;
    return strategyFunc((v: PlayerView) => {
      if (v.isFirstTurnOfRound) {
        firstTurnCalls++;
      }
      n++;
      if (n >= 2) {
        return knock();
      }
      // trade isn't legal on the round's first turn.
      return v.isFirstTurnOfRound ? knock() : trade(0, 0);
    });
  };

  const r = newTestRound(
    [
      ["7h", "8h", "9h"],
      ["7c", "8c", "9c"],
      ["7d", "8d", "9d"],
      ["7s", "8s", "9s"],
    ],
    ["Kh", "Kc", "Kd"],
    [knockSoon(), spy(), spy(), spy()],
  );
  r.firstSeat = 0;

  await r.run();
  assert.equal(firstTurnCalls, 1);
});

test("run: the view passed to a strategy matches ground truth", async () => {
  const seatHands: [
    [string, string, string],
    [string, string, string],
    [string, string, string],
    [string, string, string],
  ] = [
    ["7h", "8h", "9h"],
    ["7c", "8c", "9c"],
    ["7d", "8d", "9d"],
    ["7s", "8s", "9s"],
  ];

  const r = newTestRound(seatHands, ["Kh", "Kc", "Kd"], [nilStrategy, nilStrategy, nilStrategy, nilStrategy]);
  r.firstSeat = 0;

  const checker = (seat: number): Strategy =>
    strategyFunc((v: PlayerView) => {
      assert.equal(v.seat, seat);
      assert.deepEqual(v.hand, r.players[seat]?.hand);
      assert.deepEqual(v.pot, r.pot);
      return knock();
    });

  (r.players[0] as Player).strategy = strategyFunc(() => knock());
  (r.players[1] as Player).strategy = checker(1);
  (r.players[2] as Player).strategy = checker(2);
  (r.players[3] as Player).strategy = checker(3);

  await r.run();
});

test("run: exchanging on the round's first turn does not end it", async () => {
  // Seat 0 exchanges on the round's very first turn, which must not end
  // the round; seat 1 then knocks to end it, proving seat 0's exchange
  // was just a swap.
  const exchangeOnFirstTurn = strategyFunc((v: PlayerView) => (v.isFirstTurnOfRound ? exchange() : trade(0, 0)));
  const knockOnce = (): Strategy => {
    let called = false;
    return strategyFunc(() => {
      if (!called) {
        called = true;
        return knock();
      }
      throw new Error("knocking seat was asked to act again");
    });
  };

  const r = newTestRound(
    [
      ["7h", "8h", "9h"],
      ["7c", "8c", "9c"],
      ["7d", "8d", "9d"],
      ["7s", "8s", "9s"],
    ],
    ["Kh", "Kc", "Kd"],
    [exchangeOnFirstTurn, knockOnce(), exchangeOnFirstTurn, exchangeOnFirstTurn],
  );
  r.firstSeat = 0;

  const { log } = await r.run();

  assert.equal(log.length, 5, "round must not have ended at seat 0's first-turn exchange");
  assert.equal(log[0]?.action.type, "exchange");
  assert.equal(log[1]?.action.type, "knock");
});

test("run: knocking on the round's first turn (Keep) does not end it", async () => {
  // Seat 0 knocks (Keeps) on the round's very first turn, which must
  // not end the round; seat 1 then knocks for real to end it, proving
  // seat 0's Keep was inert.
  const keepOnFirstTurn = strategyFunc((v: PlayerView) => (v.isFirstTurnOfRound ? knock() : trade(0, 0)));
  const knockOnce = (): Strategy => {
    let called = false;
    return strategyFunc(() => {
      if (!called) {
        called = true;
        return knock();
      }
      throw new Error("knocking seat was asked to act again");
    });
  };

  const r = newTestRound(
    [
      ["7h", "8h", "9h"],
      ["7c", "8c", "9c"],
      ["7d", "8d", "9d"],
      ["7s", "8s", "9s"],
    ],
    ["Kh", "Kc", "Kd"],
    [keepOnFirstTurn, knockOnce(), keepOnFirstTurn, keepOnFirstTurn],
  );
  r.firstSeat = 0;

  const { log } = await r.run();

  assert.equal(log.length, 5, "round must not have ended at seat 0's first-turn Keep");
  assert.equal(log[0]?.action.type, "knock");
  assert.equal(log[1]?.action.type, "knock");
});

test("run: exchanging after the first turn acts as a knock", async () => {
  const pass = passTurn();
  const exchangeOnce = (): Strategy => {
    let called = false;
    return strategyFunc(() => {
      if (!called) {
        called = true;
        return exchange();
      }
      throw new Error("exchanging seat was asked to act again");
    });
  };

  const r = newTestRound(
    [
      ["7h", "8h", "9h"],
      ["7c", "8c", "9c"],
      ["7d", "8d", "9d"],
      ["7s", "8s", "9s"],
    ],
    ["Kh", "Kc", "Kd"],
    [pass, exchangeOnce(), pass, pass],
  );
  r.firstSeat = 0;

  const { log } = await r.run();

  // Seat 1's exchange (turn 1, not the round's first turn) must end the
  // round exactly like a knock: seats 2, 3, and 0 each get one more
  // turn, then the round stops before seat 1 acts again.
  assert.equal(log.length, 5);
  assert.deepEqual(
    log.map((rec) => rec.seat),
    [0, 1, 2, 3, 0],
  );
  assert.equal(log[1]?.action.type, "exchange");
});

test("newRound deals distinct hands and a pot from a full deck", () => {
  const seats = [0, 1, 2, 3].map((seat) => ({ seat, strategy: nilStrategy }));
  const r = newRound(42, seats, 2);

  const seen = new Set<string>();
  for (const p of r.players) {
    for (const c of p.hand) {
      const key = c.rank + c.suit;
      assert.equal(seen.has(key), false, `duplicate card ${key}`);
      seen.add(key);
    }
  }
  for (const c of r.pot) {
    const key = c.rank + c.suit;
    assert.equal(seen.has(key), false, `duplicate card ${key}`);
    seen.add(key);
  }
  assert.equal(seen.size, 15);
  assert.equal(r.firstSeat, 2);
});

test("newRound deals only to the given seats when fewer than four are active", () => {
  const seats = [0, 2, 3].map((seat) => ({ seat, strategy: nilStrategy }));
  const r = newRound(42, seats, 3);

  assert.deepEqual(
    r.players.map((p) => p.seat),
    [0, 2, 3],
  );
  const seen = new Set<string>();
  for (const p of r.players) {
    for (const c of p.hand) {
      const key = c.rank + c.suit;
      assert.equal(seen.has(key), false, `duplicate card ${key}`);
      seen.add(key);
    }
  }
  for (const c of r.pot) {
    const key = c.rank + c.suit;
    assert.equal(seen.has(key), false, `duplicate card ${key}`);
    seen.add(key);
  }
  assert.equal(seen.size, 12);
  assert.equal(r.firstSeat, 3);
});

test("run cycles turn order among sparse seats in clockwise (ascending, wrapping) order", async () => {
  const pass = passTurn();
  const knockOnce = (): Strategy => {
    let called = false;
    return strategyFunc(() => {
      if (!called) {
        called = true;
        return knock();
      }
      throw new Error("knocking seat was asked to act again");
    });
  };

  const players: Player[] = [0, 2, 3].map((seat) => ({
    seat,
    hand: mustHand("7h", "8h", "9h"),
    strategy: seat === 2 ? knockOnce() : pass,
  }));
  const r = new Round(mustPot("Ah", "Ac", "Ad"), players, 0);

  const { log } = await r.run();

  // Seat 0 acts, seat 2 knocks, seat 3 gets one more turn, then seat 0
  // gets its promised extra lap turn, then the round stops before seat 2
  // (the knocker) acts again. Seat 1 doesn't exist in this round at all.
  assert.deepEqual(
    log.map((rec) => rec.seat),
    [0, 2, 3, 0],
  );
});

test("newRound with a RoundDealOverride", () => {
  const seats = [0, 1, 2, 3].map((seat) => ({ seat, strategy: nilStrategy }));

  const cases: Array<{ name: string; override: RoundDealOverride }> = [
    {
      name: "assigned hand only",
      override: { assignedHands: new Map([[2, mustHand("7s", "8h", "9c")]]) },
    },
    {
      name: "assigned pot only",
      override: { assignedPot: mustPot("Ts", "Jh", "Qc") },
    },
    {
      name: "assigned hands and pot together",
      override: {
        assignedHands: new Map([
          [0, mustHand("7s", "8s", "9s")],
          [3, mustHand("7h", "8h", "9h")],
        ]),
        assignedPot: mustPot("Ts", "Jc", "Qd"),
      },
    },
  ];

  for (const { name, override } of cases) {
    const r = newRound(42, seats, 0, override);

    for (const [seat, hand] of override.assignedHands ?? []) {
      assert.deepEqual(r.players.find((p) => p.seat === seat)?.hand, hand, `${name}: assigned hand`);
    }
    if (override.assignedPot) {
      assert.deepEqual(r.pot, override.assignedPot, `${name}: assigned pot`);
    }

    // Every card across every hand and the pot is unique — the assigned
    // cards were correctly removed from the deck before the rest was
    // dealt, so nothing collides.
    const seen = new Set<string>();
    for (const p of r.players) {
      for (const c of p.hand) {
        const key = c.rank + c.suit;
        assert.equal(seen.has(key), false, `${name}: duplicate card ${key}`);
        seen.add(key);
      }
    }
    for (const c of r.pot) {
      const key = c.rank + c.suit;
      assert.equal(seen.has(key), false, `${name}: duplicate card ${key}`);
      seen.add(key);
    }
    assert.equal(seen.size, 15, name);
  }
});

test("newRound's firstSeat parameter is honored alongside a RoundDealOverride", () => {
  const seats = [0, 1, 2, 3].map((seat) => ({ seat, strategy: nilStrategy }));
  const r = newRound(42, seats, 3, { assignedHands: new Map([[2, mustHand("7s", "8h", "9c")]]) });
  assert.equal(r.firstSeat, 3);
});

test("run: onRoundStart fires once per active seat before any decide() call", async () => {
  const events: string[] = [];
  const spy = (seat: number): Strategy => ({
    onRoundStart: () => events.push(`start:${seat}`),
    decide: () => {
      events.push(`decide:${seat}`);
      return knock();
    },
  });

  const r = newTestRound(
    [
      ["7h", "8h", "9h"],
      ["7c", "8c", "9c"],
      ["7d", "8d", "9d"],
      ["7s", "8s", "9s"],
    ],
    ["Ah", "Ac", "Ad"],
    [spy(0), spy(1), spy(2), spy(3)],
  );
  r.firstSeat = 0;

  await r.run();

  const startEvents = events.filter((e) => e.startsWith("start:"));
  const firstDecideIdx = events.findIndex((e) => e.startsWith("decide:"));
  assert.equal(startEvents.length, 4);
  assert.ok(
    events.slice(0, firstDecideIdx).every((e) => e.startsWith("start:")),
    "every onRoundStart must fire before the first decide()",
  );
});

test("run: onRoundStart fires even when a 31 is already dealt to the round's first actor", async () => {
  let starts = 0;
  const neverDecides: Strategy = {
    onRoundStart: () => {
      starts++;
    },
    decide: (): Action => {
      throw new Error("strategy invoked when a 31 was already dealt");
    },
  };

  const r = newTestRound(
    [
      ["Ah", "Kh", "Th"],
      ["7c", "8c", "9c"],
      ["7d", "8d", "9d"],
      ["7s", "8s", "9s"],
    ],
    ["Kc", "Qd", "Jc"],
    [neverDecides, neverDecides, neverDecides, neverDecides],
  );

  await r.run();
  assert.equal(starts, 4);
});

// Regression test for specs/state.md's resumed-round checkpoint: a
// strategy resumed mid-round (e.g. a bot rebuilt from saved memory,
// specs/bots.md) must not have that memory wiped by a second
// onRoundStart -- only a round genuinely starting at turnIndex 0
// should reset it.
test("run: onRoundStart does not fire again when a round resumes with turnIndex > 0", async () => {
  let starts = 0;
  const spy: Strategy = {
    onRoundStart: () => {
      starts++;
    },
    decide: () => knock(),
  };

  const r = newTestRound(
    [
      ["7h", "8h", "9h"],
      ["7c", "8c", "9c"],
      ["7d", "8d", "9d"],
      ["7s", "8s", "9s"],
    ],
    ["Kh", "Kc", "Kd"],
    [spy, spy, spy, spy],
  );
  r.turnIndex = 1;

  await r.run();
  assert.equal(starts, 0);
});

test("run: observe broadcasts the same redacted PublicTurn to every active seat, in order", async () => {
  const logs: PublicTurn[][] = [[], [], [], []];
  const pass = (seat: number): Strategy => ({
    // trade isn't legal on the round's first turn.
    decide: (v) => (v.isFirstTurnOfRound ? knock() : trade(0, 0)),
    observe: (turn) => logs[seat]?.push(turn),
  });
  const knockOnce = (seat: number): Strategy => {
    let called = false;
    return {
      decide: () => {
        if (!called) {
          called = true;
          return knock();
        }
        throw new Error("knocking seat was asked to act again");
      },
      observe: (turn) => logs[seat]?.push(turn),
    };
  };

  const r = newTestRound(
    [
      ["7h", "8h", "9h"],
      ["7c", "8c", "9c"],
      ["7d", "8d", "9d"],
      ["7s", "8s", "9s"],
    ],
    ["Ah", "Ac", "Ad"],
    [pass(0), knockOnce(1), pass(2), pass(3)],
  );
  r.firstSeat = 0;

  const { log } = await r.run();
  assert.equal(log.length, 5);

  // Every seat, including the knocker (who takes no further turns but
  // stays part of the round), must see all 5 turns, in order, and every
  // seat must see exactly the same thing for a given turn.
  for (const seatLog of logs) {
    assert.equal(seatLog.length, 5);
  }
  for (let i = 0; i < 5; i++) {
    assert.deepEqual(logs[1]?.[i], logs[0]?.[i], `turn ${i}`);
    assert.deepEqual(logs[2]?.[i], logs[0]?.[i], `turn ${i}`);
    assert.deepEqual(logs[3]?.[i], logs[0]?.[i], `turn ${i}`);
  }

  assert.deepEqual(logs[0]?.[0], { seat: 0, type: "knock", given: [], taken: [] });
  assert.deepEqual(logs[0]?.[1], { seat: 1, type: "knock", given: [], taken: [] });
});

test("run: observe reports a first-turn exchange (Take Pot) with the taken pot redacted", async () => {
  // The pot is still private on the round's first turn (specs/rules.md),
  // so what the acting seat draws from it must never be broadcast via
  // observe() — only what they gave up (their old hand, which becomes
  // the round's new public pot) is safe to report.
  const seen: PublicTurn[] = [];
  const exchangeOnce = (): Strategy => {
    let called = false;
    return {
      decide: (v: PlayerView) => {
        if (v.isFirstTurnOfRound && !called) {
          called = true;
          return exchange();
        }
        return knock();
      },
      observe: (turn) => seen.push(turn),
    };
  };
  const pass: Strategy = { decide: () => knock() };

  const r = newTestRound(
    [
      ["7h", "8h", "9h"],
      ["7c", "8c", "9c"],
      ["7d", "8d", "9d"],
      ["7s", "8s", "9s"],
    ],
    ["Ah", "Ac", "Ad"],
    [exchangeOnce(), pass, pass, pass],
  );
  r.firstSeat = 0;

  await r.run();

  assert.deepEqual(seen[0], {
    seat: 0,
    type: "exchange",
    given: [parseCard("7h"), parseCard("8h"), parseCard("9h")],
    taken: [],
  });
});

test("run: observe reports a later-turn exchange as all three cards given and taken", async () => {
  const seen: PublicTurn[] = [];
  const exchangeSecond = (): Strategy => {
    let called = false;
    return {
      decide: (v: PlayerView) => {
        if (!v.isFirstTurnOfRound && !called) {
          called = true;
          return exchange();
        }
        return knock();
      },
      observe: (turn) => seen.push(turn),
    };
  };
  const pass: Strategy = { decide: () => knock() };

  const r = newTestRound(
    [
      ["7h", "8h", "9h"],
      ["7c", "8c", "9c"],
      ["7d", "8d", "9d"],
      ["7s", "8s", "9s"],
    ],
    ["Ah", "Ac", "Ad"],
    [pass, exchangeSecond(), pass, pass],
  );
  r.firstSeat = 0;

  await r.run();

  const turn = seen.find((t) => t.seat === 1);
  assert.deepEqual(turn, {
    seat: 1,
    type: "exchange",
    given: [parseCard("7c"), parseCard("8c"), parseCard("9c")],
    taken: [parseCard("Ah"), parseCard("Ac"), parseCard("Ad")],
  });
});

test("run: strategies that implement only decide are unaffected by the new hooks", async () => {
  const pass = passTurn();
  const r = newTestRound(
    [
      ["7h", "8h", "9h"],
      ["7c", "8c", "9c"],
      ["7d", "8d", "9d"],
      ["7s", "8s", "9s"],
    ],
    ["Ah", "Ac", "Ad"],
    [pass, strategyFunc(() => knock()), pass, pass],
  );
  r.firstSeat = 0;
  const { log } = await r.run();
  assert.equal(log.length, 5);
});

test("newRound with a RoundDealOverride honors turnIndex/knocked/knockerSeat", () => {
  const seats = [0, 1, 2, 3].map((seat) => ({ seat, strategy: nilStrategy }));
  const r = newRound(42, seats, 1, { turnIndex: 5, knocked: true, knockerSeat: 2 });
  assert.equal(r.turnIndex, 5);
  assert.equal(r.knocked, true);
  assert.equal(r.knockerSeat, 2);
});

// Regression test for specs/state.md's resumed-round checkpoint: a
// round resumed with turnIndex > 0 must not treat its next turn as the
// round's first turn — otherwise an exchange that's actually the
// round's 2nd+ turn would wrongly be treated as a harmless swap
// instead of ending the round like a knock.
test("run: a round resumed with turnIndex > 0 never reports isFirstTurnOfRound again", async () => {
  let sawFirstTurn = false;
  const exchangeOnce = (): Strategy => {
    let called = false;
    return strategyFunc((v: PlayerView) => {
      if (v.isFirstTurnOfRound) {
        sawFirstTurn = true;
      }
      if (!called) {
        called = true;
        return exchange();
      }
      throw new Error("exchanging seat was asked to act again");
    });
  };
  const pass = strategyFunc((v: PlayerView) => {
    if (v.isFirstTurnOfRound) {
      sawFirstTurn = true;
    }
    return trade(0, 0);
  });

  const r = newTestRound(
    [
      ["7h", "8h", "9h"],
      ["7c", "8c", "9c"],
      ["7d", "8d", "9d"],
      ["7s", "8s", "9s"],
    ],
    ["Kh", "Kc", "Kd"],
    [pass, exchangeOnce(), pass, pass],
  );
  r.firstSeat = 1;
  r.turnIndex = 1;

  const { log } = await r.run();

  assert.equal(sawFirstTurn, false, "a resumed round must never report isFirstTurnOfRound");
  // Seat 1's exchange (its first decide() call this session, but the
  // round's 2nd turn overall since turnIndex started at 1) must end the
  // round exactly like a knock: seats 2, 3, and 0 each get one more
  // turn, then the round stops before seat 1 acts again.
  assert.equal(log.length, 4);
  assert.deepEqual(
    log.map((rec) => rec.seat),
    [1, 2, 3, 0],
  );
  assert.equal(log[0]?.turnIndex, 1);
});

// Regression test: a round resumed already knocked must end once play
// wraps back around to the knocker, giving every other seat exactly
// one more turn — not a full extra round.
test("run: a round resumed already knocked ends after the remaining seats' one lap", async () => {
  const pass = passTurn();
  const neverCalled = strategyFunc((): Action => {
    throw new Error("knocker should not be asked to act again");
  });

  const r = newTestRound(
    [
      ["7h", "8h", "9h"],
      ["7c", "8c", "9c"],
      ["7d", "8d", "9d"],
      ["7s", "8s", "9s"],
    ],
    ["Ah", "Ac", "Ad"],
    [pass, neverCalled, pass, pass],
  );
  r.firstSeat = 2;
  r.knocked = true;
  r.knockerSeat = 1;

  const { log } = await r.run();

  // Seats 2, 3, and 0 (the seats other than the knocker) each get
  // their one remaining turn, then the round stops before seat 1 (the
  // knocker) acts again.
  assert.equal(log.length, 3);
  assert.deepEqual(
    log.map((rec) => rec.seat),
    [2, 3, 0],
  );
});

// Regression test: resuming exactly at the knocker (the round had
// already fully played out before the checkpoint was taken) must end
// the round immediately, with no further turns, and compute the
// result from the hands as they already stand.
test("run: resuming a round already back at the knocker takes no further turns", async () => {
  const neverCalled = strategyFunc((): Action => {
    throw new Error("no seat should be asked to act in an already-finished round");
  });

  const r = newTestRound(
    [
      ["7h", "8h", "9h"],
      ["Ah", "Ad", "Ac"],
      ["7d", "8d", "9d"],
      ["7s", "8s", "9s"],
    ],
    ["Kh", "Kc", "Kd"],
    [neverCalled, neverCalled, neverCalled, neverCalled],
  );
  r.firstSeat = 1;
  r.knocked = true;
  r.knockerSeat = 1;

  const { log, result } = await r.run();

  assert.equal(log.length, 0);
  assert.deepEqual(result.winners, [1]);
});
