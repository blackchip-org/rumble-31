// Rumble-31 browser client: the human is seat 0, playing against three
// bots, until the game ends. Mirrors src/main.ts's (the CLI's) flow,
// rendering to the DOM instead of a Writer.

import type { Card } from "../card/card.ts";
import { score } from "../card/score.ts";
import { BOT_NAMES, createBot, snapshotBot, type BotMemory, type BotName } from "../bot/factory.ts";
import { DEAL_ANIMATION_DELAY, KNOCK_SOUND_WAIT, MAX_BOT_THINK_TIME, MIN_BOT_THINK_TIME } from "../config.ts";
import { Game, newGame } from "../game/game.ts";
import type { RoundDealOverride } from "../game/round.ts";
import { seatName } from "../game/seat.ts";
import type { Action, Hand, PlayerView, Pot, PublicTurn, Strategy, TurnRecord } from "../game/types.ts";
import { gameEndLines, gameStartLines, roundRecapLines, roundStartLines, turnStartLine, turnLines } from "../log.ts";
import { Rng } from "../rng.ts";
import { version } from "../version.ts";
import { buildTime } from "../buildstamp.ts";
import githubMarkUrl from "../../assets/github-mark.svg";
import score31SoundUrl from "../../assets/31.wav";
import score32SoundUrl from "../../assets/32.wav";
import dealSoundUrl from "../../assets/deal.wav";
import endOfRoundSoundUrl from "../../assets/end-of-round.wav";
import knockSoundUrl from "../../assets/knock.wav";
import loseSoundUrl from "../../assets/lose.wav";
import slideSoundUrl from "../../assets/slide.wav";
import turnSoundUrl from "../../assets/turn.wav";
import winSoundUrl from "../../assets/win.wav";
import { dealOrder } from "./dealOrder.ts";
import { DomActionPrompt } from "./domActionPrompt.ts";
import { installGlobalErrorHandlers, mockError, showErrorScreen } from "./errorScreen.ts";
import { parseDebugParams, type DebugParams, type ScreenId } from "./params.ts";
import { renderStrikes, setDealer, setPanelState, setScore, setStruck, setWon } from "./panels.ts";
import { loadSettings, saveSettings, type Settings } from "./settings.ts";
import { assignBotSeats, type BotSeats } from "./botAssignment.ts";
import { clearState, loadState, saveState, type GameState, type OverState, type PersistedState, type RoundCheckpoint, type SettingsOrigin } from "./state.ts";
import { appendLogLine, backEl, cardEl, initCardSheetVars, initStrikeBlinkVar, logText, renderBacks, renderCards } from "./render.ts";
import { animateCardTrade } from "./tradeAnim.ts";
import { licenses } from "./licensesData.ts";
import { defaultLicense, sortedLicenses } from "./licensesScreen.ts";
import { howToPlayText } from "./howToPlayData.ts";
import { buildDebugMenuGameState } from "./gameMenu.ts";
import { detectPlatform, INSTALL_INSTRUCTIONS } from "./installPrompt.ts";

// sleep resolves after ms.
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// dealAudio is the single Audio instance shared by every dealt card.
// Reusing one instance (instead of allocating a new one per card) avoids
// the per-card decode/allocation overhead that was causing audible
// delays during a fast deal. When a new card is dealt before the
// previous clip finishes, playDealSound rewinds and restarts it,
// cutting the previous play off rather than letting instances overlap.
const dealAudio = new Audio(dealSoundUrl);

// turnAudio is the single Audio instance shared by every "it's your
// turn" notification, reused for the same reason as dealAudio above.
const turnAudio = new Audio(turnSoundUrl);

// knockAudio is the single Audio instance shared by every knock,
// reused for the same reason as dealAudio above.
const knockAudio = new Audio(knockSoundUrl);

// score31Audio/score32Audio/endOfRoundAudio are the round-end sounds
// (specs/assets.md): score31Audio for a round won with 31, score32Audio
// for a round won with 32 (three aces), endOfRoundAudio for any other
// winning score. Reused across rounds for the same reason as dealAudio
// above.
const score31Audio = new Audio(score31SoundUrl);
const score32Audio = new Audio(score32SoundUrl);
const endOfRoundAudio = new Audio(endOfRoundSoundUrl);

// slideAudio is the single Audio instance shared by every card-slide
// animation leg, reused for the same reason as dealAudio above.
const slideAudio = new Audio(slideSoundUrl);

// winAudio/loseAudio play whenever the Game Over screen is shown, per
// specs/assets.md, reused for the same reason as dealAudio above.
const winAudio = new Audio(winSoundUrl);
const loseAudio = new Audio(loseSoundUrl);

// Registered at module load, unconditionally, rather than only inside
// main() — the Game Over screen can be reached directly (a saved
// "over" state on reload, or specs/params.md's screen=over debug
// param) without main() ever running, and its win/lose sound still
// needs a prior gesture to unlock per unlockSoundsOnFirstGesture's own
// comment.
unlockSoundsOnFirstGesture([dealAudio, turnAudio, knockAudio, score31Audio, score32Audio, endOfRoundAudio, slideAudio, winAudio, loseAudio]);

// settings holds the user's persisted preferences (specs/gui.md's
// Settings Screen), loaded once at startup and kept in sync with
// localStorage as the player changes them.
let settings: Settings = loadSettings(localStorage);

// currentGameAbort controls whichever game main() is currently
// running (if any). Opening the Game Menu, abandoning, or starting
// another game via showGameScreen all abort it first -- see
// withTurnUi/DomActionPrompt below for what actually stops in
// response, and specs/state.md's Game Menu section for why "pause" is
// implemented as "stop outright, Resume restarts from the last
// checkpoint" rather than actually suspending anything.
let currentGameAbort: AbortController | undefined;

// currentMenuGame is the game the Game Menu screen is currently
// showing (specs/gui.md's Game Menu Screen), so Resume and "Settings"
// (which carries it onward for its own "Game Menu" back button) don't
// need to re-read it from storage.
let currentMenuGame: GameState | undefined;

// currentSettingsOrigin is which screen Settings was entered from
// (specs/gui.md's Settings Screen section), driving its back button's
// label/destination and whether the bot-difficulty toggles are
// disabled.
let currentSettingsOrigin: SettingsOrigin = { from: "main" };

// playDealSound plays deal.wav for one card being dealt, restarting
// dealAudio from the beginning, unless the player has disabled sounds.
// play() can still reject under the browser's autoplay policy (e.g. if
// unlockDealSoundOnFirstGesture hasn't fired yet) — logged, not thrown,
// since the deal works fine without sound either way.
function playDealSound(): void {
  if (!settings.soundsEnabled) {
    return;
  }
  dealAudio.currentTime = 0;
  dealAudio.play().catch((err: unknown) => console.warn("deal.wav: play() failed", err));
}

