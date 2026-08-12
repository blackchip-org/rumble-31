import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCard } from "../card/card.ts";
import type { Card } from "../card/card.ts";
import { score } from "../card/score.ts";
import { Round, newRound, validateAction } from "./round.ts";
import type { RoundDealOverride } from "./round.ts";
import { trade, exchange, knock, strategyFunc } from "./types.ts";
import type { Action, Hand, Player, Pot, PlayerView, Strategy, TurnRecord } from "./types.ts";

function mustHand(...notation: [string, string, string]): Hand {
  return [parseCard(notation[0]), parseCard(notation[1]), parseCard(notation[2])];
}

function mustPot(...notation: [string, string, string]): Pot {
  return mustHand(...notation);
}

const nilStrategy: Strategy = strategyFunc(() => {
  throw new Error("nilStrategy should never be called");
});

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
  const cases: Array<{ name: string; action: Action; wantErr: boolean }> = [
    { name: "trade legal", action: trade(0, 0), wantErr: false },
    { name: "trade pot index out of range", action: trade(3, 0), wantErr: true },
    { name: "trade hand index negative", action: trade(0, -1), wantErr: true },
    { name: "exchange legal", action: exchange(), wantErr: false },
    { name: "knock legal", action: knock(), wantErr: false },
  ];
  for (const { name, action, wantErr } of cases) {
    if (wantErr) {
      assert.throws(() => validateAction(action), name);
    } else {
      assert.doesNotThrow(() => validateAction(action), name);
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
  const pass = strategyFunc(() => trade(0, 0));
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

  const { log } = await r.run();

  // Seat 0 exchanges (turn 0), seat 1 knocks (turn 1), seats 2 and 3
  // each get one more turn (turns 2, 3), seat 0 gets its promised extra
  // lap turn (turn 4), then the round stops before seat 1 acts again.
  assert.equal(log.length, 5);
  assert.deepEqual(
    log.map((rec) => rec.seat),
    [0, 1, 2, 3, 0],
  );
  assert.equal(log[1]?.action.type, "knock");
});

test("run: onTurn callback fires once per logged turn, in order", async () => {
  const pass = strategyFunc(() => trade(0, 0));
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
  const pass = strategyFunc(() => trade(0, 0));

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

test("run: three aces mid-round ends the round immediately", async () => {
  // Seat 0 exchanges its 7h for the pot's third ace, completing three
  // aces mid-round; the round must stop right there.
  const drawAce = strategyFunc(() => trade(2, 0));
  const neverCalled = strategyFunc((): Action => {
    throw new Error("strategy invoked after three-aces should have ended the round");
  });

  const r = newTestRound(
    [
      ["7h", "Ad", "Ac"],
      ["7c", "8c", "9c"],
      ["7d", "8d", "9d"],
      ["7s", "8s", "9s"],
    ],
    ["Kh", "Kc", "Ah"],
    [drawAce, neverCalled, neverCalled, neverCalled],
  );
  r.firstSeat = 0;

  const { log } = await r.run();
  assert.equal(log.length, 1);
});

test("run: three aces already dealt ends the round with no turns", async () => {
  const neverCalled = strategyFunc((): Action => {
    throw new Error("strategy invoked when three aces were already dealt");
  });

  const r = newTestRound(
    [
      ["Ah", "Ad", "Ac"],
      ["7c", "8c", "9c"],
      ["7d", "8d", "9d"],
      ["7s", "8s", "9s"],
    ],
    ["Kh", "Kc", "As"],
    [neverCalled, neverCalled, neverCalled, neverCalled],
  );

  const { log } = await r.run();
  assert.equal(log.length, 0);
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
      return trade(0, 0);
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

  (r.players[0] as Player).strategy = strategyFunc(() => trade(0, 0));
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

test("run: exchanging after the first turn acts as a knock", async () => {
  const pass = strategyFunc(() => trade(0, 0));
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
    ["Ah", "Ac", "Ad"],
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
  const r = newRound(42, seats);

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
  assert.ok(r.firstSeat >= 0 && r.firstSeat < 4);
});

test("newRound deals only to the given seats when fewer than four are active", () => {
  const seats = [0, 2, 3].map((seat) => ({ seat, strategy: nilStrategy }));
  const r = newRound(42, seats);

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
  assert.ok([0, 2, 3].includes(r.firstSeat));
});

test("run cycles turn order among sparse seats in clockwise (ascending, wrapping) order", async () => {
  const pass = strategyFunc(() => trade(0, 0));
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
    const r = newRound(42, seats, override);

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

test("newRound with a RoundDealOverride honors a forced firstSeat", () => {
  const seats = [0, 1, 2, 3].map((seat) => ({ seat, strategy: nilStrategy }));
  const r = newRound(42, seats, { firstSeat: 3 });
  assert.equal(r.firstSeat, 3);
});

test("newRound with a RoundDealOverride honors turnIndex/knocked/knockerSeat", () => {
  const seats = [0, 1, 2, 3].map((seat) => ({ seat, strategy: nilStrategy }));
  const r = newRound(42, seats, { turnIndex: 5, knocked: true, knockerSeat: 2 });
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
  const pass = strategyFunc(() => trade(0, 0));
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
