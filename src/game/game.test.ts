import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCard } from "../card/card.ts";
import type { Card } from "../card/card.ts";
import { score } from "../card/score.ts";
import { Game, newGame, validateAction } from "./game.ts";
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

function newTestGame(
  hands: [[string, string, string], [string, string, string], [string, string, string], [string, string, string]],
  pot: [string, string, string],
  strategies: [Strategy, Strategy, Strategy, Strategy],
): Game {
  const players: Player[] = [0, 1, 2, 3].map((seat) => ({
    seat,
    hand: mustHand(...(hands[seat] as [string, string, string])),
    strategy: strategies[seat] as Strategy,
  }));
  return new Game(mustPot(...pot), players);
}

test("apply: trade swaps one card each way", () => {
  const g = newTestGame(
    [
      ["7h", "8h", "9h"],
      ["7c", "8c", "9c"],
      ["7d", "8d", "9d"],
      ["7s", "8s", "9s"],
    ],
    ["Ah", "Ac", "Ad"],
    [nilStrategy, nilStrategy, nilStrategy, nilStrategy],
  );

  const rec = g.apply(0, trade(1, 2), 0);

  assert.deepEqual(g.players[0]?.hand, mustHand("7h", "8h", "Ac"));
  assert.deepEqual(g.pot, mustPot("Ah", "9h", "Ad"));
  assert.equal(rec.scoreAfter, score(g.players[0]?.hand as Hand));
  assert.deepEqual(g.players[1]?.hand, mustHand("7c", "8c", "9c"));
});

test("apply: exchange swaps entire hand with pot", () => {
  const hand: [string, string, string] = ["7h", "8h", "9h"];
  const pot: [string, string, string] = ["Ah", "Ac", "Ad"];
  const g = newTestGame(
    [hand, ["7c", "8c", "9c"], ["7d", "8d", "9d"], ["7s", "8s", "9s"]],
    pot,
    [nilStrategy, nilStrategy, nilStrategy, nilStrategy],
  );

  g.apply(0, exchange(), 0);

  assert.deepEqual(g.players[0]?.hand, mustPot(...pot));
  assert.deepEqual(g.pot, mustHand(...hand));
});

test("apply: knock changes nothing", () => {
  const hand: [string, string, string] = ["7h", "8h", "9h"];
  const pot: [string, string, string] = ["Ah", "Ac", "Ad"];
  const g = newTestGame(
    [hand, ["7c", "8c", "9c"], ["7d", "8d", "9d"], ["7s", "8s", "9s"]],
    pot,
    [nilStrategy, nilStrategy, nilStrategy, nilStrategy],
  );

  g.apply(0, knock(), 0);

  assert.deepEqual(g.players[0]?.hand, mustHand(...hand));
  assert.deepEqual(g.pot, mustPot(...pot));
});

test("validateAction", () => {
  const cases: Array<{ name: string; isFirstTurn: boolean; action: Action; wantErr: boolean }> = [
    { name: "trade legal any turn", isFirstTurn: false, action: trade(0, 0), wantErr: false },
    { name: "trade legal on first turn", isFirstTurn: true, action: trade(2, 1), wantErr: false },
    { name: "trade pot index out of range", isFirstTurn: false, action: trade(3, 0), wantErr: true },
    { name: "trade hand index negative", isFirstTurn: false, action: trade(0, -1), wantErr: true },
    { name: "exchange legal on first turn", isFirstTurn: true, action: exchange(), wantErr: false },
    { name: "exchange legal on other turns too", isFirstTurn: false, action: exchange(), wantErr: false },
    { name: "knock illegal on first turn", isFirstTurn: true, action: knock(), wantErr: true },
    { name: "knock legal on other turns", isFirstTurn: false, action: knock(), wantErr: false },
  ];
  for (const { name, isFirstTurn, action, wantErr } of cases) {
    if (wantErr) {
      assert.throws(() => validateAction(isFirstTurn, action), name);
    } else {
      assert.doesNotThrow(() => validateAction(isFirstTurn, action), name);
    }
  }
});

test("computeResult ranks with ties sharing a rank", () => {
  const g = newTestGame(
    [
      ["7h", "7d", "7c"], // 30.5
      ["Ah", "Ad", "Ac"], // 32 - winner
      ["7h", "8h", "9h"], // 24
      ["Th", "Td", "Tc"], // 30.5 - tied with seat 0
    ],
    ["7s", "8s", "9s"],
    [nilStrategy, nilStrategy, nilStrategy, nilStrategy],
  );

  const result = g.computeResult();

  const wantRank: Record<number, number> = { 0: 2, 1: 1, 2: 4, 3: 2 };
  for (const [seat, want] of Object.entries(wantRank)) {
    assert.equal(result.players[Number(seat)]?.rank, want, `seat ${seat}`);
  }
  assert.deepEqual(result.winners, [1]);
});

