import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCard } from "../card/card.ts";
import { MAX_BOT_THINK_TIME, MIN_BOT_THINK_TIME } from "../config.ts";
import type { Hand, Pot, PlayerView, Action } from "../game/types.ts";
import { trade, exchange, knock, strategyFunc } from "../game/types.ts";
import { Human, announceTurn, thinking } from "./cli.ts";
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
    isFirstTurnOfRound: false,
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
      name: "first turn knock",
      isFirstTurn: true,
      hand: ["7h", "8c", "9s"],
      pot: ["Ah", "Kd", "Qc"],
      input: "3\n",
      want: knock(),
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
    const v = baseView({ hand: mustHand(...hand), pot: mustPot(...pot), isFirstTurnOfRound: isFirstTurn });
    const out = bufferWriter();
    const h = new Human(arrayLineReader(input.split("\n").slice(0, -1)), out);
    const got = h.decide(v);
    assert.deepEqual(got, want, `${name}\noutput:\n${out.toString()}`);
  }
});

test("announceTurn writes the turn-start line before delegating", () => {
  const inner = strategyFunc(() => knock());
  const out = bufferWriter();
  const strat = announceTurn(0, inner, out);

  const got = strat.decide(baseView({}));
  assert.deepEqual(got, knock());
  assert.equal(out.toString(), "South's turn\n");
});

test("thinking announces the turn, sleeps MIN_BOT_THINK_TIME-MAX_BOT_THINK_TIME, and delegates to the wrapped strategy", () => {
  const { slept, restore } = withMockSleep();
  try {
    const inner = strategyFunc(() => knock());
    const out = bufferWriter();
    const strat = thinking(2, inner, out);

    const got = strat.decide(baseView({}));
    assert.deepEqual(got, knock());
    assert.equal(out.toString(), "North's turn\n");
    assert.equal(slept.length, 1);
    assert.ok((slept[0] as number) >= MIN_BOT_THINK_TIME && (slept[0] as number) < MAX_BOT_THINK_TIME);
  } finally {
    restore();
  }
});
