// Rumble-31 browser client: the human is seat 0, playing against three
// bots, until the game ends. Mirrors src/main.ts's (the CLI's) flow,
// rendering to the DOM instead of a Writer.

import { cardToString } from "../card/card.ts";
import { score } from "../card/score.ts";
import { Bot } from "../bot/bot.ts";
import type { RoundOutcome, Game } from "../game/game.ts";
import { newGame } from "../game/game.ts";
import { seatName } from "../game/seat.ts";
import type { Action, Hand, PlayerView, Strategy, TurnRecord } from "../game/types.ts";
import { DomActionPrompt } from "./domActionPrompt.ts";
import { renderStrikes, setPanelState, setScore } from "./panels.ts";
import { appendLogLine, renderBacks, renderCards } from "./render.ts";

function must<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`missing #${id} in index.html`);
  }
  return el as T;
}

interface SeatEls {
  panel: HTMLElement;
  hand: HTMLElement;
  score: HTMLElement;
  strikes: HTMLElement;
}

const potEl = must<HTMLElement>("pot");
const logEl = must<HTMLElement>("log");
const statusEl = must<HTMLElement>("status");
const takePotBtn = must<HTMLButtonElement>("take-pot-btn");
const knockBtn = must<HTMLButtonElement>("knock-btn");

// seatEls[seat] holds the DOM for that seat's panel — indices line up
// with seatName's own South/West/North/East order.
const seatEls: [SeatEls, SeatEls, SeatEls, SeatEls] = [0, 1, 2, 3].map((seat) => {
  const key = seatName(seat).toLowerCase();
  return {
    panel: must<HTMLElement>(`panel-${key}`),
    hand: must<HTMLElement>(seat === 0 ? "hand" : `hand-${key}`),
    score: must<HTMLElement>(`score-${key}`),
    strikes: must<HTMLElement>(`strikes-${key}`),
  };
}) as [SeatEls, SeatEls, SeatEls, SeatEls];

// seatOf indexes seatEls by a runtime seat number (0-3), which
// noUncheckedIndexedAccess can't itself prove is always in range.
function seatOf(seat: number): SeatEls {
  return seatEls[seat] as SeatEls;
}

// setActiveSeat highlights whichever seat is currently deciding,
// leaving already-eliminated panels' dimmed state alone.
function setActiveSeat(seat: number): void {
  for (let s = 0; s < 4; s++) {
    const panel = seatOf(s).panel;
    if (panel.classList.contains("is-eliminated")) {
      continue;
    }
    setPanelState(panel, s === seat ? "turn" : "none");
  }
}

// withTurnUi wraps a seat's strategy so that, before deciding, it
// highlights that seat's panel — and for bots, also logs "seat <seat>
// is thinking..." and pauses for a random duration between 500ms and 2
// seconds, the non-blocking, setTimeout-based analog of cli/cli.ts's
// thinking(), which pauses via a blocking sleep instead.
function withTurnUi(seat: number, inner: Strategy): Strategy {
  return {
    async decide(v: PlayerView): Promise<Action> {
      setActiveSeat(seat);
      if (seat !== 0) {
        appendLogLine(logEl, `${seatName(seat)} is thinking...`);
        await new Promise((resolve) => setTimeout(resolve, 500 + Math.random() * 1500));
      }
      return inner.decide(v);
    },
  };
}

// pauseBetweenRounds resolves after ms, or as soon as the player clicks
// anywhere on the page, whichever comes first.
function pauseBetweenRounds(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      document.removeEventListener("click", finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    document.addEventListener("click", finish);
  });
}

// renderTurn logs only publicly known information for every seat, human
// and bot alike: the action taken, and for exchanges/trades, the pot
// afterward. It never logs a hand. Mirrors cli/cli.ts's newNarrator.
function renderTurn(rec: TurnRecord): void {
  switch (rec.action.type) {
    case "knock":
      appendLogLine(logEl, `${seatName(rec.seat)} knocks`);
      break;
    case "exchange":
      appendLogLine(
        logEl,
        rec.turnIndex === 0
          ? `${seatName(rec.seat)} exchanges their entire hand with the pot`
          : `${seatName(rec.seat)} exchanges their entire hand with the pot and knocks`,
      );
      appendLogLine(logEl, `pot: ${rec.potAfter.map(cardToString).join(" ")}`);
      break;
    case "trade":
      appendLogLine(logEl, `${seatName(rec.seat)} trades with the pot`);
      appendLogLine(logEl, `pot: ${rec.potAfter.map(cardToString).join(" ")}`);
      break;
  }

  // South's own hand/score panel is otherwise only refreshed at deal
  // time and on South's own turns — keep it live across every turn
  // (e.g. a bot's exchange doesn't touch South's hand, but South's own
  // trade/exchange does, and DomActionPrompt isn't asked again until
  // South's next turn).
  if (rec.seat === 0) {
    renderCards(seatOf(0).hand, rec.handAfter);
    setScore(seatOf(0).score, rec.scoreAfter);
  }
}