test("computeResult picks a single winner even with other ties", () => {
  const g = newTestGame(
    [
      ["Ah", "Ad", "Ac"], // 32
      ["As", "7h", "7d"], // 18
      ["9h", "9d", "9c"], // 30.5
      ["7c", "7s", "8c"], // 15
    ],
    ["Th", "Td", "Tc"],
    [nilStrategy, nilStrategy, nilStrategy, nilStrategy],
  );

  const result = g.computeResult();
  assert.deepEqual(result.winners, [0]);
});

test("run: knock ends the game after one full lap", async () => {
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

  const g = newTestGame(
    [
      ["7h", "8h", "9h"],
      ["7c", "8c", "9c"],
      ["7d", "8d", "9d"],
      ["7s", "8s", "9s"],
    ],
    ["Ah", "Ac", "Ad"],
    [pass, knockOnce(), pass, pass],
  );
  g.firstSeat = 0;

  const { log } = await g.run();

  // Seat 0 exchanges (turn 0), seat 1 knocks (turn 1), seats 2 and 3
  // each get one more turn (turns 2, 3), seat 0 gets its promised extra
  // lap turn (turn 4), then the game stops before seat 1 acts again.
  assert.equal(log.length, 5);
  assert.deepEqual(
    log.map((r) => r.seat),
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

  const g = newTestGame(
    [
      ["7h", "8h", "9h"],
      ["7c", "8c", "9c"],
      ["7d", "8d", "9d"],
      ["7s", "8s", "9s"],
    ],
    ["Ah", "Ac", "Ad"],
    [pass, knockOnce(), pass, pass],
  );
  g.firstSeat = 0;

  const seen: TurnRecord[] = [];
  g.onTurn = (rec) => seen.push(rec);

  const { log } = await g.run();

  assert.equal(seen.length, log.length);
  assert.deepEqual(seen, log);
});

test("run: three aces mid-round ends the game immediately", async () => {
  // Seat 0 exchanges its 7h for the pot's third ace, completing three
  // aces mid-round; the game must stop right there.
  const drawAce = strategyFunc(() => trade(2, 0));
  const neverCalled = strategyFunc((): Action => {
    throw new Error("strategy invoked after three-aces should have ended the game");
  });

  const g = newTestGame(
    [
      ["7h", "Ad", "Ac"],
      ["7c", "8c", "9c"],
      ["7d", "8d", "9d"],
      ["7s", "8s", "9s"],
    ],
    ["Kh", "Kc", "Ah"],
    [drawAce, neverCalled, neverCalled, neverCalled],
  );
  g.firstSeat = 0;

  const { log } = await g.run();
  assert.equal(log.length, 1);
});

test("run: three aces already dealt ends the game with no turns", async () => {
  const neverCalled = strategyFunc((): Action => {
    throw new Error("strategy invoked when three aces were already dealt");
  });

  const g = newTestGame(
    [
      ["Ah", "Ad", "Ac"],
      ["7c", "8c", "9c"],
      ["7d", "8d", "9d"],
      ["7s", "8s", "9s"],
    ],
    ["Kh", "Kc", "As"],
    [neverCalled, neverCalled, neverCalled, neverCalled],
  );

  const { log } = await g.run();
  assert.equal(log.length, 0);
});

test("run: isFirstTurnOfGame is true for exactly one decide call", async () => {
  let firstTurnCalls = 0;
  const spy = (): Strategy =>
    strategyFunc((v: PlayerView) => {
      if (v.isFirstTurnOfGame) {
        firstTurnCalls++;
      }
      return trade(0, 0);
    });
  const knockSoon = (): Strategy => {
    let n = 0;
    return strategyFunc((v: PlayerView) => {
      if (v.isFirstTurnOfGame) {
        firstTurnCalls++;
      }
      n++;
      if (n >= 2) {
        return knock();
      }
      return trade(0, 0);
    });
  };

  const g = newTestGame(
    [
      ["7h", "8h", "9h"],
      ["7c", "8c", "9c"],
      ["7d", "8d", "9d"],
      ["7s", "8s", "9s"],
    ],
    ["Kh", "Kc", "Kd"],
    [knockSoon(), spy(), spy(), spy()],
  );
  g.firstSeat = 0;

  await g.run();
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

  const g = newTestGame(seatHands, ["Kh", "Kc", "Kd"], [nilStrategy, nilStrategy, nilStrategy, nilStrategy]);
  g.firstSeat = 0;

  const checker = (seat: number): Strategy =>
    strategyFunc((v: PlayerView) => {
      assert.equal(v.seat, seat);
      assert.deepEqual(v.hand, g.players[seat]?.hand);
      assert.deepEqual(v.pot, g.pot);
      return knock();
    });

  (g.players[0] as Player).strategy = strategyFunc(() => trade(0, 0));
  (g.players[1] as Player).strategy = checker(1);
  (g.players[2] as Player).strategy = checker(2);
  (g.players[3] as Player).strategy = checker(3);

  await g.run();
});

test("run: exchanging on the game's first turn does not end it", async () => {
  // Seat 0 exchanges on the game's very first turn, which must not end
  // the game; seat 1 then knocks to end it, proving seat 0's exchange
  // was just a swap.
  const exchangeOnFirstTurn = strategyFunc((v: PlayerView) => (v.isFirstTurnOfGame ? exchange() : trade(0, 0)));
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

  const g = newTestGame(
    [
      ["7h", "8h", "9h"],
      ["7c", "8c", "9c"],
      ["7d", "8d", "9d"],
      ["7s", "8s", "9s"],
    ],
    ["Kh", "Kc", "Kd"],
    [exchangeOnFirstTurn, knockOnce(), exchangeOnFirstTurn, exchangeOnFirstTurn],
  );
  g.firstSeat = 0;

  const { log } = await g.run();

  assert.equal(log.length, 5, "game must not have ended at seat 0's first-turn exchange");
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

  const g = newTestGame(
    [
      ["7h", "8h", "9h"],
      ["7c", "8c", "9c"],
      ["7d", "8d", "9d"],
      ["7s", "8s", "9s"],
    ],
    ["Ah", "Ac", "Ad"],
    [pass, exchangeOnce(), pass, pass],
  );
  g.firstSeat = 0;

  const { log } = await g.run();

  // Seat 1's exchange (turn 1, not the game's first turn) must end the
  // game exactly like a knock: seats 2, 3, and 0 each get one more
  // turn, then the game stops before seat 1 acts again.
  assert.equal(log.length, 5);
  assert.deepEqual(
    log.map((r) => r.seat),
    [0, 1, 2, 3, 0],
  );
  assert.equal(log[1]?.action.type, "exchange");
});

test("newGame deals distinct hands and a pot from a full deck", () => {
  const seats = [0, 1, 2, 3].map((seat) => ({ seat, strategy: nilStrategy }));
  const g = newGame(42, seats);

  const seen = new Set<string>();
  for (const p of g.players) {
    for (const c of p.hand) {
      const key = c.rank + c.suit;
      assert.equal(seen.has(key), false, `duplicate card ${key}`);
      seen.add(key);
    }
  }
  for (const c of g.pot) {
    const key = c.rank + c.suit;
    assert.equal(seen.has(key), false, `duplicate card ${key}`);
    seen.add(key);
  }
  assert.equal(seen.size, 15);
  assert.ok(g.firstSeat >= 0 && g.firstSeat < 4);
});

test("newGame deals only to the given seats when fewer than four are active", () => {
  const seats = [0, 2, 3].map((seat) => ({ seat, strategy: nilStrategy }));
  const g = newGame(42, seats);

  assert.deepEqual(
    g.players.map((p) => p.seat),
    [0, 2, 3],
  );
  const seen = new Set<string>();
  for (const p of g.players) {
    for (const c of p.hand) {
      const key = c.rank + c.suit;
      assert.equal(seen.has(key), false, `duplicate card ${key}`);
      seen.add(key);
    }
  }
  for (const c of g.pot) {
    const key = c.rank + c.suit;
    assert.equal(seen.has(key), false, `duplicate card ${key}`);
    seen.add(key);
  }
  assert.equal(seen.size, 12);
  assert.ok([0, 2, 3].includes(g.firstSeat));
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
  const g = new Game(mustPot("Ah", "Ac", "Ad"), players, 0);

  const { log } = await g.run();

  // Seat 0 acts, seat 2 knocks, seat 3 gets one more turn, then seat 0
  // gets its promised extra lap turn, then the game stops before seat 2
  // (the knocker) acts again. Seat 1 doesn't exist in this game at all.
  assert.deepEqual(
    log.map((r) => r.seat),
    [0, 2, 3, 0],
  );
});
