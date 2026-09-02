// Rumble 31 browser client: the human is seat 0, playing against three
// bots, until the game ends. Mirrors src/main.ts's (the CLI's) flow,
// rendering to the DOM instead of a Writer.

import type { Card } from "../card/card.ts";
import { score } from "../card/score.ts";
import { createBot, snapshotBot, type BotSkillLevel, type BotState } from "../bot/v4/factory.ts";

// The web game is hard-wired to the v4 bot strategies (see
// specs/bots_v4.md's "Bot version" section) -- v3 only runs via the
// simulator's --bot-version=v3 comparison mode. This label is what
// gets logged and what stats are bucketed by (stats.ts's
// byBotVersion), so a future switch to a new strategy generation
// keeps its stats separate from v4's just by using a different label
// here.
const botVersion = "v4";
import { DEAL_ANIMATION_DELAY, DIFFICULTIES, KNOCK_SOUND_WAIT, MAX_BOT_THINK_TIME, MIN_BOT_THINK_TIME, ROUND_END_PAUSE, TAP_FEEDBACK_DELAY, type Difficulty } from "../config.ts";
import { Game, newGame } from "../game/game.ts";
import type { RoundDealOverride } from "../game/round.ts";
import { seatName } from "../game/seat.ts";
import type { Action, Hand, PlayerView, Pot, PublicTurn, Strategy, TurnRecord } from "../game/types.ts";
import { botDecisionLines, gameEndLines, gameStartLines, roundRecapLines, roundStartLines, turnStartLine, turnLines } from "../log.ts";
import { Rng } from "../rng.ts";
import { version } from "../version.ts";
import { buildTime } from "../buildstamp.ts";
import githubMarkUrl from "../../assets/images/github-mark.svg";
import score31SoundUrl from "../../assets/sounds/31.wav";
import score32SoundUrl from "../../assets/sounds/32.wav";
import dealSoundUrl from "../../assets/sounds/deal.wav";
import endOfRoundSoundUrl from "../../assets/sounds/end-of-round.wav";
import knockSoundUrl from "../../assets/sounds/knock.wav";
import loseSoundUrl from "../../assets/sounds/lose.wav";
import slideSoundUrl from "../../assets/sounds/slide.wav";
import turnSoundUrl from "../../assets/sounds/turn.wav";
import winSoundUrl from "../../assets/sounds/win.wav";
import { dealOrder } from "./dealOrder.ts";
import { DomActionPrompt } from "./domActionPrompt.ts";
import { installGlobalErrorHandlers, mockError, showErrorScreen } from "./errorScreen.ts";
import { parseDebugParams, type DebugParams, type ScreenId } from "./params.ts";
import { renderStrikes, setDealer, setKnocker, setPanelState, setScore, setStruck, setWon } from "./panels.ts";
import { loadSettings, saveSettings, type Settings } from "./settings.ts";
import { assignBotSeats, baselineBotSeats, type BotSeats } from "./botAssignment.ts";
import { clearState, loadState, saveState, type GameState, type RoundCheckpoint } from "./state.ts";
import { loadStats, saveStats, seedDebugStats, recordGameStarted, recordGameAbandoned, recordRoundElimination, recordRoundPlayed, recordGamePlace, recordGameCompleted, todayDateString, viewStats, type StatsStore } from "./stats.ts";
import { runStartupMigrations } from "./statsMigration.ts";
import { initStatsTabs, renderStatsScreen, scrollStatsToTop } from "./statsScreen.ts";
import { computeBotResults, renderOverResults, type BotResult } from "./overScreen.ts";
import {
  appendLogLine,
  backEl,
  initCardSheetVars,
  initStrikeBlinkVar,
  logText,
  preloadCardHighlightSheet,
  renderBacks,
  renderCards,
} from "./render.ts";
import { setSuitColor, SUIT_COLORS, type SuitColor } from "./cardSheet.ts";
import { animateCardTrade } from "./tradeAnim.ts";
import { licenses } from "./licensesData.ts";
import { defaultLicense, sortedLicenses } from "./licensesScreen.ts";
import { howToPlayText } from "./howToPlayData.ts";
import { buildDebugMenuGameState } from "./gameMenu.ts";
import { detectPlatform, INSTALL_INSTRUCTIONS } from "./installPrompt.ts";
import { startGamepadInput } from "./gamepadInput.ts";
import { startKeyboardNav } from "./keyboardNav.ts";
import { focusScreenDefault, handleAction, registerCancelFallback, FOCUS_FIRSTS, type FocusFirst } from "./focusNav.ts";
import { handleScrollEvent } from "./scrollNav.ts";
import { SoundEffect, resumeSoundsOnFirstGesture } from "./sound.ts";

// sleep resolves after ms.
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// dealAudio is the sound effect for every dealt card, decoded once and
// played independently per card (sound.ts) so a fast deal's overlapping
// plays never cut each other off.
const dealAudio = new SoundEffect(dealSoundUrl);

// turnAudio is the "it's your turn" notification sound.
const turnAudio = new SoundEffect(turnSoundUrl);

// knockAudio is the sound played when a player knocks.
const knockAudio = new SoundEffect(knockSoundUrl);

// score31Audio/score32Audio/endOfRoundAudio are the round-end sounds
// (specs/assets.md): score31Audio for a round won with 31, score32Audio
// for a round won with 32 (three aces), endOfRoundAudio for any other
// winning score.
const score31Audio = new SoundEffect(score31SoundUrl);
const score32Audio = new SoundEffect(score32SoundUrl);
const endOfRoundAudio = new SoundEffect(endOfRoundSoundUrl);

// slideAudio is the sound played for every card-slide animation leg.
const slideAudio = new SoundEffect(slideSoundUrl);

// winAudio/loseAudio play whenever the Game Over screen is shown, per
// specs/assets.md.
const winAudio = new SoundEffect(winSoundUrl);
const loseAudio = new SoundEffect(loseSoundUrl);

// Registered at module load, unconditionally, rather than only inside
// main() — the Game Over screen can be reached directly via
// specs/params.md's screen=over debug param without main() ever
// running, and its win/lose sound still needs a prior gesture to
// unlock per resumeSoundsOnFirstGesture's own comment.
resumeSoundsOnFirstGesture();

// Registered at module load, once, rather than inside main() — a card
// can be selected on the very first round, so the fetch needs a head
// start regardless of how the game screen was reached.
preloadCardHighlightSheet();

// settings holds the user's persisted preferences (specs/gui.md's
// Settings Screen), loaded once at startup and kept in sync with
// localStorage as the player changes them.
let settings: Settings = loadSettings(localStorage);