function printRoundRecap(roundNum: number, outcome: RoundOutcome, strikes: readonly number[]): void {
  appendLogLine(logEl, `round ${roundNum} result:`);
  for (const pr of outcome.result.players) {
    let note = "";
    if (outcome.eliminated.includes(pr.seat)) {
      note = " (struck, eliminated)";
    } else if (outcome.struck.includes(pr.seat)) {
      note = " (struck)";
    }
    appendLogLine(
      logEl,
      `${seatName(pr.seat)}  hand ${pr.hand.map(cardToString).join(" ")}  score ${pr.score.toFixed(1)}  rank ${pr.rank}  strikes ${strikes[pr.seat] as number}${note}`,
    );

    setScore(seatOf(pr.seat).score, pr.score);
  }
}

function printGameResult(g: Game): void {
  appendLogLine(logEl, "=== game over ===");
  for (let seat = 0; seat < 4; seat++) {
    appendLogLine(logEl, `${seatName(seat)}  ${g.strikes[seat]} strikes${g.eliminated[seat] ? " (eliminated)" : ""}`);
  }
  const winners = g.winners();
  appendLogLine(logEl, `winners: [${winners.map(seatName).join(" ")}]`);
  appendLogLine(logEl, winners.includes(0) ? "You won the game!" : "You did not win this game.");
}

async function main(): Promise<void> {
  const seed = Date.now();
  const human = new DomActionPrompt(potEl, seatEls[0].hand, seatEls[0].score, takePotBtn, knockBtn);
  const bots: [Bot, Bot, Bot] = [new Bot(), new Bot(), new Bot()];

  const g = newGame(seed, [withTurnUi(0, human), withTurnUi(1, bots[0]), withTurnUi(2, bots[1]), withTurnUi(3, bots[2])]);

  statusEl.textContent = `You are ${seatName(0)}`;

  for (let seat = 1; seat < 4; seat++) {
    renderBacks(seatOf(seat).hand, 3);
  }
  for (let seat = 0; seat < 4; seat++) {
    renderStrikes(seatOf(seat).strikes, g.strikes[seat] as number);
  }

  let interactive = !g.eliminated[0];
  if (!interactive) {
    appendLogLine(logEl, "You start this game already eliminated.");
  }

  for (let roundNum = 1; g.active(); roundNum++) {
    if (interactive) {
      appendLogLine(logEl, `=== round ${roundNum} ===`);
      g.onDeal = (pot, hands) => {
        renderCards(potEl, pot);
        for (let seat = 1; seat < 4; seat++) {
          if (!g.eliminated[seat]) {
            renderBacks(seatOf(seat).hand, 3);
            setScore(seatOf(seat).score, null);
          }
        }
        // South's own hand and score are always public, so they're
        // revealed as soon as they're dealt rather than waiting for
        // South's first turn (firstSeat, and so turn order, varies by
        // round).
        const southHand = hands.get(0) as Hand;
        renderCards(seatOf(0).hand, southHand);
        setScore(seatOf(0).score, score(southHand));
      };
      g.onTurn = renderTurn;
    } else {
      g.onDeal = undefined;
      g.onTurn = undefined;
    }

    const outcome = await g.playRound();
    if (!interactive) {
      continue;
    }

    printRoundRecap(roundNum, outcome, g.strikes);
    for (let seat = 0; seat < 4; seat++) {
      renderStrikes(seatOf(seat).strikes, g.strikes[seat] as number);
      if (g.eliminated[seat]) {
        setPanelState(seatOf(seat).panel, "eliminated");
        seatOf(seat).hand.replaceChildren();
      }
    }

    if (outcome.eliminated.includes(0)) {
      appendLogLine(logEl, "You have been eliminated. The rest of the game will play out silently...");
      interactive = false;
      continue;
    }
    if (g.active()) {
      appendLogLine(logEl, "Starting next round... (click to skip)");
      await pauseBetweenRounds(3000);
    }
  }

  printGameResult(g);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  appendLogLine(logEl, `error: ${message}`);
  console.error(err);
});