// playTurnSound plays turn.wav when it becomes the human player's
// (seat 0) turn, unless the player has disabled sounds. Mirrors
// playDealSound above.
function playTurnSound(): void {
  if (!settings.soundsEnabled) {
    return;
  }
  turnAudio.currentTime = 0;
  turnAudio.play().catch((err: unknown) => console.warn("turn.wav: play() failed", err));
}

// playKnockSound plays knock.wav when a player knocks, unless the
// player has disabled sounds. Mirrors playDealSound above.
function playKnockSound(): void {
  if (!settings.soundsEnabled) {
    return;
  }
  knockAudio.currentTime = 0;
  knockAudio.play().catch((err: unknown) => console.warn("knock.wav: play() failed", err));
}

// playRoundEndSound plays the round-end sound matching winningScore --
// 31.wav for 31, 32.wav for 32 (three aces), end-of-round.wav for any
// other winning score -- unless the player has disabled sounds. Mirrors
// playDealSound above.
function playRoundEndSound(winningScore: number): void {
  if (!settings.soundsEnabled) {
    return;
  }
  const audio = winningScore === 31 ? score31Audio : winningScore === 32 ? score32Audio : endOfRoundAudio;
  audio.currentTime = 0;
  audio.play().catch((err: unknown) => console.warn("round-end sound: play() failed", err));
}

// playGameOverSound plays win.wav or lose.wav when the Game Over
// screen is shown, per southWon -- unless the player has disabled
// sounds. Mirrors playDealSound above.
function playGameOverSound(southWon: boolean): void {
  if (!settings.soundsEnabled) {
    return;
  }
  const audio = southWon ? winAudio : loseAudio;
  audio.currentTime = 0;
  audio.play().catch((err: unknown) => console.warn("game-over sound: play() failed", err));
}

// playSlideSound plays slide.wav when a card-slide animation leg
// starts (tradeAnim.ts's animateCardTrade), unless the player has
// disabled sounds. Mirrors playDealSound above.
function playSlideSound(): void {
  if (!settings.soundsEnabled) {
    return;
  }
  slideAudio.currentTime = 0;
  slideAudio.play().catch((err: unknown) => console.warn("slide.wav: play() failed", err));
}

// unlockSoundsOnFirstGesture plays (silently, then immediately pauses)
// every clip in audios on the page's first click or keypress. Round
// 1's deal starts automatically, before the player has done anything,
// and browsers block unmuted audio until there's been a user gesture
// on the page — without this, the first sounds would be silent until
// the player happened to interact with something else first (or,
// depending on the browser, indefinitely).
function unlockSoundsOnFirstGesture(audios: readonly HTMLAudioElement[]): void {
  const unlock = () => {
    document.removeEventListener("click", unlock);
    document.removeEventListener("keydown", unlock);
    for (const audio of audios) {
      audio.volume = 0;
      audio
        .play()
        .then(() => {
          audio.pause();
          audio.currentTime = 0;
          audio.volume = 1;
        })
        .catch((err: unknown) => console.warn("could not unlock audio", err));
    }
  };
  document.addEventListener("click", unlock, { once: true });
  document.addEventListener("keydown", unlock, { once: true });
}

// Installed before anything else in this module runs (including the
// must() lookups just below), so even a failure during module
// initialization still shows the error screen instead of a blank page.
installGlobalErrorHandlers();

// debugParams is parsed once at module load — both main() (only run
// when the game screen is entered) and the screen-routing dispatch at
// the bottom of this file need it, and it's a pure parse of a value
// (the URL) that doesn't change during the page's lifetime. A
// validation failure here (e.g. screen=bogus) throws synchronously
// during module init, which installGlobalErrorHandlers (installed just
// above) still routes to the error screen.
const debugParams = parseDebugParams(window.location.search);

// specs/state.md: a URL supplying any valid debug parameter clears
// whatever was saved from a previous session first, so debugging never
// resumes a leftover game — including a bare `screen=`, which carries
// no game-seeding data of its own. An invalid parameter throws above,
// before this line, leaving saved state untouched.
if (window.location.search !== "") {
  clearState(localStorage);
}

// savedState is only consulted on a bare visit — any debug parameter
// takes precedence, and saved state was just cleared above in that
// case anyway.
const savedState: PersistedState | undefined = window.location.search === "" ? loadState(localStorage) : undefined;

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
  dealer: HTMLElement;
  score: HTMLElement;
  strikes: HTMLElement;
}

const mainScreenEl = must<HTMLElement>("main-screen");
const gameScreenEl = must<HTMLElement>("game-screen");
const menuBtn = must<HTMLButtonElement>("menu-btn");
const installAppBtn = must<HTMLButtonElement>("install-app-btn");
const newGameBtn = must<HTMLButtonElement>("new-game-btn");
const htpBtn = must<HTMLButtonElement>("htp-btn");
const settingsBtn = must<HTMLButtonElement>("settings-btn");
const aboutBtn = must<HTMLButtonElement>("about-btn");

const installDialogEl = must<HTMLDialogElement>("install-dialog");
const installDialogTextEl = must<HTMLElement>("install-dialog-text");
const installDialogCloseBtn = must<HTMLButtonElement>("install-dialog-close-btn");

// installPlatform is fixed for the life of the page load; standalone
// (already installed/launched from the home screen) is checked via
// both the standard display-mode media query and Safari's older
// navigator.standalone, since iOS Safari doesn't support the former.
const installPlatform = detectPlatform(navigator.userAgent, navigator.maxTouchPoints);
const isStandaloneApp =
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as unknown as { standalone?: boolean }).standalone === true;
installAppBtn.hidden = installPlatform === "other" || isStandaloneApp;

const menuScreenEl = must<HTMLElement>("menu-screen");
const menuResumeBtn = must<HTMLButtonElement>("menu-resume-btn");
const menuSettingsBtn = must<HTMLButtonElement>("menu-settings-btn");
const menuAbandonBtn = must<HTMLButtonElement>("menu-abandon-btn");

const abandonDialogEl = must<HTMLDialogElement>("abandon-dialog");
const abandonYesBtn = must<HTMLButtonElement>("abandon-yes-btn");
const abandonNoBtn = must<HTMLButtonElement>("abandon-no-btn");

const aboutScreenEl = must<HTMLElement>("about-screen");
const aboutVersionEl = must<HTMLElement>("about-version");
const aboutBuildEl = must<HTMLElement>("about-build");
const aboutMainMenuBtn = must<HTMLButtonElement>("about-main-menu-btn");
const licensesBtn = must<HTMLButtonElement>("licenses-btn");

must<HTMLImageElement>("about-github-icon").src = githubMarkUrl;

const licensesScreenEl = must<HTMLElement>("licenses-screen");
const licensesListEl = must<HTMLSelectElement>("licenses-list");
const licensesTextEl = must<HTMLTextAreaElement>("licenses-text");
const licensesMainMenuBtn = must<HTMLButtonElement>("licenses-main-menu-btn");

