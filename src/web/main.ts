// Rumble-31 browser client: the human is seat 0, playing against three
// bots, until the game ends. Mirrors src/main.ts's (the CLI's) flow,
// rendering to the DOM instead of a Writer.

import type { Card } from "../card/card.ts";
import { score } from "../card/score.ts";
import { Bot } from "../bot/bot.ts";
import { DEAL_ANIMATION_DELAY, MAX_BOT_THINK_TIME, MIN_BOT_THINK_TIME } from "../config.ts";
import { newGame } from "../game/game.ts";
import { seatName } from "../game/seat.ts";
import type { Action, Hand, PlayerView, Pot, Strategy, TurnRecord } from "../game/types.ts";
import { gameEndLines, gameStartLines, roundRecapLines, roundStartLines, turnStartLine, turnLines } from "../log.ts";
import { version } from "../version.ts";
import dealSoundUrl from "../../assets/deal.wav";
import { dealOrder } from "./dealOrder.ts";
import { DomActionPrompt } from "./domActionPrompt.ts";
import { installGlobalErrorHandlers, showErrorScreen } from "./errorScreen.ts";
import { parseDebugParams } from "./params.ts";
import { renderStrikes, setPanelState, setScore, setStruck, setWon } from "./panels.ts";
import { appendLogLine, backEl, cardEl, initCardSheetVars, initStrikeBlinkVar, renderBacks, renderCards } from "./render.ts";
import { animateCardTrade } from "./tradeAnim.ts";

// sleep resolves after ms.
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// playDealSound plays deal.wav for one card being dealt. A fresh Audio
// instance per call lets rapid plays overlap naturally (the clip is
// ~150ms, longer than DEAL_ANIMATION_DELAY), like a real card riffle,
// instead of cutting a shared instance off early. play() can still
// reject under the browser's autoplay policy (e.g. if
// unlockDealSoundOnFirstGesture hasn't fired yet) — logged, not
// thrown, since the deal works fine without sound either way.
function playDealSound(): void {
  new Audio(dealSoundUrl).play().catch((err: unknown) => console.warn("deal.wav: play() failed", err));
}

// unlockDealSoundOnFirstGesture plays (silently, then immediately
// pauses) deal.wav on the page's first click or keypress. Round 1's
// deal starts automatically, before the player has done anything, and
// browsers block unmuted audio until there's been a user gesture on
// the page — without this, every dealt card would be silent until the
// player happened to interact with something else first (or,
// depending on the browser, indefinitely).
function unlockDealSoundOnFirstGesture(): void {
  const unlock = () => {
    document.removeEventListener("click", unlock);
    document.removeEventListener("keydown", unlock);
    const a = new Audio(dealSoundUrl);
    a.volume = 0;
    a.play()
      .then(() => a.pause())
      .catch((err: unknown) => console.warn("deal.wav: could not unlock audio", err));
  };
  document.addEventListener("click", unlock, { once: true });
  document.addEventListener("keydown", unlock, { once: true });
}

// Installed before anything else in this module runs (including the
// must() lookups just below), so even a failure during module
// initialization still shows the error screen instead of a blank page.
installGlobalErrorHandlers();

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

const mainScreenEl = must<HTMLElement>("main-screen");
const gameScreenEl = must<HTMLElement>("game-screen");
const newGameBtn = must<HTMLButtonElement>("new-game-btn");

const potEl = must<HTMLElement>("pot");
const logEl = must<HTMLElement>("log");
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
// highlights that seat's panel and logs the "Seat's turn" line — and
// for bots, also pauses for a random duration between
// MIN_BOT_THINK_TIME and MAX_BOT_THINK_TIME, the non-blocking,
// setTimeout-based analog of cli/cli.ts's thinking(), which pauses via
// a blocking sleep instead.
function withTurnUi(seat: number, inner: Strategy): Strategy {
  return {
    async decide(v: PlayerView): Promise<Action> {
      setActiveSeat(seat);
      appendLogLine(logEl, turnStartLine(seat));
      if (seat !== 0) {
        await sleep(MIN_BOT_THINK_TIME + Math.random() * (MAX_BOT_THINK_TIME - MIN_BOT_THINK_TIME));
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
      document.removeEventListener("click", onClick);
      resolve();
    };
    const onClick = () => finish();
    const timer = setTimeout(finish, ms);
    // Attaching this listener is deferred to a fresh task rather than
    // done immediately: when South's own action ends the round (only
    // possible when West is the knocker, since turn order wraps
    // South-West-North-East-South), the click that resolves South's
    // DomActionPrompt promise is still bubbling up through `document`
    // at this exact point — browsers run a microtask checkpoint after
    // each listener invocation during a single event's dispatch, which
    // is what lets this whole call chain (Round.run -> Game.playRound
    // -> this function) run to completion *before* that same click
    // finishes bubbling. Attaching synchronously here would let that
    // stale click immediately satisfy the listener and skip the pause
    // before the player ever sees it. A deferred setTimeout(0) only
    // attaches once the click's dispatch (and everything chained off
    // it) has fully finished, so only a genuinely new click can match.
    setTimeout(() => document.addEventListener("click", onClick), 0);
  });
}

