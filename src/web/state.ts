// Persisted app/game state (specs/state.md), stored as a single
// versioned JSON blob in a Storage (localStorage in the browser) —
// mirrors settings.ts's own load/save pattern, but for whether a game
// is in progress and how far into it the player has gotten, rather
// than their preferences.

import type { BotSeats } from "./botAssignment.ts";
import type { BotState } from "../bot/v4/factory.ts";
import type { Hand, Pot } from "../game/types.ts";

const STORAGE_KEY = "rumble31.state";
// Bumped to 12 when restoration was narrowed to game-related screens
// only (specs/state.md): the persisted shape lost its `over` and
// per-menu-screen variants and its `savedAt` timestamp. An old save is
// simply treated as absent (see loadState), no migration needed.
const SCHEMA_VERSION = 12;

// STATE_SCREEN_IDS are the only screens restoration ever navigates back
// to (specs/state.md): a game being played, the Game Menu with a game
// paused behind it, and `main` -- the marker every non-resumable screen
// writes to say "there is nothing to resume".
const STATE_SCREEN_IDS = ["main", "game", "menu"] as const;
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
  // botState[i] is [seat, state] for one of the three bot seats: that
  // bot's round-scoped Knock bookkeeping so far this round (specs/
  // bots_v4.md's Knock phase), so a reload doesn't reset it back to
  // blank.
  botState: Array<[number, BotState]>;
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
  // botSeats[i] is the skill level seated at seat i+1 (specs/bots_v3.md),
  // fixed for the life of the game so resuming it doesn't reshuffle
  // which bot sits where.
  botSeats: BotSeats;
  log: string[];
  checkpoint?: RoundCheckpoint;
}

export type PersistedState =
  // `main` carries no data: it's what every non-resumable screen
  // (Main, Difficulty, About, Licenses, How to Play, Stats, the Game
  // Over screen, and Settings reached from the Main Menu) persists so a
  // reload lands on the Main Screen rather than resuming that screen —
  // see specs/state.md.
  | { screen: "main" }
  | { screen: "game"; game: GameState }
  // Entering the Game Menu (or Settings from it) re-saves the most
  // recently persisted `game` state under this tag rather than creating
  // new game state — see specs/state.md.
  | { screen: "menu"; game: GameState };

// loadState reads PersistedState from storage, returning undefined if
// nothing is stored, what's stored isn't valid JSON, its schema
// version doesn't match, or its screen isn't recognized (which
// includes any save written by an older schema that still happened to
// carry a matching version field).
export function loadState(storage: Storage): PersistedState | undefined {
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
    const { screen } = state as { screen?: unknown };
    if (typeof screen !== "string" || !(STATE_SCREEN_IDS as readonly string[]).includes(screen)) {
      return undefined;
    }
    return state as PersistedState;
  } catch {
    return undefined;
  }
}

// saveState writes state to storage as JSON, tagged with the current
// schema version.
export function saveState(state: PersistedState, storage: Storage): void {
  storage.setItem(STORAGE_KEY, JSON.stringify({ version: SCHEMA_VERSION, state }));
}

// clearState removes any saved state — per specs/state.md, called only
// when the URL supplies valid debug parameters, when the player
// abandons a game from the Game Menu, and when Settings' Reset wipes
// all local storage; never as a plain navigation side effect.
export function clearState(storage: Storage): void {
  storage.removeItem(STORAGE_KEY);
}
