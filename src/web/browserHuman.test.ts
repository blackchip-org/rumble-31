import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCard } from "../card/card.ts";
import type { Hand, Pot, PlayerView, Action } from "../game/types.ts";
import { trade, exchange, knock } from "../game/types.ts";
import { BrowserHuman } from "./browserHuman.ts";
import type { ActionPrompt } from "./actionPrompt.ts";

function mustHand(...notation: [string, string, string]): Hand {
  return [parseCard(notation[0]), parseCard(notation[1]), parseCard(notation[2])];
}
function mustPot(...notation: [string, string, string]): Pot {
  return mustHand(...notation);
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

// fakePrompt dispenses a fixed queue of answers to whichever chooseOption
// or chooseCardIndex call comes next, and records every rendered view —
// the async analog of arrayLineReader/bufferWriter.
function fakePrompt(answers: readonly number[]): ActionPrompt & { rendered: PlayerView[] } {
  let i = 0;
  const rendered: PlayerView[] = [];
  return {
    rendered,
    render(view: PlayerView): void {
      rendered.push(view);
    },
    chooseOption(): Promise<number> {
      return Promise.resolve(answers[i++] as number);
    },
    chooseCardIndex(): Promise<number> {
      return Promise.resolve(answers[i++] as number);
    },
  };
}

test("BrowserHuman.decide", async () => {
  const cases: Array<{
    name: string;
    isFirstTurn: boolean;
    hand: [string, string, string];
    pot: [string, string, string];
    answers: number[];
    want: Action;
  }> = [
    {
      name: "first turn trade",
      isFirstTurn: true,
      hand: ["7h", "8c", "9s"],
      pot: ["Ah", "Kd", "Qc"],
      answers: [1, 1, 1],
      want: trade(1, 1),
    },
    {
      name: "first turn exchange",
      isFirstTurn: true,
      hand: ["7h", "8c", "9s"],
      pot: ["Ah", "Kd", "Qc"],
      answers: [2],
      want: exchange(),
    },
    {
      name: "later turn trade",
      isFirstTurn: false,
      hand: ["7h", "8c", "9s"],
      pot: ["Ah", "Kd", "Qc"],
      answers: [1, 0, 0],
      want: trade(0, 0),
    },
    {
      name: "later turn exchange",
      isFirstTurn: false,
      hand: ["7h", "8c", "9s"],
      pot: ["Ah", "Kd", "Qc"],
      answers: [2],
      want: exchange(),
    },
    {
      name: "later turn knock",
      isFirstTurn: false,
      hand: ["7h", "8c", "9s"],
      pot: ["Ah", "Kd", "Qc"],
      answers: [3],
      want: knock(),
    },
  ];

  for (const { name, isFirstTurn, hand, pot, answers, want } of cases) {
    const v = baseView({ hand: mustHand(...hand), pot: mustPot(...pot), isFirstTurnOfGame: isFirstTurn });
    const prompt = fakePrompt(answers);
    const h = new BrowserHuman(prompt);

    const got = await h.decide(v);

    assert.deepEqual(got, want, name);
    assert.deepEqual(prompt.rendered, [v], `${name}: should render exactly the given view`);
  }
});

test("BrowserHuman.decide offers only 2 options on the game's first turn", async () => {
  const v = baseView({ isFirstTurnOfGame: true });
  let seenMax: number | undefined;
  const prompt: ActionPrompt = {
    render() {},
    chooseOption(max: number): Promise<number> {
      seenMax = max;
      return Promise.resolve(2);
    },
    chooseCardIndex(): Promise<number> {
      throw new Error("should not be called");
    },
  };

  await new BrowserHuman(prompt).decide(v);

  assert.equal(seenMax, 2);
});

test("BrowserHuman.decide offers 3 options on any later turn", async () => {
  const v = baseView({ isFirstTurnOfGame: false });
  let seenMax: number | undefined;
  const prompt: ActionPrompt = {
    render() {},
    chooseOption(max: number): Promise<number> {
      seenMax = max;
      return Promise.resolve(3);
    },
    chooseCardIndex(): Promise<number> {
      throw new Error("should not be called");
    },
  };

  await new BrowserHuman(prompt).decide(v);

  assert.equal(seenMax, 3);
});