// stats holds the gameplay stats (specs/stats.md), loaded once at
// startup and kept in sync with localStorage as games are played,
// abandoned, and won or lost.
let stats: StatsStore = loadStats(localStorage);

// One-time, version-gated corrections (statsMigration.ts) to whatever
// stats were just loaded -- currently just the v6 -> v7 missing-tie
// fix. Persisted immediately so a corrected store never gets
// overwritten by an unmigrated one before the player's next game ends.
if (runStartupMigrations(stats, localStorage, version)) {
  saveStats(stats, localStorage);
}

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

// SettingsOrigin is which screen the Settings screen was entered from
// (specs/gui.md's Settings Screen section): "main" shows the "Main
// Menu" back button; "menu" shows the "Game Menu" back button and
// carries the in-progress game to return to. Purely in-session state
// now -- Settings itself is never persisted (specs/state.md); entered
// from the Game Menu it persists as `menu`, entered from the Main Menu
// as `main`.
type SettingsOrigin = { from: "main" } | { from: "menu"; game: GameState };

// currentSettingsOrigin is which screen Settings was entered from,
// driving its back button's label/destination.
let currentSettingsOrigin: SettingsOrigin = { from: "main" };

// playDealSound plays deal.wav for one card being dealt, unless the
// player has disabled sounds.
function playDealSound(): void {
  if (!settings.soundsEnabled) {
    return;
  }
  dealAudio.play();
}

// playTurnSound plays turn.wav when it becomes the human player's
// (seat 0) turn, unless the player has disabled sounds. Mirrors
// playDealSound above.
function playTurnSound(): void {
  if (!settings.soundsEnabled) {
    return;
  }
  turnAudio.play();
}

// playKnockSound plays knock.wav when a player knocks, unless the
// player has disabled sounds. Mirrors playDealSound above.
function playKnockSound(): void {
  if (!settings.soundsEnabled) {
    return;
  }
  knockAudio.play();
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
  audio.play();
}

// playGameOverSound plays win.wav or lose.wav when the Game Over
// screen is shown, per southWon -- unless the player has disabled
// sounds. Mirrors playDealSound above.
function playGameOverSound(southWon: boolean): void {
  if (!settings.soundsEnabled) {
    return;
  }
  const audio = southWon ? winAudio : loseAudio;
  audio.play();
}

// playSlideSound plays slide.wav when a card-slide animation leg
// starts (tradeAnim.ts's animateCardTrade), unless the player has
// disabled sounds. Mirrors playDealSound above.
function playSlideSound(): void {
  if (!settings.soundsEnabled) {
    return;
  }
  slideAudio.play();
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

// seedStats=true (specs/params.md) replaces botVersion's stats with a
// plausible, fully-populated test dataset and persists it immediately
// -- same as the migration save above, so it survives reload without
// the parameter still present, and is visible in time for the Stats
// screen dispatch below when combined with screen=stats.
if (debugParams.seedStats) {
  seedDebugStats(stats, botVersion);
  saveStats(stats, localStorage);
}

// isBareVisit is true for a plain visit with no query string at all --
// the only kind of visit that resumes saved state (specs/state.md).
const isBareVisit = window.location.search === "";

// specs/state.md: a URL supplying any valid debug parameter clears
// whatever was saved from a previous session first, so debugging never
// resumes a leftover game — including a bare `screen=`, which carries
// no game-seeding data of its own. An invalid parameter throws above,
// before this line, leaving saved state untouched.
if (!isBareVisit) {
  clearState(localStorage);
}

// savedState is only consulted on a bare visit — any debug parameter
// takes precedence, and saved state was just cleared above in that
// case anyway.
const savedState = isBareVisit ? loadState(localStorage) : undefined;

function must<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`missing #${id} in index.html`);
  }
  return el as T;
}

interface SeatEls {
  panel: HTMLElement;
  label: HTMLElement;
  hand: HTMLElement;
  dealer: HTMLElement;
  score: HTMLElement;
  strikes: HTMLElement;
}

const mainScreenEl = must<HTMLElement>("main-screen");
const gameScreenEl = must<HTMLElement>("game-screen");
const menuBtn = must<HTMLButtonElement>("menu-btn");
const newGameBtn = must<HTMLButtonElement>("new-game-btn");
const htpBtn = must<HTMLButtonElement>("htp-btn");
const statsBtn = must<HTMLButtonElement>("stats-btn");
const settingsBtn = must<HTMLButtonElement>("settings-btn");
const aboutBtn = must<HTMLButtonElement>("about-btn");

const difficultyScreenEl = must<HTMLElement>("difficulty-screen");
const difficultyRandomBtn = must<HTMLButtonElement>("difficulty-random-btn");
const difficultyEasyBtn = must<HTMLButtonElement>("difficulty-easy-btn");
const difficultyModerateBtn = must<HTMLButtonElement>("difficulty-moderate-btn");
const difficultyHardBtn = must<HTMLButtonElement>("difficulty-hard-btn");
const difficultyBackBtn = must<HTMLButtonElement>("difficulty-back-btn");

const appinfoScreenEl = must<HTMLElement>("appinfo-screen");
const appinfoInstructionsEl = must<HTMLElement>("appinfo-instructions");
const appinfoProceedBtn = must<HTMLButtonElement>("appinfo-proceed-btn");

// installPlatform is fixed for the life of the page load; standalone
// (already installed/launched from the home screen) is checked via
// both the standard display-mode media query and Safari's older
// navigator.standalone, since iOS Safari doesn't support the former.
// specs/params.md's platform debug parameter overrides the detected
// platform, for exercising the iOS/Android instructions without a
// real device. Both drive the Application Info screen (specs/screens/
// appinfo.md): which instructions it shows, and (via showAppInfo
// below) whether it's shown at all.
const installPlatform = debugParams.platform ?? detectPlatform(navigator.userAgent, navigator.maxTouchPoints);
const isStandaloneApp =
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as unknown as { standalone?: boolean }).standalone === true;

// showAppInfo decides whether the Application Info screen preempts the
// Main Screen (specs/screens/appinfo.md): only on a bare visit
// (matching savedState above) with no saved state at all -- once the
// player proceeds past it, showMainScreen()'s own saveState call means
// savedState is defined on every later visit, so this never fires
// again without saved state being cleared some other way (e.g. a
// debug parameter, which also short-circuits this via the bare-visit
// check).
const showAppInfo = isBareVisit && savedState === undefined && installPlatform !== "other" && !isStandaloneApp;

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

const statsScreenEl = must<HTMLElement>("stats-screen");
const statsCardEl = must<HTMLElement>("stats-card");
const statsMainMenuBtn = must<HTMLButtonElement>("stats-main-menu-btn");

