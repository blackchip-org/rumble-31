// Persisted app/game state (specs/state.md), stored as a single
// versioned JSON blob in a Storage (localStorage in the browser) —
// mirrors settings.ts's own load/save pattern, but for which screen
// the player is on and how far into a game they've gotten, rather
// than their preferences.

import type { BotSeats } from "./botAssignment.ts";
import type { BotMemory } from "../bot/factory.ts";
import type { Hand, Pot } from "../game/types.ts";
import type { BotResult } from "./overScreen.ts";

const STORAGE_KEY = "rumble31.state";
// Bumped to 8 when OverState gained botResults (specs/state.md's Game
// Over results table) — an old save is simply treated as absent (see
// loadState), no migration needed.
const SCHEMA_VERSION = 8;

// STATE_SCREEN_IDS are every screen this module ever records — every
// screen in specs/gui.md except the error screen, which is never
// persisted (specs/state.md's "Error screen" section).
const STATE_SCREEN_IDS = ["main", "difficulty", "settings", "about", "licenses", "htp", "stats", "game", "over", "menu"] as const;
export type StateScreenId = (typeof STATE_SCREEN_IDS)[number];

// RoundCheckpoint captures a round already in progress, enough to
// resume it exactly where it left off via RoundDealOverride
// (src/game/round.ts): every active seat's current hand, the current
// pot, which seat acts next, and whether the round's first-turn/
// knocked rules (specs/rules.md) still need to be honored going
// forward.
export interface RoundCheckpoint {
  hands: Array<[number, Hand]>;
  pot: Pot;
  firstSeat: number;
  turnIndex: number;
  knocked: boolean;
  knockerSeat: number;
  // botMemory[i] is [seat, memory] for one of the three bot seats: what
  // that bot has tracked about its opponents so far this round
  // (specs/bots.md), so a reload doesn't reset it back to blank.
  botMemory: Array<[number, BotMemory]>;
}

// GameState is what's needed to resume the Game screen: every seat's
// strikes/elimination, which round it is, the log so far, and (if a
// round is currently in progress rather than between rounds) that
// round's checkpoint.
export interface GameState {
  strikes: [number, number, number, number];
  eliminated: [boolean, boolean, boolean, boolean];
  // secondChance marks seats already granted the one-time-per-game
  // second chance (specs/rules.md).
  secondChance: [boolean, boolean, boolean, boolean];
  roundNum: number;
  dealerSeat: number;
  // botSeats[i] is the skill level seated at seat i+1 (specs/bots.md),
  // fixed for the life of the game so resuming it doesn't reshuffle
  // which bot sits where.
  botSeats: BotSeats;
  log: string[];
  checkpoint?: RoundCheckpoint;
}

// OverState is what's needed to redraw the Game Over screen without
// replaying anything: the final win/loss outcome, plus the same
// fields as GameState so Save Log still works from that screen.
export interface OverState extends GameState {
  southWon: boolean;
  // botResults[i] is South's Win/Loss/Tie result against botSeats[i]
  // (West/North/East), computed once at game-end time
  // (overScreen.ts's computeBotResults) so the Over screen never has
  // to recompute it, including on a restored/reloaded screen.
  botResults: [BotResult, BotResult, BotResult];
}

// SettingsOrigin is which screen the Settings screen was entered from
// (specs/gui.md): "main" shows the "Main Menu" back button; "menu"
// shows the "Game Menu" back button, carrying the in-progress game to
// return to.
export type SettingsOrigin = { from: "main" } | { from: "menu"; game: GameState };

export type PersistedState =
  | { screen: "main" }
  | { screen: "difficulty" }
  | ({ screen: "settings" } & SettingsOrigin)
  | { screen: "about" }
  | { screen: "licenses" }
  | { screen: "htp" }
  | { screen: "stats" }
  | { screen: "game"; game: GameState }
  | { screen: "over"; game: OverState }
  // Entering the Game Menu re-saves the most recently persisted `game`
  // state under this tag rather than creating new game state — see
  // specs/state.md.
  | { screen: "menu"; game: GameState };

// SavedState is PersistedState as it comes back out of loadState: with
// savedAt, the epoch-millisecond time it was written, stamped on by
// saveState itself rather than supplied by callers. Used by main.ts to
// decide whether a saved Over screen is too stale to restore (see
// specs/state.md).
export type SavedState = PersistedState & { savedAt: number };

// loadState reads SavedState from storage, returning undefined if
// nothing is stored, what's stored isn't valid JSON, its schema
// version doesn't match, or its screen isn't recognized.
export function loadState(storage: Storage): SavedState | undefined {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === null) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return undefined;
    }
    const { version, state } = parsed as { version?: unknown; state?: unknown };
    if (version !== SCHEMA_VERSION || typeof state !== "object" || state === null) {
      return undefined;
    }
    const screen = (state as { screen?: unknown }).screen;
    if (typeof screen !== "string" || !(STATE_SCREEN_IDS as readonly string[]).includes(screen)) {
      return undefined;
    }
    return state as SavedState;
  } catch {
    return undefined;
  }
}

// saveState writes state to storage as JSON, tagged with the current
// schema version and the current time (overridable via now, mirroring
// src/sim/cliParams.ts's own clock injection, for tests).
export function saveState(state: PersistedState, storage: Storage, now: () => number = Date.now): void {
  const savedState: SavedState = { ...state, savedAt: now() };
  storage.setItem(STORAGE_KEY, JSON.stringify({ version: SCHEMA_VERSION, state: savedState }));
}

// clearState removes any saved state — per specs/state.md, called
// whenever the URL supplies valid debug parameters, so debugging never
// resumes a leftover session.
export function clearState(storage: Storage): void {
  storage.removeItem(STORAGE_KEY);
}
