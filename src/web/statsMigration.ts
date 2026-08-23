// One-time, version-gated corrections applied to already-persisted
// stats (stats.ts) when the app upgrades from one specific release to
// another. Kept separate from stats.ts's own runtime recording logic
// since these only ever run once, at startup, for a single historical
// upgrade.

import { DIFFICULTIES, DIFFICULTY_BOT_SKILL_LEVELS, type Difficulty } from "../config.ts";
import { BOT_SKILL_LEVELS } from "../bot/factory.ts";
import { gamesPlayedFor, totalWinLossTie, type BotVersionStats, type StatsStore } from "./stats.ts";

const APP_VERSION_STORAGE_KEY = "rumble31.appVersion";

// dominantSkillFor returns the skill level most likely seated at
// difficulty: config.ts's DIFFICULTY_BOT_SKILL_LEVELS always lists its
// highest-weight option first, so its first seat is the skill a game
// at that difficulty was most likely actually playing against.
function dominantSkillFor(difficulty: Difficulty) {
  return DIFFICULTY_BOT_SKILL_LEVELS[difficulty][0]!.seats[0];
}

// recomputeGlobalRecordsBySkill rebuilds bvStats.global.recordsBySkill
// from its perDifficulty records, keeping the invariant every live
// recordRoundElimination call already maintains (global is always the
// sum of the per-difficulty records) after correctMissingTies edits
// perDifficulty directly below.
function recomputeGlobalRecordsBySkill(bvStats: BotVersionStats): void {
  for (const skill of BOT_SKILL_LEVELS) {
    const totals = { wins: 0, losses: 0, ties: 0 };
    for (const difficulty of DIFFICULTIES) {
      const rec = bvStats.perDifficulty[difficulty].recordsBySkill[skill];
      totals.wins += rec.wins;
      totals.losses += rec.losses;
      totals.ties += rec.ties;
    }
    bvStats.global.recordsBySkill[skill] = totals;
  }
}

// correctMissingTies fixes up stats recorded before the v7 fix to
// main.ts's tied-finish handling: when the human and a bot were
// eliminated together on a game's final round, the bot's outcome was
// silently dropped instead of recorded as a tie, so a difficulty's
// true bot-opponent count (gamesPlayedFor * 3) can exceed the number
// of win/loss/tie records actually stored for it. This mutates store
// in place, crediting each shortfall as a tie against the difficulty's
// dominant skill level (dominantSkillFor) -- the original bug didn't
// preserve which skill was actually involved, so this is the closest
// reconstructible attribution, not a recovered fact.
export function correctMissingTies(store: StatsStore): void {
  for (const bvStats of Object.values(store.byBotVersion)) {
    for (const difficulty of DIFFICULTIES) {
      const dStats = bvStats.perDifficulty[difficulty];
      const expected = gamesPlayedFor(dStats) * 3;
      const recorded = totalWinLossTie(dStats.recordsBySkill);
      const missing = expected - (recorded.wins + recorded.losses + recorded.ties);
      if (missing > 0) {
        dStats.recordsBySkill[dominantSkillFor(difficulty)].ties += missing;
      }
    }
    recomputeGlobalRecordsBySkill(bvStats);
  }
}

// needsTieCorrection reports whether correctMissingTies should run:
// only for the exact v6 -> v7 upgrade (src/version.ts). storedVersion
// is whatever rumble31.appVersion last held -- null means "never
// written," which today can only mean a v6 install, since v7 is the
// first release to write this key at all.
export function needsTieCorrection(storedVersion: string | null, currentVersion: string): boolean {
  return (storedVersion === null || storedVersion === "6") && currentVersion === "7";
}

// runStartupMigrations applies every one-time, version-gated
// migration this release needs (currently just correctMissingTies)
// against store, then records currentVersion as rumble31.appVersion so
// none of them run again on a later load. Returns whether store was
// actually changed, so main.ts knows whether to persist it.
export function runStartupMigrations(store: StatsStore, storage: Storage, currentVersion: string): boolean {
  const storedVersion = storage.getItem(APP_VERSION_STORAGE_KEY);
  const shouldMigrate = needsTieCorrection(storedVersion, currentVersion);
  if (shouldMigrate) {
    correctMissingTies(store);
  }
  storage.setItem(APP_VERSION_STORAGE_KEY, currentVersion);
  return shouldMigrate;
}