const settingsScreenEl = must<HTMLElement>("settings-screen");
const soundsToggleBtn = must<HTMLButtonElement>("sounds-toggle-btn");
const suitColorToggleBtn = must<HTMLButtonElement>("suit-color-toggle-btn");
const confirmCancelToggleBtn = must<HTMLButtonElement>("confirm-cancel-toggle-btn");
const focusFirstToggleBtn = must<HTMLButtonElement>("focus-first-toggle-btn");
const settingsBackBtn = must<HTMLButtonElement>("settings-back-btn");
const resetBtn = must<HTMLButtonElement>("reset-btn");

const resetDialogEl = must<HTMLDialogElement>("reset-dialog");
const resetYesBtn = must<HTMLButtonElement>("reset-yes-btn");
const resetNoBtn = must<HTMLButtonElement>("reset-no-btn");

const gameOverScreenEl = must<HTMLElement>("game-over-screen");
const gameOverTitleEl = must<HTMLElement>("game-over-title");

const errorScreenEl = must<HTMLElement>("error-screen");
const playAgainBtn = must<HTMLButtonElement>("play-again-btn");
const mainMenuBtn = must<HTMLButtonElement>("main-menu-btn");
const saveLogBtn = must<HTMLButtonElement>("save-log-btn");

const potEl = must<HTMLElement>("pot");
const logEl = must<HTMLElement>("log");
const takePotBtn = must<HTMLButtonElement>("take-pot-btn");
const knockBtn = must<HTMLButtonElement>("knock-btn");
const roundEndBtn = must<HTMLButtonElement>("round-end-btn");

const firstTurnDialogEl = must<HTMLElement>("first-turn-dialog");
const firstTurnPotEl = must<HTMLElement>("first-turn-pot");
const firstTurnHandEl = must<HTMLElement>("first-turn-hand");
const firstTurnActionsEl = must<HTMLElement>("first-turn-actions");

// seatEls[seat] holds the DOM for that seat's panel — indices line up
// with seatName's own South/West/North/East order.
const seatEls: [SeatEls, SeatEls, SeatEls, SeatEls] = [0, 1, 2, 3].map((seat) => {
  const key = seatName(seat).toLowerCase();
  return {
    panel: must<HTMLElement>(`panel-${key}`),
    label: must<HTMLElement>(`seat-label-${key}`),
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
      const action = await inner.decide(v);
      const detail = debugParams.botLogBySeat.get(seat);
      if (detail !== undefined && inner.lastTrace !== undefined) {
        for (const line of botDecisionLines(seat, inner.lastTrace, detail)) {
          appendLogLine(logEl, line);
        }
      }
      return action;
    },
    // Round (src/game/round.ts) calls these on whichever Strategy it's
    // handed -- without forwarding them, a bot wrapped for turn UI
    // would never get onRoundStart/observe at all, and its opponent
    // tracking (specs/bots_v3.md) would silently never run.
    onRoundStart: () => inner.onRoundStart?.(),
    observe: (t: PublicTurn) => inner.observe?.(t),
  };
}