// animateTurnCards plays rec's trade animation (per specs/gui.md's
// Trading/Exchanging Cards section): a "trade" animates its one
// hand/pot pair; an "exchange" animates all three, index by index, one
// fully finishing before the next starts; a "knock" moves no cards.
// conceal (re-hide the traded-in card once it lands) applies whenever
// the acting seat isn't South, whose hand is never concealed.
async function animateTurnCards(rec: TurnRecord): Promise<void> {
  const hand = seatOf(rec.seat).hand;
  const conceal = rec.seat !== 0;

  switch (rec.action.type) {
    case "trade": {
      const { handIndex, potIndex } = rec.action;
      await animateCardTrade(hand.children[handIndex] as HTMLElement, potEl.children[potIndex] as HTMLElement, rec.handBefore[handIndex] as Card, rec.potBefore[potIndex] as Card, conceal);
      break;
    }
    case "exchange":
      for (let i = 0; i < 3; i++) {
        await animateCardTrade(hand.children[i] as HTMLElement, potEl.children[i] as HTMLElement, rec.handBefore[i] as Card, rec.potBefore[i] as Card, conceal);
      }
      break;
    case "knock":
      break;
  }
}

// renderTurn logs the turn per src/log.ts, plays its trade animation,
// then keeps the pot and South's own hand/score panel live across every
// turn. The pot is otherwise only rendered at deal time and when
// DomActionPrompt.decide() is next asked for South's action, so without
// this a trade/exchange — South's own or a bot's — would leave the
// displayed pot stale until South's next turn. Same reasoning applies
// to South's hand/score: only South's own trade/exchange touches it,
// and DomActionPrompt isn't asked again until South's next turn. This
// final render also settles the animation onto rec's own authoritative
// *After state, so drift can't accumulate turn over turn.
async function renderTurn(rec: TurnRecord): Promise<void> {
  for (const line of turnLines(rec)) {
    appendLogLine(logEl, line);
  }

  await animateTurnCards(rec);

  renderCards(potEl, rec.potAfter);

  if (rec.seat === 0) {
    renderCards(seatOf(0).hand, rec.handAfter);
    setScore(seatOf(0).score, rec.scoreAfter);
  }
}

// animateDeal clears every active seat's hand and the pot, then deals
// them back out one card at a time per dealOrder() — South's own real
// card faces, every other seat's card backs, then the pot — pausing
// DEAL_ANIMATION_DELAY between each. Game.playRound awaits onDeal, so
// the round's first turn doesn't begin until this finishes. Per
// specs/gui.md.
async function animateDeal(roundNum: number, pot: Pot, hands: ReadonlyMap<number, Hand>): Promise<void> {
  const southHand = hands.get(0) as Hand;
  for (const line of roundStartLines(roundNum, pot, southHand)) {
    appendLogLine(logEl, line);
  }

  for (let seat = 0; seat < 4; seat++) {
    setWon(seatOf(seat).panel, false);
    setStruck(seatOf(seat).panel, false);
  }

  const activeSeats = [0, 1, 2, 3].filter((seat) => hands.has(seat));
  for (const seat of activeSeats) {
    seatOf(seat).hand.replaceChildren();
    if (seat !== 0) {
      setScore(seatOf(seat).score, null);
    }
  }
  potEl.replaceChildren();

  for (const step of dealOrder(activeSeats)) {
    const el = step.kind === "hand" ? (step.seat === 0 ? cardEl(southHand[step.cardIndex] as Card) : backEl()) : cardEl(pot[step.potIndex] as Card);
    el.classList.add("card--deal-in");
    if (step.kind === "hand") {
      seatOf(step.seat).hand.appendChild(el);
    } else {
      potEl.appendChild(el);
    }
    playDealSound();
    await sleep(DEAL_ANIMATION_DELAY);
  }

  // South's own hand and score are always public, so they're revealed
  // as soon as they're dealt rather than waiting for South's first
  // turn (turn order varies by round).
  setScore(seatOf(0).score, score(southHand));
}

