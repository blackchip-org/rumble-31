// Rumble-31 browser client: the human is seat 0, playing against three
// bots, until the match ends. Mirrors src/main.ts's (the CLI's) flow,
// rendering to the DOM instead of a Writer.

import { cardToString } from "../card/card.ts";
import { Bot } from "../bot/bot.ts";
import type { GameOutcome, Match } from "../game/match.ts";
import { newMatch } from "../game/match.ts";
import type { Action, PlayerView, Strategy, TurnRecord } from "../game/types.ts";
import { BrowserHuman } from "./browserHuman.ts";
import { DomActionPrompt } from "./domActionPrompt.ts";
import { appendLogLine, renderCards } from "./render.ts";

function must<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`missing #${id} in index.html`);
  }
  return el as T;
}

const potEl = must<HTMLElement>("pot");
const handEl = must<HTMLElement>("hand");
const actionsEl = must<HTMLElement>("actions");
const logEl = must<HTMLElement>("log");
const statusEl = must<HTMLElement>("status");

// thinking wraps a bot strategy so that, before deciding, it logs "seat
// <seat> is thinking..." and pauses for a random duration between 500ms
// and 2 seconds — the non-blocking, setTimeout-based analog of
// cli/cli.ts's thinking(), which pauses via a blocking sleep instead.
function thinking(seat: number, inner: Strategy): Strategy {
  return {
    async decide(v: PlayerView): Promise<Action> {
      appendLogLine(logEl, `seat ${seat} is thinking...`);
      await new Promise((resolve) => setTimeout(resolve, 500 + Math.random() * 1500));
      return inner.decide(v);
    },
  };
}

// renderTurn logs only publicly known information for every seat, human
// and bot alike: the action taken, and for exchanges/trades, the pot
// afterward. It never logs a hand. Mirrors cli/cli.ts's newNarrator.
function renderTurn(rec: TurnRecord): void {
  switch (rec.action.type) {
    case "knock":
      appendLogLine(logEl, `seat ${rec.seat} knocks`);
      break;
    case "exchange":
      appendLogLine(
        logEl,
        rec.turnIndex === 0
          ? `seat ${rec.seat} exchanges their entire hand with the pot`
          : `seat ${rec.seat} exchanges their entire hand with the pot and knocks`,
      );
      appendLogLine(logEl, `pot: ${rec.potAfter.map(cardToString).join(" ")}`);
      break;
    case "trade":
      appendLogLine(logEl, `seat ${rec.seat} trades with the pot`);
      appendLogLine(logEl, `pot: ${rec.potAfter.map(cardToString).join(" ")}`);
      break;
  }
}

// waitForContinue shows a single button labeled label in actionsEl and
// resolves once it's clicked — the click-driven analog of the CLI's
// Human.waitForEnter.
function waitForContinue(label: string): Promise<void> {
  return new Promise((resolve) => {
    actionsEl.replaceChildren();
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.addEventListener("click", () => {
      actionsEl.replaceChildren();
      resolve();
    });
    actionsEl.appendChild(btn);
  });
}

function printGameRecap(gameNum: number, outcome: GameOutcome, strikes: readonly number[]): void {
  appendLogLine(logEl, `game ${gameNum} result:`);
  for (const pr of outcome.result.players) {
    let note = "";
    if (outcome.eliminated.includes(pr.seat)) {
      note = " (struck, eliminated)";
    } else if (outcome.struck.includes(pr.seat)) {
      note = " (struck)";
    }
    appendLogLine(
      logEl,
      `seat ${pr.seat}  hand ${pr.hand.map(cardToString).join(" ")}  score ${pr.score.toFixed(1)}  rank ${pr.rank}  strikes ${strikes[pr.seat]}${note}`,
    );
  }
}

function printMatchResult(m: Match): void {
  appendLogLine(logEl, "=== match over ===");
  for (let seat = 0; seat < 4; seat++) {
    appendLogLine(logEl, `seat ${seat}  ${m.strikes[seat]} strikes${m.eliminated[seat] ? " (eliminated)" : ""}`);
  }
  const winners = m.winners();
  appendLogLine(logEl, `winners: [${winners.join(" ")}]`);
  appendLogLine(logEl, winners.includes(0) ? "You won the match!" : "You did not win this match.");
}

async function main(): Promise<void> {
  const seed = Date.now();
  const prompt = new DomActionPrompt(potEl, handEl, actionsEl);
  const human = new BrowserHuman(prompt);
  const bots: [Bot, Bot, Bot] = [new Bot(), new Bot(), new Bot()];

  const m = newMatch(seed, [human, thinking(1, bots[0]), thinking(2, bots[1]), thinking(3, bots[2])]);

  statusEl.textContent = "You are seat 0";

  let interactive = !m.eliminated[0];
  if (!interactive) {
    appendLogLine(logEl, "You start this match already eliminated.");
  }

  for (let gameNum = 1; m.active(); gameNum++) {
    if (interactive) {
      appendLogLine(logEl, `=== game ${gameNum} ===`);
      m.onDeal = (pot) => renderCards(potEl, pot);
      m.onTurn = renderTurn;
    } else {
      m.onDeal = undefined;
      m.onTurn = undefined;
    }

    const outcome = await m.playGame();
    if (!interactive) {
      continue;
    }

    printGameRecap(gameNum, outcome, m.strikes);
    if (outcome.eliminated.includes(0)) {
      appendLogLine(logEl, "You have been eliminated. The rest of the match will play out silently...");
      interactive = false;
      continue;
    }
    renderCards(handEl, []);
    await waitForContinue("Next game");
  }

  printMatchResult(m);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  appendLogLine(logEl, `error: ${message}`);
  console.error(err);
});
