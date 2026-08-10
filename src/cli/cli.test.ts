import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCard, cardConsole } from "../card/card.ts";
import type { Hand, Pot, PlayerView, TurnRecord, Action } from "../game/types.ts";
import { trade, exchange, knock, strategyFunc } from "../game/types.ts";
import { Human, dealPot, thinking, newNarrator, renderCards } from "./cli.ts";
import { arrayLineReader, bufferWriter, clock } from "./io.ts";

function mustHand(...notation: [string, string, string]): Hand {
  return [parseCard(notation[0]), parseCard(notation[1]), parseCard(notation[2])];
}
function mustPot(...notation: [string, string, string]): Pot {
  return mustHand(...notation);
}

function withMockSleep(): { slept: number[]; restore: () => void } {
  const orig = clock.sleep;
  const slept: number[] = [];
  clock.sleep = (ms: number) => slept.push(ms);
  return { slept, restore: () => (clock.sleep = orig) };
}

function baseView(overrides: Partial<PlayerView>): PlayerView {
  return {
    hand: mustHand("7h", "8c", "9s"),
    pot: mustPot("Kc", "Kd", "Ks"),
    seat: 0,
    isFirstTurnOfGame: false,
    ownTurnNumber: 1,
    ...overrides,
  };
}

test("Human.decide", () => {
  const cases: Array<{ name: string; isFirstTurn: boolean; hand: [string, string, string]; pot: [string, string, string]; input: string; want: Action }> = [
    {
      name: "first turn trade",
      isFirstTurn: true,
      hand: ["7h", "8c", "9s"],
      pot: ["Ah", "Kd", "Qc"],
      input: "1\n2\n2\n",
      want: trade(1, 1),
    },
    {
      name: "first turn exchange",
      isFirstTurn: true,
      hand: ["7h", "8c", "9s"],
      pot: ["Ah", "Kd", "Qc"],
      input: "2\n",
      want: exchange(),
    },
    {
      name: "later turn trade",
      isFirstTurn: false,
      hand: ["7h", "8c", "9s"],
      pot: ["Ah", "Kd", "Qc"],
      input: "1\n1\n1\n",
      want: trade(0, 0),
    },
    {
      name: "later turn exchange",
      isFirstTurn: false,
      hand: ["7h", "8c", "9s"],
      pot: ["Ah", "Kd", "Qc"],
      input: "2\n",
      want: exchange(),
    },
    {
      name: "later turn knock",
      isFirstTurn: false,
      hand: ["7h", "8c", "9s"],
      pot: ["Ah", "Kd", "Qc"],
      input: "3\n",
      want: knock(),
    },
    {
      name: "invalid menu choice is reprompted",
      isFirstTurn: false,
      hand: ["7h", "8c", "9s"],
      pot: ["Ah", "Kd", "Qc"],
      input: "9\nbanana\n3\n",
      want: knock(),
    },
    {
      name: "invalid card selection is reprompted",
      isFirstTurn: false,
      hand: ["7h", "8c", "9s"],
      pot: ["Ah", "Kd", "Qc"],
      input: "1\nzz\n0\n1\n1\n",
      want: trade(0, 0),
    },
  ];

  for (const { name, isFirstTurn, hand, pot, input, want } of cases) {
    const v = baseView({ hand: mustHand(...hand), pot: mustPot(...pot), isFirstTurnOfGame: isFirstTurn });
    const out = bufferWriter();
    const h = new Human(arrayLineReader(input.split("\n").slice(0, -1)), out);
    const got = h.decide(v);
    assert.deepEqual(got, want, `${name}\noutput:\n${out.toString()}`);
  }
});

test("newNarrator", () => {
  const cases: Array<{ name: string; rec: TurnRecord; wantContains: string[]; wantExcludes?: string[] }> = [
    {
      name: "trade reveals only the seat and the public pot",
      rec: {
        turnIndex: 1,
        seat: 1,
        action: trade(0, 0),
        handBefore: mustHand("7h", "8c", "9s"),
        handAfter: mustHand("Ah", "8c", "9s"),
        potBefore: mustPot("Ah", "Kd", "Qc"),
        potAfter: mustPot("7h", "Kd", "Qc"),
        scoreAfter: 0,
      },
      wantContains: ["West", cardConsole(parseCard("7h")), cardConsole(parseCard("Kd")), cardConsole(parseCard("Qc"))],
      wantExcludes: [cardConsole(parseCard("8c")), cardConsole(parseCard("9s"))],
    },
    {
      name: "knock reveals nothing about the hand",
      rec: {
        turnIndex: 1,
        seat: 3,
        action: knock(),
        handBefore: mustHand("7h", "8c", "9s"),
        handAfter: mustHand("7h", "8c", "9s"),
        potBefore: mustPot("Ah", "Kd", "Qc"),
        potAfter: mustPot("Ah", "Kd", "Qc"),
        scoreAfter: 0,
      },
      wantContains: ["East", "knocks"],
      wantExcludes: [cardConsole(parseCard("7h")), cardConsole(parseCard("8c")), cardConsole(parseCard("9s"))],
    },
    {
      name: "exchange on the game's first turn does not mention knocking",
      rec: {
        turnIndex: 0,
        seat: 0,
        action: exchange(),
        handBefore: mustHand("7h", "8c", "9s"),
        handAfter: mustHand("Ah", "Kd", "Qc"),
        potBefore: mustPot("Ah", "Kd", "Qc"),
        potAfter: mustPot("7h", "8c", "9s"),
        scoreAfter: 0,
      },
      wantContains: ["South", "exchanges"],
      wantExcludes: ["knock"],
    },
    {
      name: "exchange after the first turn also announces a knock",
      rec: {
        turnIndex: 4,
        seat: 2,
        action: exchange(),
        handBefore: mustHand("7h", "8c", "9s"),
        handAfter: mustHand("Ah", "Kd", "Qc"),
        potBefore: mustPot("Ah", "Kd", "Qc"),
        potAfter: mustPot("7h", "8c", "9s"),
        scoreAfter: 0,
      },
      wantContains: ["North", "exchanges", "knocks"],
    },
  ];

  for (const { name, rec, wantContains, wantExcludes } of cases) {
    const out = bufferWriter();
    newNarrator(out)(rec);
    const got = out.toString();
    for (const want of wantContains) {
      assert.ok(got.includes(want), `${name}: output ${JSON.stringify(got)} should contain ${JSON.stringify(want)}`);
    }
    for (const exclude of wantExcludes ?? []) {
      assert.ok(!got.includes(exclude), `${name}: output ${JSON.stringify(got)} should NOT contain ${JSON.stringify(exclude)}`);
    }
  }
});

test("dealPot prints each card after a 100ms pacing sleep", () => {
  const { slept, restore } = withMockSleep();
  try {
    const pot = mustPot("7h", "8c", "9s");
    const out = bufferWriter();
    dealPot(out, pot);

    assert.equal(out.toString(), `initial pot: ${renderCards(pot)}\n`);
    assert.deepEqual(slept, [100, 100, 100]);
  } finally {
    restore();
  }
});

test("thinking announces the seat, sleeps 500ms-2s, and delegates to the wrapped strategy", () => {
  const { slept, restore } = withMockSleep();
  try {
    const inner = strategyFunc(() => knock());
    const out = bufferWriter();
    const strat = thinking(2, inner, out);

    const got = strat.decide(baseView({}));
    assert.deepEqual(got, knock());
    assert.ok(out.toString().includes("North is thinking..."));
    assert.equal(slept.length, 1);
    assert.ok((slept[0] as number) >= 500 && (slept[0] as number) < 2000);
  } finally {
    restore();
  }
});