const htpScreenEl = must<HTMLElement>("htp-screen");
const htpTextEl = must<HTMLTextAreaElement>("htp-text");
const htpMainMenuBtn = must<HTMLButtonElement>("htp-main-menu-btn");

const settingsScreenEl = must<HTMLElement>("settings-screen");
const soundsToggleBtn = must<HTMLButtonElement>("sounds-toggle-btn");
const bot1ToggleBtn = must<HTMLButtonElement>("bot1-toggle-btn");
const bot2ToggleBtn = must<HTMLButtonElement>("bot2-toggle-btn");
const bot3ToggleBtn = must<HTMLButtonElement>("bot3-toggle-btn");
const settingsBackBtn = must<HTMLButtonElement>("settings-back-btn");

const gameOverScreenEl = must<HTMLElement>("game-over-screen");
const gameOverLine1El = must<HTMLElement>("game-over-line1");
const gameOverLine2El = must<HTMLElement>("game-over-line2");

const errorScreenEl = must<HTMLElement>("error-screen");
const playAgainBtn = must<HTMLButtonElement>("play-again-btn");
const mainMenuBtn = must<HTMLButtonElement>("main-menu-btn");
const saveLogBtn = must<HTMLButtonElement>("save-log-btn");

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
    dealer: must<HTMLElement>(`dealer-${key}`),
    score: must<HTMLElement>(`score-${key}`),
    strikes: must<HTMLElement>(`strikes-${key}`),
  };
}) as [SeatEls, SeatEls, SeatEls, SeatEls];

// seatOf indexes seatEls by a runtime seat number (0-3), which
// noUncheckedIndexedAccess can't itself prove is always in range.
function seatOf(seat: number): SeatEls {
  return seatEls[seat] as SeatEls;
}

// setActiveSeat highlights whichever seat is currently deciding —
// tagged "first" instead of "turn" when it's the round's first turn —
// leaving already-eliminated panels' dimmed state, and the current
// round's knocked panel (if any), alone.
function setActiveSeat(seat: number, isFirstTurn: boolean): void {
  for (let s = 0; s < 4; s++) {
    const panel = seatOf(s).panel;
    if (panel.classList.contains("is-eliminated") || panel.classList.contains("is-knocked")) {
      continue;
    }
    setPanelState(panel, s === seat ? (isFirstTurn ? "first" : "turn") : "none");
  }
}

// pending returns a Promise that never resolves -- used once a game
// has been aborted (Menu/Abandon, see currentGameAbort above) to
// freeze a turn permanently in place, rather than letting it resolve
// into a decision nothing is going to look at anymore.
function pending<T>(): Promise<T> {
  return new Promise<T>(() => {});
}

// withTurnUi wraps a seat's strategy so that, before deciding, it
// highlights that seat's panel and logs the "Seat's turn" line — and
// for bots, also pauses for a random duration between
// MIN_BOT_THINK_TIME and MAX_BOT_THINK_TIME, the non-blocking,
// setTimeout-based analog of cli/cli.ts's thinking(), which pauses via
// a blocking sleep instead.
//
// signal is what actually implements "pausing" the game (Menu/
// Abandon, specs/gui.md's Game Menu Screen): once aborted, whichever
// seat is next asked to decide is frozen there via pending() instead
// of ever being asked, so Round.run() never advances past this point.
// A decision already in flight when the game is aborted is instead
// handled by DomActionPrompt (for South) or simply allowed to finish
// (for a bot -- see main()'s onTurn, which discards its effect once
// aborted).
function withTurnUi(seat: number, inner: Strategy, signal: AbortSignal): Strategy {
  return {
    async decide(v: PlayerView): Promise<Action> {
      if (signal.aborted) {
        return pending();
      }
      setActiveSeat(seat, v.isFirstTurnOfRound);
      appendLogLine(logEl, turnStartLine(seat, v.isFirstTurnOfRound));
      if (seat === 0) {
        playTurnSound();
      } else {
        await sleep(MIN_BOT_THINK_TIME + Math.random() * (MAX_BOT_THINK_TIME - MIN_BOT_THINK_TIME));
        if (signal.aborted) {
          return pending();
        }
      }
      return inner.decide(v);
    },
    // Round (src/game/round.ts) calls these on whichever Strategy it's
    // handed -- without forwarding them, a bot wrapped for turn UI
    // would never get onRoundStart/observe at all, and its opponent
    // tracking (specs/bots.md) would silently never run.
    onRoundStart: () => inner.onRoundStart?.(),
    observe: (t: PublicTurn) => inner.observe?.(t),
  };
}

