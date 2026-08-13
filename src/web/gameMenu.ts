// Pure logic for the Game Menu screen (specs/gui.md's "Game Menu
// Screen" section). Kept separate from main.ts's DOM wiring so it's
// unit-testable without a browser, same as licensesScreen.ts.

import type { BotSeats } from "./botAssignment.ts";
import type { DebugParams } from "./params.ts";
import type { Settings } from "./settings.ts";
import type { GameState } from "./state.ts";

// buildDebugMenuGameState synthesizes a placeholder GameState for
// specs/params.md's screen=menu debug param, which has no real game
// to fall back on -- mirroring main.ts's showDebugGameOverScreen,
// which does the same for screen=over: strikes seed each seat's
// elimination status, the three bot seats reflect the current
// Settings-screen bot difficulties, and there is no round in progress
// (no checkpoint) or log yet.
export function buildDebugMenuGameState(params: DebugParams, settings: Settings): GameState {
  const eliminated = params.initialStrikes.map((s) => s >= 3) as [boolean, boolean, boolean, boolean];
  const botSeats: BotSeats = [settings.bot1, settings.bot2, settings.bot3];
  return {
    strikes: params.initialStrikes,
    eliminated,
    roundNum: 1,
    dealerSeat: 0,
    botSeats,
    log: [],
    checkpoint: undefined,
  };
}