// pauseBetweenRounds swaps the Take Pot/Knock buttons out for
// roundEndBtn -- labeled "Next Round", or "End Game" if gameOver --
// spanning the same width the pair did. It resolves after ms, as soon
// as the player clicks roundEndBtn, or as soon as signal aborts
// (Menu/Abandon mid-pause, specs/gui.md's Game Menu Screen), whichever
// comes first, restoring Take Pot/Knock and hiding roundEndBtn again
// before resolving either way.
function pauseBetweenRounds(ms: number, gameOver: boolean, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    takePotBtn.hidden = true;
    knockBtn.hidden = true;
    roundEndBtn.textContent = gameOver ? "End Game" : "Next Round";
    roundEndBtn.disabled = false;
    roundEndBtn.hidden = false;

    const finish = () => {
      clearTimeout(timer);
      roundEndBtn.removeEventListener("click", onClick);
      signal.removeEventListener("abort", finish);
      roundEndBtn.disabled = true;
      roundEndBtn.hidden = true;
      takePotBtn.hidden = false;
      knockBtn.hidden = false;
      resolve();
    };
    const onClick = () => finish();
    const timer = setTimeout(finish, ms);
    signal.addEventListener("abort", finish);
    roundEndBtn.addEventListener("click", onClick);
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
// case: the pot is still private then (specs/rules.md), to the acting
// seat included, so unlike every other trade/exchange, the cards moving
// pot -> hand were never public to begin with and must stay hidden for
// the entire animation, not just re-concealed on landing -- takenIsSecret
// drives that, regardless of which seat is acting.
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
      const takenIsSecret = rec.turnIndex === 0;
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
// them back out one card at a time per dealOrder() — every seat's
// cards as backs, South's own included, then the pot — pausing
// DEAL_ANIMATION_DELAY between each. Game.playRound awaits onDeal, so
// the round's first turn doesn't begin until this finishes. Per
// specs/gui.md. The pot is private (dealt as card backs) to everyone,
// including the round's first player to act, until that turn resolves.
// southHidden is true when South is that first player to act: South's
// hand stays face-down once dealing finishes too (see below), since
// DomActionPrompt's first-turn dialog (specs/screens/game.md) is where
// it's actually revealed, not the board.
//
// signal aborting mid-animation (Menu/Abandon, specs/gui.md's Game
// Menu Screen) stops the per-card loop outright, not just its sound:
// the seat panels/pot this deals into are the same persistent DOM
// elements a freshly resumed game's own deal will render into, so a
// stale iteration still appending cards after the player has already
// navigated away (and possibly Resumed into a new deal of its own)
// would corrupt what's on screen.
async function animateDeal(roundNum: number, hands: ReadonlyMap<number, Hand>, dealerSeat: number, signal: AbortSignal, southHidden: boolean): Promise<void> {
  const southHand = hands.get(0);
  for (const line of roundStartLines(roundNum, southHand, dealerSeat)) {
    appendLogLine(logEl, line);
  }

  for (let seat = 0; seat < 4; seat++) {
    setWon(seatOf(seat).panel, false);
    setStruck(seatOf(seat).panel, false);
    setKnocker(seatOf(seat).panel, false);
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
    setScore(seatOf(seat).score, null);
  }
  potEl.replaceChildren();

  for (const step of dealOrder(activeSeats)) {
    if (signal.aborted) {
      return;
    }
    const el = backEl();
    el.classList.add("card--deal-in");
    if (step.kind === "hand") {
      seatOf(step.seat).hand.appendChild(el);
    } else {
      potEl.appendChild(el);
    }
    playDealSound();
    await sleep(DEAL_ANIMATION_DELAY);
  }

  // Every hand deals face-down, South's own included; South's hand and
  // score are then revealed immediately once dealing finishes (turn
  // order varies by round, so this doesn't wait for South's first
  // turn) -- unless South is also the round's first turn's own actor,
  // in which case both stay hidden until the first-turn dialog's own
  // decision resolves (see southHidden above). South may already be
  // eliminated and thus never dealt a hand this round.
  if (southHand !== undefined && !southHidden) {
    renderCards(seatOf(0).hand, southHand);
    setScore(seatOf(0).score, score(southHand));
  }
}

// renderDealInstant places round 1's already-dealt hands/pot directly,
// with no per-card animation or sound — used instead of animateDeal
// when specs/params.md's north/south/east/west/pot debug params
// pre-populate the deal, per its "dealing is not animated" note. The
// pot is private (rendered as card backs) to everyone, same as
// animateDeal; southHidden has the same meaning as animateDeal's own.
function renderDealInstant(roundNum: number, pot: Pot, hands: ReadonlyMap<number, Hand>, dealerSeat: number, southHidden: boolean): void {
  const southHand = hands.get(0);
  for (const line of roundStartLines(roundNum, southHand, dealerSeat)) {
    appendLogLine(logEl, line);
  }

  for (let seat = 0; seat < 4; seat++) {
    setWon(seatOf(seat).panel, false);
    setStruck(seatOf(seat).panel, false);
    setKnocker(seatOf(seat).panel, false);
    setPanelState(seatOf(seat).panel, hands.has(seat) ? "none" : "eliminated");
  }

  for (const [seat, hand] of hands) {
    if (seat === 0 && !southHidden) {
      renderCards(seatOf(0).hand, hand);
    } else {
      renderBacks(seatOf(seat).hand, hand.length);
    }
  }
  renderBacks(potEl, pot.length);

  if (southHand !== undefined && !southHidden) {
    setScore(seatOf(0).score, score(southHand));
  }
}

// renderResumedRound places a resumed round's checkpoint hands/pot
// directly, exactly like renderDealInstant, but without logging
// roundStartLines or resetting won/struck/panel state — this isn't a
// new deal (specs/state.md), it's redisplaying a round already in
// progress, whose deal was already logged and whose panel state was
// already restored before the round loop began. potPrivate is true
// only if the checkpoint was taken before the round's first turn
// resolved -- the pot is private to everyone until then, regardless of
// who acts first. southHidden has the same meaning as animateDeal's
// own, additionally scoped to potPrivate: once the first turn has
// resolved, South's hand is never hidden regardless of who acted first.
function renderResumedRound(pot: Pot, hands: ReadonlyMap<number, Hand>, potPrivate: boolean, southHidden: boolean): void {
  const southHand = hands.get(0);
  for (const [seat, hand] of hands) {
    if (seat === 0 && !southHidden) {
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

  if (southHand !== undefined && !southHidden) {
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
// by logLines, for resuming a game per specs/state.md.
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
  setSuitColor(settings.suitColor);

  const seed = Date.now();
  const human = new DomActionPrompt(
    potEl,
    seatEls[0].hand,
    seatEls[0].score,
    takePotBtn,
    knockBtn,
    firstTurnDialogEl,
    firstTurnPotEl,
    firstTurnHandEl,
    firstTurnActionsEl,
    () => settings.focusFirst,
    signal,
  );
  const botRng = new Rng(seed);
  // A resumed game keeps the bot/seat pairing it started with instead
  // of reshuffling (specs/state.md); a brand new game shuffles the
  // three settings-configured bots across the three bot seats
  // (specs/bots_v3.md).
  const botSeats: BotSeats = resume ? resume.botSeats : assignBotSeats(settings, botRng);
  // showBots (specs/params.md) appends each bot seat's skill level
  // initial to its seat label; botSeats[0..2] line up with seats 1-3
  // (West, North, East) per assignBotSeats. South is always human, so
  // its label is untouched.
  seatOf(1).label.textContent = "West" + (params.showBots ? ` (${BOT_INITIALS[botSeats[0]]})` : "");
  seatOf(2).label.textContent = "North" + (params.showBots ? ` (${BOT_INITIALS[botSeats[1]]})` : "");
  seatOf(3).label.textContent = "East" + (params.showBots ? ` (${BOT_INITIALS[botSeats[2]]})` : "");
  // savedState carries each bot seat's round-scoped Knock bookkeeping
  // forward from the resumed round's checkpoint (specs/state.md), if
  // any, so rebuilding the bots below doesn't reset it to blank.
  const savedState = new Map<number, BotState>(resume?.checkpoint?.botState ?? []);
  // bots holds the three bot seats' raw strategies (unwrapped by
  // withTurnUi below) so their state can be snapshotted for the
  // checkpoint as the round progresses.
  const bots: [Strategy, Strategy, Strategy] = [
    createBot(botSeats[0], botRng, savedState.get(1), debugParams.botLogBySeat.get(1)),
    createBot(botSeats[1], botRng, savedState.get(2), debugParams.botLogBySeat.get(2)),
    createBot(botSeats[2], botRng, savedState.get(3), debugParams.botLogBySeat.get(3)),
  ];
  const strategies: [Strategy, Strategy, Strategy, Strategy] = [
    withTurnUi(0, human, signal),
    withTurnUi(1, bots[0], signal),
    withTurnUi(2, bots[1], signal),
    withTurnUi(3, bots[2], signal),
  ];
  // botStateCheckpoint snapshots every bot seat's current round-scoped
  // Knock bookkeeping, keyed by seat, for RoundCheckpoint.botState.
  const botStateCheckpoint = (): Array<[number, BotState]> => [
    [1, snapshotBot(bots[0])],
    [2, snapshotBot(bots[1])],
    [3, snapshotBot(bots[2])],
  ];

  const g = resume
    ? new Game({
        strategies,
        strikes: resume.strikes,
        eliminated: resume.eliminated,
        secondChance: resume.secondChance,
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
    setKnocker(seatOf(seat).panel, false);
    setPanelState(seatOf(seat).panel, g.eliminated[seat] ? "eliminated" : "none");
    setScore(seatOf(seat).score, null);
    renderStrikes(seatOf(seat).strikes, g.strikes[seat] as number, g.secondChance[seat] as boolean);
    seatOf(seat).hand.replaceChildren();
  }
  potEl.replaceChildren();

  if (!resume) {
    for (const line of gameStartLines(seed, version, botVersion, DIFFICULTY_LABELS[settings.difficulty])) {
      appendLogLine(logEl, line);
    }
    recordGameStarted(stats, botVersion);
    saveStats(stats, localStorage);
  }

  const startRoundNum = resume?.roundNum ?? 1;

  saveGameState({ strikes: g.strikes, eliminated: g.eliminated, secondChance: g.secondChance, roundNum: startRoundNum, dealerSeat: g.dealerSeat as number, botSeats, checkpoint: undefined, log: logLines() });

  // Set once the game ends (inside the loop below, where the final
  // round's outcome is in scope) and read after the loop exits, by
  // the closing showGameOverScreen call.
  let botResults: [BotResult, BotResult, BotResult] | undefined;
  let southWonOutright = false;
  let southPlace: 1 | 2 | 3 | 4 = 1;

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
        renderResumedRound(pot, hands, resume.checkpoint.turnIndex === 0, firstSeat === 0 && resume.checkpoint.turnIndex === 0);
      } else if (roundNum === startRoundNum && params.skipDealAnimation) {
        renderDealInstant(roundNum, pot, hands, g.dealerSeat as number, firstSeat === 0);
      } else {
        await animateDeal(roundNum, hands, g.dealerSeat as number, signal, firstSeat === 0);
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
        setKnocker(seatOf(roundKnockerSeat).panel, true);
      }
      saveGameState({
        strikes: g.strikes,
        eliminated: g.eliminated,
        secondChance: g.secondChance,
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
          botState: botStateCheckpoint(),
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
        setKnocker(seatOf(rec.seat).panel, true);
      }
      const active = [...hands.keys()].sort((a, b) => a - b);
      const nextSeat = active[(active.indexOf(rec.seat) + 1) % active.length] as number;

      saveGameState({
        strikes: g.strikes,
        eliminated: g.eliminated,
        secondChance: g.secondChance,
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
          botState: botStateCheckpoint(),
        },
        log: logLines(),
      });
    };

    // Captured before playRound() mutates g.eliminated -- if this round
    // ends up eliminating South, this is how many seats (including
    // South) were still active going into it, i.e. South's placement
    // (specs/log.md) if the game ends here.
    const activeSeatsBeforeRound = g.eliminated.filter((e) => !e).length;
    // eliminatedBeforeRound is the fuller, per-seat form of the above,
    // needed by recordRoundElimination (specs/stats.md) to tell a bot
    // newly eliminated this round from one already gone.
    const eliminatedBeforeRound = [...g.eliminated];

    const outcome = await g.playRound();

    if (signal.aborted) {
      return;
    }

    // If the last remaining contenders (South included -- see
    // southWonOutright below) all reached their threshold together,
    // applyResult reports eliminated: [] to keep the game engine's own
    // state intact (game.ts's "co-winners" comment), but specs/stats.md
    // still credits the human with a tie against each of those bots --
    // so recordRoundElimination needs the tied seats explicitly here,
    // since outcome.eliminated alone won't show them.
    const tiedFinish = !g.active() && g.winners().length > 1;
    recordRoundElimination(stats, botVersion, settings.difficulty, botSeats, eliminatedBeforeRound, tiedFinish ? g.winners() : outcome.eliminated);
    const southBest = outcome.result.winners.includes(0);
    const southScore = outcome.result.players.find((pr) => pr.seat === 0)?.score;
    recordRoundPlayed(stats, botVersion, settings.difficulty, southBest, southScore);
    saveStats(stats, localStorage);

    // The round's over, so nobody's "on turn" or "knocked" anymore —
    // clear both before applying this round's win/strike highlights, or
    // whoever last acted/knocked would keep that tag through the pause.
    for (let seat = 0; seat < 4; seat++) {
      setPanelState(seatOf(seat).panel, g.eliminated[seat] ? "eliminated" : "none");
      setKnocker(seatOf(seat).panel, false);
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
      setPanelState(seatOf(seat).panel, "winner");
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
      // seat that survives the strike, including one in
      // secondChanceGranted, which just reached three strikes and was
      // granted its one-time reprieve instead of being eliminated
      // (specs/rules.md) — same red highlight and tag as a plain
      // strike.
      if (!g.eliminated[seat]) {
        setPanelState(seatOf(seat).panel, "strike");
      }
    }
    for (let seat = 0; seat < 4; seat++) {
      renderStrikes(seatOf(seat).strikes, g.strikes[seat] as number, g.secondChance[seat] as boolean);
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
      // The Game Over screen isn't resumable (specs/state.md), so the
      // in-progress "game" checkpoint is replaced here, before the
      // pause, with the plain "main" marker: a reload during or after
      // the pause lands on the Main Screen rather than resuming a
      // finished round (which would call playRound() again and
      // double-apply its strikes).
      // More than one winner means the last contenders were eliminated
      // together (game.ts) -- a tie, not an outright win, so per
      // specs/log.md it's placed as if South alone had been eliminated
      // rather than credited with first.
      southWonOutright = g.winners().length === 1 && g.winners().includes(0);
      southPlace = (southWonOutright ? 1 : activeSeatsBeforeRound) as 1 | 2 | 3 | 4;
      for (const line of gameEndLines(southPlace, botSeats.map((n) => BOT_LABELS[n]))) {
        appendLogLine(logEl, line);
      }
      recordGamePlace(stats, botVersion, settings.difficulty, southPlace, todayDateString());
      recordGameCompleted(stats, botVersion, settings.difficulty, southWonOutright, g.strikes[0] as number);
      saveStats(stats, localStorage);
      botResults = computeBotResults(g.eliminated, outcome.eliminated);
      saveState({ screen: "main" }, localStorage);
    } else {
      saveGameState({ strikes: g.strikes, eliminated: g.eliminated, secondChance: g.secondChance, roundNum: roundNum + 1, dealerSeat: g.dealerSeat as number, botSeats, checkpoint: undefined, log: logLines() });
    }

    await pauseBetweenRounds(ROUND_END_PAUSE, gameOver, signal);

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

  const botLabels = botSeats.map((n) => BOT_LABELS[n]) as [string, string, string];
  showGameOverScreen(southWonOutright, southPlace, botResults as [BotResult, BotResult, BotResult], botLabels);
}

// hideAllScreens hides every top-level screen. Each show*Screen
// function below calls this first, then reveals just its own element
// — so any screen is safe to enter directly (e.g. via
// specs/params.md's screen debug param) regardless of which screen,
// if any, was already showing.
// onTap wraps a screen-swapping click handler so the swap itself
// waits TAP_FEEDBACK_DELAY (specs/gui.md's Mobile section) before
// running, giving the tapped button's pressed-down CSS feedback
// (style.css) a chance to paint first.
function onTap(action: () => void): () => void {
  return () => setTimeout(action, TAP_FEEDBACK_DELAY);
}

function hideAllScreens(): void {
  mainScreenEl.hidden = true;
  difficultyScreenEl.hidden = true;
  appinfoScreenEl.hidden = true;
  gameScreenEl.hidden = true;
  menuScreenEl.hidden = true;
  aboutScreenEl.hidden = true;
  licensesScreenEl.hidden = true;
  htpScreenEl.hidden = true;
  statsScreenEl.hidden = true;
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
  dealAudio.stop();
  turnAudio.stop();
  knockAudio.stop();
  score31Audio.stop();
  score32Audio.stop();
  endOfRoundAudio.stop();
  slideAudio.stop();
  winAudio.stop();
  loseAudio.stop();
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

// showAppInfoScreen swaps whichever screen is up for the Application
// Info screen (specs/screens/appinfo.md), filling in the install
// instructions for installPlatform (blank for "other" -- only reachable
// via the screen=appinfo debug parameter with no platform override).
// Never persisted -- see showAppInfo's own comment above for why.
function showAppInfoScreen(): void {
  appinfoInstructionsEl.textContent = installPlatform === "other" ? "" : INSTALL_INSTRUCTIONS[installPlatform];
  hideAllScreens();
  appinfoScreenEl.hidden = false;
  focusScreenDefault();
}

// showMainScreen swaps whichever screen is up for the main screen (per
// specs/gui.md's Game Over Screen, About Screen, and Settings Screen
// sections' "Main Menu" buttons), and persists it as the screen to
// resume (specs/state.md).
function showMainScreen(): void {
  hideAllScreens();
  mainScreenEl.hidden = false;
  saveState({ screen: "main" }, localStorage);
  focusScreenDefault();
}

// syncSoundsToggleBtn sets the sounds toggle button's label to match
// settings.soundsEnabled (per specs/gui.md's Settings Screen section).
function syncSoundsToggleBtn(): void {
  soundsToggleBtn.textContent = settings.soundsEnabled ? "Enabled" : "Disabled";
}

// syncConfirmCancelToggleBtn sets the confirm/cancel toggle button's
// label to match settings.swapConfirmCancel (specs/controller.md's
// Settings toggle).
function syncConfirmCancelToggleBtn(): void {
  confirmCancelToggleBtn.textContent = settings.swapConfirmCancel ? "Swapped" : "Standard";
}

// BOT_LABELS maps a BotSkillLevel to its game-log label (specs/log.md:
// "Novice", "Advanced", "Expert").
const BOT_LABELS: Record<BotSkillLevel, string> = { novice: "Novice", advanced: "Advanced", expert: "Expert" };

// BOT_INITIALS maps a BotSkillLevel to the seat-label suffix shown by
// the showBots debug parameter (specs/params.md).
const BOT_INITIALS: Record<BotSkillLevel, string> = { novice: "N", advanced: "A", expert: "E" };

// DIFFICULTY_LABELS maps a Difficulty to its display label -- the
// game-log start line (specs/log.md, specs/screens/difficulty.md:
// "Easy", "Moderate", "Hard") and the Game Over screen's rank badge
// (specs/screens/over.md).
const DIFFICULTY_LABELS: Record<Difficulty, string> = { easy: "Easy", moderate: "Moderate", hard: "Hard" };

// SUIT_COLOR_LABELS maps a SuitColor to its Settings Screen button
// label (specs/screens/settings.md: "Four", "Two").
const SUIT_COLOR_LABELS: Record<SuitColor, string> = { four: "Four", two: "Two" };

// syncSuitColorToggleBtn sets the suit color toggle button's label to
// match settings.suitColor.
function syncSuitColorToggleBtn(): void {
  suitColorToggleBtn.textContent = SUIT_COLOR_LABELS[settings.suitColor];
}

// FOCUS_FIRST_LABELS maps a FocusFirst to its Settings Screen button
// label (specs/screens/settings.md: "Pot", "Hand").
const FOCUS_FIRST_LABELS: Record<FocusFirst, string> = { pot: "Pot", hand: "Hand" };

// syncFocusFirstToggleBtn sets the focus first toggle button's label to
// match settings.focusFirst.
function syncFocusFirstToggleBtn(): void {
  focusFirstToggleBtn.textContent = FOCUS_FIRST_LABELS[settings.focusFirst];
}

// showStatsScreen swaps whichever screen is up for the stats screen
// (per specs/screens/stats.md, reached from the Main Screen's "Stats"
// button), rendering the current bot version's stats (stats.ts's
// viewStats -- a read-only lookup, so just viewing this screen never
// creates or saves a stats entry) and scrolling back to the top of
// whichever tab was last active. Not a resumable screen (specs/
// state.md): it persists the plain "main" marker, so a reload lands on
// the Main Screen.
function showStatsScreen(): void {
  scrollStatsToTop(statsCardEl);
  renderStatsScreen(statsScreenEl, viewStats(stats, botVersion));
  hideAllScreens();
  statsScreenEl.hidden = false;
  saveState({ screen: "main" }, localStorage);
  focusScreenDefault();
}

// showSettingsScreen swaps whichever screen is up for the settings
// screen (per specs/gui.md's Main Screen and Game Menu Screen
// sections' "Settings" buttons). Settings itself isn't a resumable
// screen (specs/state.md): entered from the Game Menu it persists as
// `menu` (the game paused behind it), so a reload returns to the Game
// Menu; entered from the Main Menu it persists the plain "main"
// marker. Entered from the Game Menu, the back button reads "Game
// Menu" instead of "Main Menu" (wired below, alongside the other
// menu/settings listeners).
function showSettingsScreen(origin: SettingsOrigin): void {
  currentSettingsOrigin = origin;
  syncSoundsToggleBtn();
  syncSuitColorToggleBtn();
  syncConfirmCancelToggleBtn();
  syncFocusFirstToggleBtn();
  const fromMenu = origin.from === "menu";
  settingsBackBtn.textContent = fromMenu ? "Game Menu" : "Main Menu";
  hideAllScreens();
  settingsScreenEl.hidden = false;
  saveState(fromMenu ? { screen: "menu", game: origin.game } : { screen: "main" }, localStorage);
  focusScreenDefault();
}

// showDifficultyScreen swaps whichever screen is up for the
// difficulty screen (per specs/gui.md's Main Screen section's "New
// Game" button). Not a resumable screen (specs/state.md): it persists
// the plain "main" marker, so a reload lands on the Main Screen (the
// chosen difficulty persists separately in Settings).
function showDifficultyScreen(): void {
  hideAllScreens();
  difficultyScreenEl.hidden = false;
  saveState({ screen: "main" }, localStorage);
  focusScreenDefault();
}

// showAboutScreen swaps whichever screen is up for the about screen
// (per specs/gui.md's Main Screen section's "About" button), filling
// in the version/build-date text it displays. Not a resumable screen
// (specs/state.md): it persists the plain "main" marker, so a reload
// lands on the Main Screen.
function showAboutScreen(): void {
  aboutVersionEl.textContent = `Version ${version}`;
  aboutBuildEl.textContent = `Built on ${buildTime}`;
  hideAllScreens();
  aboutScreenEl.hidden = false;
  saveState({ screen: "main" }, localStorage);
  focusScreenDefault();
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
// "Rumble 31" entry selected by default (specs/gui.md's Licenses
// section). Not a resumable screen (specs/state.md): it persists the
// plain "main" marker, so a reload lands on the Main Screen.
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
  saveState({ screen: "main" }, localStorage);
  focusScreenDefault();
}

// showHtpScreen swaps whichever screen is up for the How to Play
// screen (per specs/gui.md's How to Play section), populating the
// text area with how-to-play.md's contents (baked in at build time by
// scripts/gen-how-to-play.mjs). Not a resumable screen (specs/
// state.md): it persists the plain "main" marker, so a reload lands on
// the Main Screen.
function showHtpScreen(): void {
  htpTextEl.value = howToPlayText;
  hideAllScreens();
  htpScreenEl.hidden = false;
  saveState({ screen: "main" }, localStorage);
  focusScreenDefault();
}

// showGameOverScreen swaps whichever screen is up for the game-over
// screen, announcing South's win or loss per specs/gui.md's Game Over
// Screen section: "You Won!"/"Game Over", one word per line, the rank
// badge, and the results table and Win/Loss/Tie tally (overScreen.ts's
// renderOverResults) below it, and plays win.wav/lose.wav per
// specs/assets.md. The screen is only ever reached on arrival now -- a
// live game finishing, or specs/params.md's screen=over debug param --
// never restored from saved state (specs/state.md), so the sound
// always plays.
function showGameOverScreen(southWon: boolean, southPlace: 1 | 2 | 3 | 4, botResults: [BotResult, BotResult, BotResult], botLabels: [string, string, string]): void {
  gameOverTitleEl.textContent = southWon ? "You Won!" : "Game Over";
  renderOverResults(gameOverScreenEl, southPlace, botResults, botLabels, DIFFICULTY_LABELS[settings.difficulty]);
  hideAllScreens();
  gameOverScreenEl.hidden = false;
  playGameOverSound(southWon);
  focusScreenDefault();
}

// showDebugGameOverScreen reaches the game-over screen directly via
// specs/params.md's screen=over debug param, with no game actually
// played. Per that spec, the win/loss message defaults to whether
// South (seat 0) already starts eliminated per the strikes param.
// There's no real round history behind a debug state, so
// computeBotResults' elimination-order tiebreak can't be answered
// honestly -- when South is eliminated, every other already-
// eliminated seat is passed as though it went out in the same round
// as South, reading as a Tie rather than guessing an order that was
// never actually played. southPlace follows the same simplification:
// South wins outright places First, otherwise place is 1 plus however
// many bots read as a Loss (i.e. survived), rather than the real
// game's activeSeatsBeforeRound (specs/log.md's tie rule), which has
// no debug-mode equivalent since no round was actually played.
function showDebugGameOverScreen(params: DebugParams): void {
  const { eliminated } = params.initialStrikes;
  const southWon = !eliminated[0];
  const finalRoundEliminated = southWon ? [] : [0, 1, 2, 3].filter((seat) => eliminated[seat]);
  const botResults = computeBotResults(eliminated, finalRoundEliminated);
  const southPlace = (southWon ? 1 : 1 + botResults.filter((r) => r === "loss").length) as 1 | 2 | 3 | 4;
  const botSeats = baselineBotSeats(settings.difficulty);
  const botLabels = botSeats.map((n) => BOT_LABELS[n]) as [string, string, string];
  showGameOverScreen(southWon, southPlace, botResults, botLabels);
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

// logFilename names a saved log rumble31-<TIMESTAMP>.txt per
// specs/log.md, TIMESTAMP being now's local time as YYMMDD-HHmm, e.g.
// rumble31-260816-2039.txt.
function logFilename(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const yy = pad(now.getFullYear() % 100);
  const mm = pad(now.getMonth() + 1);
  const dd = pad(now.getDate());
  const hh = pad(now.getHours());
  const mi = pad(now.getMinutes());
  return `rumble31-${yy}${mm}${dd}-${hh}${mi}.txt`;
}

// Play Again reuses the difficulty just played (specs/screens/
// over.md), except when it was picked by the Difficulty screen's
// "Random" button (specs/screens/difficulty.md), in which case each
// Play Again re-rolls a fresh random difficulty.
playAgainBtn.addEventListener(
  "click",
  onTap(() => {
    if (settings.difficultyIsRandom) {
      settings = { ...settings, difficulty: randomDifficulty() };
      saveSettings(settings, localStorage);
    }
    showGameScreen();
  }),
);
mainMenuBtn.addEventListener("click", onTap(showMainScreen));
aboutMainMenuBtn.addEventListener("click", onTap(showMainScreen));
licensesMainMenuBtn.addEventListener("click", onTap(showMainScreen));
licensesBtn.addEventListener("click", onTap(showLicensesScreen));
htpMainMenuBtn.addEventListener("click", onTap(showMainScreen));
statsBtn.addEventListener("click", onTap(showStatsScreen));
statsMainMenuBtn.addEventListener("click", onTap(showMainScreen));
initStatsTabs(statsScreenEl, statsCardEl);
htpBtn.addEventListener("click", onTap(showHtpScreen));

// settingsBackBtn returns to wherever Settings was entered from
// (specs/gui.md's Settings Screen section): the Main screen, or --
// entered via the Game Menu -- that same Game Menu screen, with the
// game it was showing carried back along with it.
settingsBackBtn.addEventListener(
  "click",
  onTap(() => {
    if (currentSettingsOrigin.from === "menu") {
      showGameMenuScreen(currentSettingsOrigin.game);
    } else {
      showMainScreen();
    }
  }),
);

// menuBtn opens the Game Menu screen (specs/gui.md's Game Screen
// section); Escape and a gamepad's cancel button do the same, routed
// through focusNav.ts's cancel fallback below, which only opens it
// while the Game screen is actually showing, so it's a no-op
// everywhere else (including while the Abandon confirmation dialog,
// only reachable from the Game Menu, is open -- the game screen is
// already hidden by then, and a dialog open takes cancel priority
// over this fallback regardless -- see focusNav.ts's cancel()).
menuBtn.addEventListener("click", onTap(openGameMenu));

// registerCancelFallback/startKeyboardNav/startGamepadInput wire up
// specs/controller.md's keyboard/gamepad navigation: both input
// sources report the same NavAction vocabulary to focusNav.ts, which
// moves/activates focus and, on cancel with no dialog open, calls this
// fallback -- the Escape-opens-Game-Menu behavior described above.
// The gamepad's left stick and L1/R1 bumpers additionally report
// ScrollEvents to scrollNav.ts, scrolling whichever screen's log/text
// panel is currently visible.
registerCancelFallback(() => {
  if (!gameScreenEl.hidden) {
    openGameMenu();
  }
});
startKeyboardNav(handleAction);
startGamepadInput(handleAction, () => settings.swapConfirmCancel, handleScrollEvent);

menuResumeBtn.addEventListener("click", onTap(() => showGameScreen(currentMenuGame)));
menuSettingsBtn.addEventListener("click", onTap(() => showSettingsScreen({ from: "menu", game: currentMenuGame as GameState })));
menuAbandonBtn.addEventListener("click", () => abandonDialogEl.showModal());

// A native <dialog>'s own Escape-to-cancel behavior already dismisses
// it like "No" with no extra wiring needed here.
abandonNoBtn.addEventListener("click", () => abandonDialogEl.close());
abandonYesBtn.addEventListener("click", () => {
  // specs/stats.md: abandoning scores exactly like South being
  // eliminated right now, against whichever bots are still active.
  const game = currentMenuGame as GameState;
  const place = game.eliminated.filter((e) => !e).length as 1 | 2 | 3 | 4;
  recordRoundElimination(stats, botVersion, settings.difficulty, game.botSeats, game.eliminated, [0]);
  recordGameAbandoned(stats, botVersion);
  recordGamePlace(stats, botVersion, settings.difficulty, place, todayDateString());
  saveStats(stats, localStorage);

  abortCurrentGame();
  clearState(localStorage);
  abandonDialogEl.close();
  showMainScreen();
});

resetBtn.addEventListener("click", () => resetDialogEl.showModal());
resetNoBtn.addEventListener("click", () => resetDialogEl.close());
resetYesBtn.addEventListener("click", () => {
  localStorage.clear();
  window.location.reload();
});
licensesListEl.addEventListener("change", syncLicenseText);
// savedLogText excludes bot decision-log lines (specs/bots_v4.md's
// Decision Logging) from the Save Log file (specs/log.md), since
// they're a debugging aid, not part of the player-facing game log.
function savedLogText(): string {
  return logLines()
    .filter((line) => !line.startsWith("[bot] "))
    .join("\n");
}

saveLogBtn.addEventListener("click", () => downloadTextFile(logFilename(new Date()), savedLogText()));
soundsToggleBtn.addEventListener("click", () => {
  settings = { ...settings, soundsEnabled: !settings.soundsEnabled };
  saveSettings(settings, localStorage);
  syncSoundsToggleBtn();
});
confirmCancelToggleBtn.addEventListener("click", () => {
  settings = { ...settings, swapConfirmCancel: !settings.swapConfirmCancel };
  saveSettings(settings, localStorage);
  syncConfirmCancelToggleBtn();
});

// randomDifficulty picks one of DIFFICULTIES with equal probability
// (specs/screens/difficulty.md's "Random" button).
function randomDifficulty(): Difficulty {
  return DIFFICULTIES[Math.floor(Math.random() * DIFFICULTIES.length)] as Difficulty;
}

// startNewGame sets difficulty (and whether it was picked by
// "Random") as the persisted Settings (specs/screens/difficulty.md)
// and starts a new game at it immediately.
function startNewGame(difficulty: Difficulty, isRandom: boolean): void {
  settings = { ...settings, difficulty, difficultyIsRandom: isRandom };
  saveSettings(settings, localStorage);
  showGameScreen();
}

difficultyRandomBtn.addEventListener("click", onTap(() => startNewGame(randomDifficulty(), true)));
difficultyEasyBtn.addEventListener("click", onTap(() => startNewGame("easy", false)));
difficultyModerateBtn.addEventListener("click", onTap(() => startNewGame("moderate", false)));
difficultyHardBtn.addEventListener("click", onTap(() => startNewGame("hard", false)));
difficultyBackBtn.addEventListener("click", onTap(showMainScreen));

// nextSuitColor cycles a SuitColor through SUIT_COLORS's order
// (specs/screens/settings.md: "Four", "Two").
function nextSuitColor(suitColor: SuitColor): SuitColor {
  return SUIT_COLORS[(SUIT_COLORS.indexOf(suitColor) + 1) % SUIT_COLORS.length] as SuitColor;
}

suitColorToggleBtn.addEventListener("click", () => {
  settings = { ...settings, suitColor: nextSuitColor(settings.suitColor) };
  saveSettings(settings, localStorage);
  syncSuitColorToggleBtn();
});

// nextFocusFirst cycles a FocusFirst through FOCUS_FIRSTS's order
// (specs/screens/settings.md: "Pot", "Hand").
function nextFocusFirst(focusFirst: FocusFirst): FocusFirst {
  return FOCUS_FIRSTS[(FOCUS_FIRSTS.indexOf(focusFirst) + 1) % FOCUS_FIRSTS.length] as FocusFirst;
}

focusFirstToggleBtn.addEventListener("click", () => {
  settings = { ...settings, focusFirst: nextFocusFirst(settings.focusFirst) };
  saveSettings(settings, localStorage);
  syncFocusFirstToggleBtn();
});

newGameBtn.addEventListener("click", onTap(() => showDifficultyScreen()));
settingsBtn.addEventListener("click", onTap(() => showSettingsScreen({ from: "main" })));
aboutBtn.addEventListener("click", onTap(showAboutScreen));

appinfoProceedBtn.addEventListener("click", onTap(showMainScreen));

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
  (showAppInfo ? "appinfo" : undefined) ??
  // Only `game` and `menu` resume (specs/state.md); every other saved
  // screen -- including the plain "main" marker -- lands on the Main
  // Screen.
  (savedState?.screen === "game" || savedState?.screen === "menu" ? savedState.screen : undefined) ??
  (isBareVisit || (debugParams.clear && debugParams.initialDeal === undefined) ? "main" : "game");
switch (initialScreen) {
  case "main":
    showMainScreen();
    break;
  case "difficulty":
    showDifficultyScreen();
    break;
  case "appinfo":
    showAppInfoScreen();
    break;
  case "settings":
    showSettingsScreen({ from: "main" });
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
  case "stats":
    showStatsScreen();
    break;
  case "over":
    showDebugGameOverScreen(debugParams);
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