// renderDealInstant places round 1's already-dealt hands/pot directly,
// with no per-card animation or sound — used instead of animateDeal
// when specs/params.md's north/south/east/west/pot debug params
// pre-populate the deal, per its "dealing is not animated" note.
function renderDealInstant(roundNum: number, pot: Pot, hands: ReadonlyMap<number, Hand>): void {
  const southHand = hands.get(0) as Hand;
  for (const line of roundStartLines(roundNum, pot, southHand)) {
    appendLogLine(logEl, line);
  }

  for (let seat = 0; seat < 4; seat++) {
    setWon(seatOf(seat).panel, false);
    setStruck(seatOf(seat).panel, false);
  }

  for (const [seat, hand] of hands) {
    if (seat === 0) {
      renderCards(seatOf(0).hand, hand);
    } else {
      renderBacks(seatOf(seat).hand, hand.length);
    }
  }
  renderCards(potEl, pot);

  setScore(seatOf(0).score, score(southHand));
}

async function main(): Promise<void> {
  const params = parseDebugParams(window.location.search);

  initCardSheetVars();
  initStrikeBlinkVar();
  unlockDealSoundOnFirstGesture();

  const seed = Date.now();
  const human = new DomActionPrompt(potEl, seatEls[0].hand, seatEls[0].score, takePotBtn, knockBtn);
  const bots: [Bot, Bot, Bot] = [new Bot(), new Bot(), new Bot()];

  const g = newGame(
    seed,
    [withTurnUi(0, human), withTurnUi(1, bots[0]), withTurnUi(2, bots[1]), withTurnUi(3, bots[2])],
    params.initialStrikes,
    params.initialDeal,
  );

  for (let seat = 0; seat < 4; seat++) {
    renderStrikes(seatOf(seat).strikes, g.strikes[seat] as number);
    if (g.eliminated[seat]) {
      setPanelState(seatOf(seat).panel, "eliminated");
    }
  }

  for (const line of gameStartLines(seed, version)) {
    appendLogLine(logEl, line);
  }

  for (let roundNum = 1; g.active() && !g.eliminated[0]; roundNum++) {
    g.onDeal =
      roundNum === 1 && params.skipDealAnimation
        ? (pot, hands) => renderDealInstant(roundNum, pot, hands)
        : (pot, hands) => animateDeal(roundNum, pot, hands);
    g.onTurn = renderTurn;

    const outcome = await g.playRound();

    // The round's over, so nobody's "on turn" anymore — clear it before
    // applying this round's win/strike highlights, or whoever last
    // acted would keep is-turn's amber glow through the pause.
    for (let seat = 0; seat < 4; seat++) {
      setPanelState(seatOf(seat).panel, g.eliminated[seat] ? "eliminated" : "none");
    }

    for (const line of roundRecapLines(outcome, g.strikes)) {
      appendLogLine(logEl, line);
    }
    for (const pr of outcome.result.players) {
      setScore(seatOf(pr.seat).score, pr.score);
    }
    for (const seat of outcome.result.winners) {
      setWon(seatOf(seat).panel, true);
    }
    for (const seat of outcome.struck) {
      setStruck(seatOf(seat).panel, true);
    }
    for (let seat = 0; seat < 4; seat++) {
      renderStrikes(seatOf(seat).strikes, g.strikes[seat] as number);
      if (g.eliminated[seat]) {
        setPanelState(seatOf(seat).panel, "eliminated");
        seatOf(seat).hand.replaceChildren();
      }
    }

    if (g.active() && !g.eliminated[0]) {
      await pauseBetweenRounds(3000);
    }
  }

  for (const line of gameEndLines(g)) {
    appendLogLine(logEl, line);
  }
}

// showGameScreen swaps the main screen for the game screen (per
// specs/gui.md's Main Screen section), then starts a new game.
function showGameScreen(): void {
  mainScreenEl.hidden = true;
  gameScreenEl.hidden = false;
  main().catch(showErrorScreen);
}

// Any URL parameter (specs/params.md) bypasses the main screen and
// starts the game immediately, as it always has — the main screen is
// only shown on a bare visit with no query string.
if (window.location.search !== "") {
  showGameScreen();
} else {
  newGameBtn.addEventListener("click", showGameScreen);
}