// pauseBetweenRounds resolves after ms, as soon as the player clicks
// anywhere on the page, or as soon as signal aborts (Menu/Abandon
// mid-pause, specs/gui.md's Game Menu Screen), whichever comes first.
function pauseBetweenRounds(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      document.removeEventListener("click", onClick);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const onClick = () => finish();
    const timer = setTimeout(finish, ms);
    signal.addEventListener("abort", finish);
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
//
// An exchange on the round's first turn (Take Pot) is a further special
// case: the pot is still private then (specs/rules.md), so unlike every
// other trade/exchange, the cards moving pot -> hand were never public
// to begin with and must stay hidden for the entire animation, not just
// re-concealed on landing -- takenIsSecret drives that.
async function animateTurnCards(rec: TurnRecord): Promise<void> {
  const hand = seatOf(rec.seat).hand;
  const conceal = rec.seat !== 0;

  switch (rec.action.type) {
    case "trade": {
      const { handIndex, potIndex } = rec.action;
      await animateCardTrade(hand.children[handIndex] as HTMLElement, potEl.children[potIndex] as HTMLElement, rec.handBefore[handIndex] as Card, rec.potBefore[potIndex] as Card, conceal, false, playSlideSound);
      break;
    }
    case "exchange": {
      const takenIsSecret = rec.turnIndex === 0 && conceal;
      for (let i = 0; i < 3; i++) {
        await animateCardTrade(hand.children[i] as HTMLElement, potEl.children[i] as HTMLElement, rec.handBefore[i] as Card, rec.potBefore[i] as Card, conceal, takenIsSecret, playSlideSound);
      }
      break;
    }
    case "knock":
      // No card movement to animate, but the turn must not advance --
      // and so the next seat's turn sound must not play -- until
      // knock.wav has finished, or it overlaps the turn sound. See
      // KNOCK_SOUND_WAIT.
      await sleep(KNOCK_SOUND_WAIT);
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

  // Mirrors round.ts's own knock detection (a knock or an exchange, on
  // any turn but the round's very first — Take Pot/Keep on that turn
  // never counts) to tag that seat's panel. round.ts itself only ever
  // records the first such action as *the* knocker (the one whose
  // choice ends the round), but every seat that chooses knock/exchange
  // on its own turn gets tagged here, not just that first one. The tag
  // is cleared with the rest of the turn state once the round ends
  // (see the roundNum loop in main()).
  if (rec.turnIndex !== 0 && (rec.action.type === "knock" || rec.action.type === "exchange")) {
    setPanelState(seatOf(rec.seat).panel, "knocked");
    playKnockSound();
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
// specs/gui.md. The pot is private (dealt as card backs) unless South
// is firstSeat — the round's first player to act, the only one who
// may see it before their turn resolves.
//
// signal aborting mid-animation (Menu/Abandon, specs/gui.md's Game
// Menu Screen) stops the per-card loop outright, not just its sound:
// the seat panels/pot this deals into are the same persistent DOM
// elements a freshly resumed game's own deal will render into, so a
// stale iteration still appending cards after the player has already
// navigated away (and possibly Resumed into a new deal of its own)
// would corrupt what's on screen.
async function animateDeal(roundNum: number, pot: Pot, hands: ReadonlyMap<number, Hand>, firstSeat: number, signal: AbortSignal): Promise<void> {
  const potPrivate = firstSeat !== 0;
  const southHand = hands.get(0);
  for (const line of roundStartLines(roundNum, pot, southHand, firstSeat)) {
    appendLogLine(logEl, line);
  }

  for (let seat = 0; seat < 4; seat++) {
    setWon(seatOf(seat).panel, false);
    setStruck(seatOf(seat).panel, false);
    setPanelState(seatOf(seat).panel, hands.has(seat) ? "none" : "eliminated");
    // Clears every seat's hand, not just this round's active ones: a
    // seat eliminated last round still shows its final revealed hand
    // (per specs/gui.md's Player Panel Contents section) right up
    // until this next deal, since nothing else clears it in the
    // meantime — see the round-end loop in main(), which deliberately
    // leaves a newly-eliminated seat's hand alone so its reveal is
    // actually visible through the pause.
    seatOf(seat).hand.replaceChildren();
  }

  const activeSeats = [0, 1, 2, 3].filter((seat) => hands.has(seat));
  for (const seat of activeSeats) {
    if (seat !== 0) {
      setScore(seatOf(seat).score, null);
    }
  }
  potEl.replaceChildren();

  for (const step of dealOrder(activeSeats)) {
    if (signal.aborted) {
      return;
    }
    const el =
      step.kind === "hand"
        ? step.seat === 0
          ? cardEl((southHand as Hand)[step.cardIndex] as Card)
          : backEl()
        : potPrivate
          ? backEl()
          : cardEl(pot[step.potIndex] as Card);
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
  // turn (turn order varies by round). South may already be
  // eliminated and thus never dealt a hand this round.
  if (southHand !== undefined) {
    setScore(seatOf(0).score, score(southHand));
  }
}

// renderDealInstant places round 1's already-dealt hands/pot directly,
// with no per-card animation or sound — used instead of animateDeal
// when specs/params.md's north/south/east/west/pot debug params
// pre-populate the deal, per its "dealing is not animated" note. The
// pot is private (rendered as card backs) unless South is firstSeat,
// same as animateDeal.
function renderDealInstant(roundNum: number, pot: Pot, hands: ReadonlyMap<number, Hand>, firstSeat: number): void {
  const southHand = hands.get(0);
  for (const line of roundStartLines(roundNum, pot, southHand, firstSeat)) {
    appendLogLine(logEl, line);
  }

  for (let seat = 0; seat < 4; seat++) {
    setWon(seatOf(seat).panel, false);
    setStruck(seatOf(seat).panel, false);
    setPanelState(seatOf(seat).panel, hands.has(seat) ? "none" : "eliminated");
  }

  for (const [seat, hand] of hands) {
    if (seat === 0) {
      renderCards(seatOf(0).hand, hand);
    } else {
      renderBacks(seatOf(seat).hand, hand.length);
    }
  }
  if (firstSeat === 0) {
    renderCards(potEl, pot);
  } else {
    renderBacks(potEl, pot.length);
  }

  if (southHand !== undefined) {
    setScore(seatOf(0).score, score(southHand));
  }
}

// renderResumedRound places a resumed round's checkpoint hands/pot
// directly, exactly like renderDealInstant, but without logging
// roundStartLines or resetting won/struck/panel state — this isn't a
// new deal (specs/state.md), it's redisplaying a round already in
// progress, whose deal was already logged and whose panel state was
// already restored before the round loop began. potPrivate mirrors
// animateDeal's own condition: still true only if the checkpoint was
// taken before the round's first turn resolved.
function renderResumedRound(pot: Pot, hands: ReadonlyMap<number, Hand>, potPrivate: boolean): void {
  const southHand = hands.get(0);
  for (const [seat, hand] of hands) {
    if (seat === 0) {
      renderCards(seatOf(0).hand, hand);
    } else {
      renderBacks(seatOf(seat).hand, hand.length);
    }
  }
  if (potPrivate) {
    renderBacks(potEl, pot.length);
  } else {
    renderCards(potEl, pot);
  }

  if (southHand !== undefined) {
    setScore(seatOf(0).score, score(southHand));
  }
}

// logLines returns the log panel's current lines, one entry per line
// appended by appendLogLine (including its blank lines) — the form
// specs/state.md saves the log in. Empty when the log itself is empty
// (logText would otherwise report a single blank line).
function logLines(): string[] {
  const text = logText(logEl);
  return text === "" ? [] : text.split("\n");
}

// restoreLogLines replaces the log panel's contents with lines saved
// by logLines, for resuming a screen per specs/state.md.
function restoreLogLines(lines: readonly string[]): void {
  logEl.replaceChildren();
  for (const line of lines) {
    appendLogLine(logEl, line);
  }
}

// saveGameState persists game as the Game screen's resumable state
// (specs/state.md).
function saveGameState(game: GameState): void {
  saveState({ screen: "game", game }, localStorage);
}

// checkpointToOverride turns a saved RoundCheckpoint back into the
// RoundDealOverride that resumes it: every active seat's hand and the
// pot are pre-populated exactly as saved, so newRound deals nothing at
// random, and firstSeat/turnIndex/knocked/knockerSeat carry forward
// whose turn is next and whether the round's knock-ends-it rules
// already apply.
function checkpointToOverride(checkpoint: RoundCheckpoint): RoundDealOverride {
  return {
    assignedHands: new Map(checkpoint.hands),
    assignedPot: checkpoint.pot,
    firstSeat: checkpoint.firstSeat,
    turnIndex: checkpoint.turnIndex,
    knocked: checkpoint.knocked,
    knockerSeat: checkpoint.knockerSeat,
  };
}

// main plays one game on the Game screen: a brand new one, or — when
// resume is given (specs/state.md, a page revisited with no debug
// parameters and a saved game screen) — one picked back up from a
// saved checkpoint instead of starting over. signal aborts the game
// outright (Menu/Abandon, specs/gui.md's Game Menu Screen) rather than
// pausing it in place — see withTurnUi and the abort checks scattered
// through the round loop below, and abortCurrentGame's own comment for
// why "Resume" is just re-entering main() from the last checkpoint
// instead of literally suspending this call.
async function main(resume: GameState | undefined, signal: AbortSignal): Promise<void> {
  const params = debugParams;

  initCardSheetVars();
  initStrikeBlinkVar();

  const seed = Date.now();
  const human = new DomActionPrompt(potEl, seatEls[0].hand, seatEls[0].score, takePotBtn, knockBtn, signal);
  const botRng = new Rng(seed);
  // A resumed game keeps the bot/seat pairing it started with instead
  // of reshuffling (specs/state.md); a brand new game shuffles the
  // three settings-configured bots across the three bot seats
  // (specs/bots.md).
  const botSeats: BotSeats = resume ? resume.botSeats : assignBotSeats(settings, botRng);
  // savedMemory carries each bot seat's tracked opponent info forward
  // from the resumed round's checkpoint (specs/state.md), if any, so
  // rebuilding the bots below doesn't lose what they'd already learned
  // this round.
  const savedMemory = new Map<number, BotMemory>(resume?.checkpoint?.botMemory ?? []);
  // bots holds the three bot seats' raw strategies (unwrapped by
  // withTurnUi below) so their memory can be snapshotted for the
  // checkpoint as the round progresses.
  const bots: [Strategy, Strategy, Strategy] = [
    createBot(botSeats[0], botRng, savedMemory.get(1)),
    createBot(botSeats[1], botRng, savedMemory.get(2)),
    createBot(botSeats[2], botRng, savedMemory.get(3)),
  ];
  const strategies: [Strategy, Strategy, Strategy, Strategy] = [
    withTurnUi(0, human, signal),
    withTurnUi(1, bots[0], signal),
    withTurnUi(2, bots[1], signal),
    withTurnUi(3, bots[2], signal),
  ];
  // botMemoryCheckpoint snapshots every bot seat's current memory,
  // keyed by seat, for RoundCheckpoint.botMemory.
  const botMemoryCheckpoint = (): Array<[number, BotMemory]> => [
    [1, snapshotBot(botSeats[0], bots[0])],
    [2, snapshotBot(botSeats[1], bots[1])],
    [3, snapshotBot(botSeats[2], bots[2])],
  ];

  const g = resume
    ? new Game({
        strategies,
        strikes: resume.strikes,
        eliminated: resume.eliminated,
        rng: new Rng(seed),
        initialDeal: resume.checkpoint ? checkpointToOverride(resume.checkpoint) : undefined,
        dealerSeat: resume.dealerSeat,
      })
    : newGame(seed, strategies, params.initialStrikes, params.initialDeal);

  // Resets every seat panel, score, and hand — a no-op for the very
  // first game (everything already starts blank), but required for
  // Play Again (specs/gui.md's Game Over Screen section), which
  // re-enters main() on the same DOM a finished game left its
  // final-round highlights and log lines in. A resumed game restores
  // its saved log instead of clearing it (specs/state.md).
  if (resume) {
    restoreLogLines(resume.log);
  } else {
    logEl.replaceChildren();
  }
  for (let seat = 0; seat < 4; seat++) {
    setWon(seatOf(seat).panel, false);
    setStruck(seatOf(seat).panel, false);
    setPanelState(seatOf(seat).panel, g.eliminated[seat] ? "eliminated" : "none");
    setScore(seatOf(seat).score, null);
    renderStrikes(seatOf(seat).strikes, g.strikes[seat] as number);
    seatOf(seat).hand.replaceChildren();
  }
  potEl.replaceChildren();

  if (!resume) {
    for (const line of gameStartLines(seed, version)) {
      appendLogLine(logEl, line);
    }
  }

  const startRoundNum = resume?.roundNum ?? 1;

  saveGameState({ strikes: g.strikes, eliminated: g.eliminated, roundNum: startRoundNum, dealerSeat: g.dealerSeat as number, botSeats, checkpoint: undefined, log: logLines() });

  for (let roundNum = startRoundNum; ; roundNum++) {
    if (signal.aborted) {
      return;
    }

    // roundHands/roundPot/roundTurnIndex/roundKnocked/roundKnockerSeat
    // track this round's live state through every deal and turn, kept
    // in sync by onDeal/onTurn below — enough to build a
    // RoundCheckpoint (specs/state.md) after each, without Game/Round
    // exposing their internal Round object. Only the resumed round
    // (roundNum === startRoundNum) seeds turnIndex/knocked/knockerSeat
    // from resume's own checkpoint; every later round starts fresh.
    let roundHands: Map<number, Hand> | undefined;
    let roundPot: Pot | undefined;
    let roundTurnIndex = roundNum === startRoundNum ? (resume?.checkpoint?.turnIndex ?? 0) : 0;
    let roundKnocked = roundNum === startRoundNum ? (resume?.checkpoint?.knocked ?? false) : false;
    let roundKnockerSeat = roundNum === startRoundNum ? (resume?.checkpoint?.knockerSeat ?? -1) : -1;

    for (let seat = 0; seat < 4; seat++) {
      setDealer(seatOf(seat).dealer, seat === g.dealerSeat);
    }

    g.onDeal = async (pot, hands, firstSeat) => {
      if (signal.aborted) {
        return;
      }
      roundHands = new Map(hands);
      roundPot = pot;
      if (roundNum === startRoundNum && resume?.checkpoint) {
        renderResumedRound(pot, hands, firstSeat !== 0 && resume.checkpoint.turnIndex === 0);
      } else if (roundNum === startRoundNum && params.skipDealAnimation) {
        renderDealInstant(roundNum, pot, hands, firstSeat);
      } else {
        await animateDeal(roundNum, pot, hands, firstSeat, signal);
      }
      // A deal animation in flight when the game was aborted mid-way
      // must not still persist this round's checkpoint afterwards --
      // otherwise Resume would read back a deal the player never
      // actually saw finish (specs/gui.md's Game Menu Screen).
      if (signal.aborted) {
        return;
      }
      // A resumed round that was already knocked before reload gets no
      // "knocked" turn of its own to earn the panel tag from — apply it
      // directly so the panel matches Round's restored knocked state.
      if (roundKnocked && roundKnockerSeat >= 0) {
        setPanelState(seatOf(roundKnockerSeat).panel, "knocked");
      }
      saveGameState({
        strikes: g.strikes,
        eliminated: g.eliminated,
        roundNum,
        dealerSeat: g.dealerSeat as number,
        botSeats,
        checkpoint: {
          hands: [...roundHands.entries()],
          pot: roundPot,
          firstSeat,
          turnIndex: roundTurnIndex,
          knocked: roundKnocked,
          knockerSeat: roundKnockerSeat,
          botMemory: botMemoryCheckpoint(),
        },
        log: logLines(),
      });
    };
    g.onTurn = async (rec) => {
      if (signal.aborted) {
        return;
      }
      await renderTurn(rec);

      // Mirrors the onDeal check above: a trade/exchange animation in
      // flight when the game was aborted mid-way must not still
      // persist this turn's checkpoint afterwards.
      if (signal.aborted) {
        return;
      }

      const hands = roundHands as Map<number, Hand>;
      hands.set(rec.seat, rec.handAfter);
      roundPot = rec.potAfter;
      roundTurnIndex = rec.turnIndex + 1;
      // Mirrors round.ts's own knock detection (a knock or an exchange,
      // on any turn but the round's first — Take Pot/Keep on that turn
      // never counts) so a resumed round still ends under the same
      // rule a freshly dealt one would.
      if (!roundKnocked && rec.turnIndex !== 0 && (rec.action.type === "knock" || rec.action.type === "exchange")) {
        roundKnocked = true;
        roundKnockerSeat = rec.seat;
      }
      const active = [...hands.keys()].sort((a, b) => a - b);
      const nextSeat = active[(active.indexOf(rec.seat) + 1) % active.length] as number;

      saveGameState({
        strikes: g.strikes,
        eliminated: g.eliminated,
        roundNum,
        dealerSeat: g.dealerSeat as number,
        botSeats,
        checkpoint: {
          hands: [...hands.entries()],
          pot: roundPot as Pot,
          firstSeat: nextSeat,
          turnIndex: roundTurnIndex,
          knocked: roundKnocked,
          knockerSeat: roundKnockerSeat,
          botMemory: botMemoryCheckpoint(),
        },
        log: logLines(),
      });
    };

    const outcome = await g.playRound();

    if (signal.aborted) {
      return;
    }

    // The round's over, so nobody's "on turn" or "knocked" anymore —
    // clear both before applying this round's win/strike highlights, or
    // whoever last acted/knocked would keep that tag through the pause.
    for (let seat = 0; seat < 4; seat++) {
      setPanelState(seatOf(seat).panel, g.eliminated[seat] ? "eliminated" : "none");
    }

    for (const line of roundRecapLines(outcome, g.strikes)) {
      appendLogLine(logEl, line);
    }
    for (const pr of outcome.result.players) {
      setScore(seatOf(pr.seat).score, pr.score);
      // Bots' hands are private during play (specs/gui.md's "if
      // information about their card is private" rule), but once the
      // round is over and scores are announced, they're public same as
      // the score itself — swap the card backs for the real cards.
      if (pr.seat !== 0) {
        renderCards(seatOf(pr.seat).hand, pr.hand);
      }
    }
    for (const seat of outcome.result.winners) {
      setWon(seatOf(seat).panel, true);
    }
    const winningScore = outcome.result.players.find((pr) => outcome.result.winners.includes(pr.seat))?.score;
    if (winningScore !== undefined) {
      playRoundEndSound(winningScore);
    }
    for (const seat of outcome.struck) {
      setStruck(seatOf(seat).panel, true);
      // A struck seat that this same strike eliminated already got the
      // "eliminated" tag above (g.eliminated is updated inside
      // playRound, before outcome is returned) — "strike" only tags a
      // seat that survives the strike.
      if (!g.eliminated[seat]) {
        setPanelState(seatOf(seat).panel, "strike");
      }
    }
    for (let seat = 0; seat < 4; seat++) {
      renderStrikes(seatOf(seat).strikes, g.strikes[seat] as number);
      if (g.eliminated[seat]) {
        setPanelState(seatOf(seat).panel, "eliminated");
        // The hand itself is left alone here — a seat eliminated by
        // this round's strike was just revealed above (outcome.result.
        // players) and should stay visible through the pause; a seat
        // eliminated earlier already has an empty hand from its own
        // elimination round and nothing has repopulated it since.
        // animateDeal() clears it before the next deal either way.
      }
    }

    // Per specs/gui.md's Game Over Screen section: the pause always
    // runs — so the final round's win/strike highlights are visible,
    // and can still be skipped by clicking, same as any other round —
    // but once it expires, play only continues into another deal if
    // the game hasn't actually ended.
    const gameOver = !g.active() || g.eliminated[0];
    if (gameOver) {
      // Persisted here, before the pause, rather than as a "game"
      // checkpoint for a round that no longer exists: resuming into a
      // finished round would call playRound() again and double-apply
      // its strikes. specs/state.md's Game Over screen state is saved
      // directly instead, so a reload during the pause resumes there.
      for (const line of gameEndLines(g)) {
        appendLogLine(logEl, line);
      }
      saveState(
        {
          screen: "over",
          game: {
            strikes: g.strikes,
            eliminated: g.eliminated,
            roundNum: roundNum + 1,
            dealerSeat: g.dealerSeat as number,
            botSeats,
            log: logLines(),
            southWon: g.winners().includes(0),
          },
        },
        localStorage,
      );
    } else {
      saveGameState({ strikes: g.strikes, eliminated: g.eliminated, roundNum: roundNum + 1, dealerSeat: g.dealerSeat as number, botSeats, checkpoint: undefined, log: logLines() });
    }

    await pauseBetweenRounds(3000, signal);

    if (signal.aborted) {
      return;
    }

    // A seat eliminated this round had its final score revealed above
    // and left visible through the pause; now that the pause is over,
    // clear it like any other eliminated seat's score box (already-
    // eliminated seats never had theirs cleared past their own
    // elimination round, since animateDeal's score-clearing loop only
    // covers this round's active seats).
    for (let seat = 0; seat < 4; seat++) {
      if (g.eliminated[seat]) {
        setScore(seatOf(seat).score, null);
      }
    }

    if (gameOver) {
      break;
    }
  }

  showGameOverScreen(g.winners().includes(0));
}

// hideAllScreens hides every top-level screen. Each show*Screen
// function below calls this first, then reveals just its own element
// — so any screen is safe to enter directly (e.g. via
// specs/params.md's screen debug param) regardless of which screen,
// if any, was already showing.
function hideAllScreens(): void {
  mainScreenEl.hidden = true;
  gameScreenEl.hidden = true;
  menuScreenEl.hidden = true;
  aboutScreenEl.hidden = true;
  licensesScreenEl.hidden = true;
  htpScreenEl.hidden = true;
  settingsScreenEl.hidden = true;
  gameOverScreenEl.hidden = true;
  errorScreenEl.hidden = true;
}

// abortCurrentGame stops whichever game main() is currently running
// (if any, per currentGameAbort's own comment) and cleans up anything
// that could otherwise keep running or lingering visibly after the
// player has navigated away: a deal, turn, knock, round-end, slide,
// or game-over sound already mid-playback, and any in-flight
// card-trade "ghost" element (tradeAnim.ts), which animates as a
// position: fixed element appended straight to document.body rather
// than under the (now hidden) game screen.
function abortCurrentGame(): void {
  currentGameAbort?.abort();
  dealAudio.pause();
  turnAudio.pause();
  knockAudio.pause();
  score31Audio.pause();
  score32Audio.pause();
  endOfRoundAudio.pause();
  slideAudio.pause();
  winAudio.pause();
  loseAudio.pause();
  for (const ghost of document.querySelectorAll(".card--ghost")) {
    ghost.remove();
  }
}

// showGameScreen swaps whichever screen is up for the game screen,
// then starts a game — a brand new one, or, given resume, one picked
// back up per specs/state.md (including a game just Resumed from the
// Game Menu screen, which uses this same path).
function showGameScreen(resume?: GameState): void {
  abortCurrentGame();
  const controller = new AbortController();
  currentGameAbort = controller;
  hideAllScreens();
  gameScreenEl.hidden = false;
  main(resume, controller.signal).catch(showErrorScreen);
}

// openGameMenu swaps whichever screen is up for the Game Menu screen
// (per specs/gui.md's Game Screen section's Menu button/Escape key),
// stopping the in-progress game outright rather than pausing it in
// place -- see currentGameAbort's own comment. The game it shows is
// exactly the last checkpoint main() saved (kept fresh after every
// deal/turn), re-tagged under the "menu" screen rather than "game".
function openGameMenu(): void {
  abortCurrentGame();
  const state = loadState(localStorage);
  if (state?.screen !== "game") {
    return;
  }
  showGameMenuScreen(state.game);
}

// showGameMenuScreen swaps whichever screen is up for the Game Menu
// screen, for game -- either a live game just paused via openGameMenu,
// or one restored from saved state (specs/state.md) or synthesized for
// specs/params.md's screen=menu debug param.
function showGameMenuScreen(game: GameState): void {
  currentMenuGame = game;
  hideAllScreens();
  menuScreenEl.hidden = false;
  saveState({ screen: "menu", game }, localStorage);
}

// showMainScreen swaps whichever screen is up for the main screen (per
// specs/gui.md's Game Over Screen, About Screen, and Settings Screen
// sections' "Main Menu" buttons), and persists it as the screen to
// resume (specs/state.md).
function showMainScreen(): void {
  hideAllScreens();
  mainScreenEl.hidden = false;
  saveState({ screen: "main" }, localStorage);
}

// syncSoundsToggleBtn sets the sounds toggle button's label to match
// settings.soundsEnabled (per specs/gui.md's Settings Screen section).
function syncSoundsToggleBtn(): void {
  soundsToggleBtn.textContent = settings.soundsEnabled ? "Enabled" : "Disabled";
}

// BOT_LABELS maps a BotName to its Settings Screen button label
// (specs/gui.md's Settings Screen section: "Easy", "Regular",
// "Difficult").
const BOT_LABELS: Record<BotName, string> = { easy: "Easy", regular: "Regular", difficult: "Difficult" };

// syncBotToggleBtns sets each of the three bot toggle buttons' labels
// to match settings.bot1/bot2/bot3.
function syncBotToggleBtns(): void {
  bot1ToggleBtn.textContent = BOT_LABELS[settings.bot1];
  bot2ToggleBtn.textContent = BOT_LABELS[settings.bot2];
  bot3ToggleBtn.textContent = BOT_LABELS[settings.bot3];
}

// showSettingsScreen swaps whichever screen is up for the settings
// screen (per specs/gui.md's Main Screen and Game Menu Screen
// sections' "Settings" buttons), and persists it -- together with
// origin -- as the screen to resume (specs/state.md). Entered from the
// Game Menu, the bot-difficulty toggles are disabled (a game is in
// progress) and the back button reads "Game Menu" instead of "Main
// Menu" (wired below, alongside the other menu/settings listeners).
function showSettingsScreen(origin: SettingsOrigin): void {
  currentSettingsOrigin = origin;
  syncSoundsToggleBtn();
  syncBotToggleBtns();
  const fromMenu = origin.from === "menu";
  bot1ToggleBtn.disabled = fromMenu;
  bot2ToggleBtn.disabled = fromMenu;
  bot3ToggleBtn.disabled = fromMenu;
  settingsBackBtn.textContent = fromMenu ? "Game Menu" : "Main Menu";
  hideAllScreens();
  settingsScreenEl.hidden = false;
  saveState({ screen: "settings", ...origin }, localStorage);
}

// showAboutScreen swaps whichever screen is up for the about screen
// (per specs/gui.md's Main Screen section's "About" button), filling
// in the version/build-date text it displays, and persists it as the
// screen to resume (specs/state.md).
function showAboutScreen(): void {
  aboutVersionEl.textContent = `Version ${version}`;
  aboutBuildEl.textContent = `Built on ${buildTime}`;
  hideAllScreens();
  aboutScreenEl.hidden = false;
  saveState({ screen: "about" }, localStorage);
}

// syncLicenseText sets the text area to the currently selected list
// box entry's license text, per specs/gui.md's Licenses section.
function syncLicenseText(): void {
  const name = licensesListEl.value;
  const entry = licenses.find((e) => e.name === name);
  licensesTextEl.value = entry?.text ?? "";
}

// showLicensesScreen swaps whichever screen is up for the licenses
// screen (per specs/gui.md's About Screen section's "Licenses"
// button), populating the list box alphabetically with the
// "Rumble-31" entry selected by default (specs/gui.md's Licenses
// section), and persists it as the screen to resume (specs/state.md).
function showLicensesScreen(): void {
  licensesListEl.replaceChildren();
  for (const entry of sortedLicenses(licenses)) {
    const option = document.createElement("option");
    option.value = entry.name;
    option.textContent = entry.name;
    licensesListEl.appendChild(option);
  }
  licensesListEl.value = defaultLicense(licenses)?.name ?? "";
  syncLicenseText();

  hideAllScreens();
  licensesScreenEl.hidden = false;
  saveState({ screen: "licenses" }, localStorage);
}

// showHtpScreen swaps whichever screen is up for the How to Play
// screen (per specs/gui.md's How to Play section), populating the
// text area with how-to-play.md's contents (baked in at build time by
// scripts/gen-how-to-play.mjs), and persists it as the screen to
// resume (specs/state.md).
function showHtpScreen(): void {
  htpTextEl.value = howToPlayText;
  hideAllScreens();
  htpScreenEl.hidden = false;
  saveState({ screen: "htp" }, localStorage);
}

// showGameOverScreen swaps whichever screen is up for the game-over
// screen, announcing South's win or loss per specs/gui.md's Game Over
// Screen section: "You Won!"/"Game Over", one word per line, and
// playing win.wav/lose.wav per specs/assets.md -- every time this
// screen is shown, including a reload landing on a saved "over" state
// or specs/params.md's screen=over debug param, not just a live game
// actually finishing.
function showGameOverScreen(southWon: boolean): void {
  const [line1, line2] = southWon ? ["You", "Won!"] : ["Game", "Over"];
  gameOverLine1El.textContent = line1;
  gameOverLine2El.textContent = line2;
  hideAllScreens();
  gameOverScreenEl.hidden = false;
  playGameOverSound(southWon);
}

// showDebugGameOverScreen reaches the game-over screen directly via
// specs/params.md's screen=over debug param, with no game actually
// played. Per that spec, the win/loss message defaults to whether
// South (seat 0) already starts eliminated per the strikes param.
function showDebugGameOverScreen(params: DebugParams): void {
  const eliminated = params.initialStrikes.map((s) => s >= 3) as [boolean, boolean, boolean, boolean];
  const southWon = params.initialStrikes[0] < 3;
  saveState(
    {
      screen: "over",
      game: { strikes: params.initialStrikes, eliminated, roundNum: 1, dealerSeat: 0, botSeats: [settings.bot1, settings.bot2, settings.bot3], log: logLines(), southWon },
    },
    localStorage,
  );
  showGameOverScreen(southWon);
}

// restoreGameOverScreen redraws the Game Over screen directly from
// saved state (specs/state.md), with no game replayed.
function restoreGameOverScreen(game: OverState): void {
  restoreLogLines(game.log);
  showGameOverScreen(game.southWon);
}

// downloadTextFile saves text as a local file named filename, via a
// throwaway object URL and link click — the standard way to trigger a
// browser "Save As" from script for content that only ever existed in
// memory (nothing is fetched or navigated to).
function downloadTextFile(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

playAgainBtn.addEventListener("click", () => showGameScreen());
mainMenuBtn.addEventListener("click", showMainScreen);
aboutMainMenuBtn.addEventListener("click", showMainScreen);
licensesMainMenuBtn.addEventListener("click", showMainScreen);
licensesBtn.addEventListener("click", showLicensesScreen);
htpMainMenuBtn.addEventListener("click", showMainScreen);
htpBtn.addEventListener("click", showHtpScreen);

// settingsBackBtn returns to wherever Settings was entered from
// (specs/gui.md's Settings Screen section): the Main screen, or --
// entered via the Game Menu -- that same Game Menu screen, with the
// game it was showing carried back along with it.
settingsBackBtn.addEventListener("click", () => {
  if (currentSettingsOrigin.from === "menu") {
    showGameMenuScreen(currentSettingsOrigin.game);
  } else {
    showMainScreen();
  }
});

// menuBtn/Escape open the Game Menu screen (specs/gui.md's Game Screen
// section); Escape only does so while the Game screen is actually
// showing, so it's a no-op everywhere else (including while the
// Abandon confirmation dialog, only reachable from the Game Menu, is
// open -- the game screen is already hidden by then).
menuBtn.addEventListener("click", openGameMenu);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !gameScreenEl.hidden) {
    openGameMenu();
  }
});

menuResumeBtn.addEventListener("click", () => showGameScreen(currentMenuGame));
menuSettingsBtn.addEventListener("click", () => showSettingsScreen({ from: "menu", game: currentMenuGame as GameState }));
menuAbandonBtn.addEventListener("click", () => abandonDialogEl.showModal());

// A native <dialog>'s own Escape-to-cancel behavior already dismisses
// it like "No" with no extra wiring needed here.
abandonNoBtn.addEventListener("click", () => abandonDialogEl.close());
abandonYesBtn.addEventListener("click", () => {
  abortCurrentGame();
  clearState(localStorage);
  abandonDialogEl.close();
  showMainScreen();
});
licensesListEl.addEventListener("change", syncLicenseText);
saveLogBtn.addEventListener("click", () => downloadTextFile("rumble-31-log.txt", logText(logEl)));
soundsToggleBtn.addEventListener("click", () => {
  settings = { ...settings, soundsEnabled: !settings.soundsEnabled };
  saveSettings(settings, localStorage);
  syncSoundsToggleBtn();
});

// nextBotName cycles a BotName through BOT_NAMES's order (specs/gui.md's
// Settings Screen section: "Easy", "Regular", "Difficult").
function nextBotName(name: BotName): BotName {
  return BOT_NAMES[(BOT_NAMES.indexOf(name) + 1) % BOT_NAMES.length] as BotName;
}

bot1ToggleBtn.addEventListener("click", () => {
  settings = { ...settings, bot1: nextBotName(settings.bot1) };
  saveSettings(settings, localStorage);
  syncBotToggleBtns();
});
bot2ToggleBtn.addEventListener("click", () => {
  settings = { ...settings, bot2: nextBotName(settings.bot2) };
  saveSettings(settings, localStorage);
  syncBotToggleBtns();
});
bot3ToggleBtn.addEventListener("click", () => {
  settings = { ...settings, bot3: nextBotName(settings.bot3) };
  saveSettings(settings, localStorage);
  syncBotToggleBtns();
});

newGameBtn.addEventListener("click", () => showGameScreen());
settingsBtn.addEventListener("click", () => showSettingsScreen({ from: "main" }));
aboutBtn.addEventListener("click", showAboutScreen);

installAppBtn.addEventListener("click", () => {
  installDialogTextEl.textContent = INSTALL_INSTRUCTIONS[installPlatform as "ios" | "android"];
  installDialogEl.showModal();
});
installDialogCloseBtn.addEventListener("click", () => installDialogEl.close());

// specs/params.md's screen debug param picks the initial screen
// directly. Without it, savedState (specs/state.md) picks up wherever
// the player left off. Absent both, any other URL parameter bypasses
// the main screen and starts the game immediately, as it always has —
// the main screen is only shown on a bare visit with no query string
// and no saved state at all. clear=true is the exception: on its own
// it's just asking to wipe saved state (already done above) and land
// back on the main screen, not to start a game — unless it's paired
// with a game-seeding param, in which case that takes over as usual.
const initialScreen: ScreenId =
  debugParams.screen ??
  savedState?.screen ??
  (window.location.search === "" || (debugParams.clear && debugParams.initialDeal === undefined) ? "main" : "game");
switch (initialScreen) {
  case "main":
    showMainScreen();
    break;
  case "settings":
    showSettingsScreen(savedState?.screen === "settings" ? savedState : { from: "main" });
    break;
  case "about":
    showAboutScreen();
    break;
  case "licenses":
    showLicensesScreen();
    break;
  case "htp":
    showHtpScreen();
    break;
  case "over":
    if (savedState?.screen === "over") {
      restoreGameOverScreen(savedState.game);
    } else {
      showDebugGameOverScreen(debugParams);
    }
    break;
  case "error":
    hideAllScreens();
    showErrorScreen(mockError());
    break;
  case "game":
    if (savedState?.screen === "game") {
      showGameScreen(savedState.game);
    } else {
      showGameScreen();
    }
    break;
  case "menu":
    showGameMenuScreen(savedState?.screen === "menu" ? savedState.game : buildDebugMenuGameState(debugParams, settings));
    break;
}
