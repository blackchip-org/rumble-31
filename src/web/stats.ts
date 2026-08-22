// Gameplay stats (specs/stats.md), persisted to a Storage (localStorage
// in the browser) as a single JSON blob, mirroring settings.ts/state.ts's
// own load/save pattern. Stats are scoped per bot version
// (src/bot/version.ts): switching versions never discards older stats,
// it just starts a fresh, independently-tracked set alongside them.

import { DIFFICULTIES, type Difficulty } from "../config.ts";
import { BOT_SKILL_LEVELS, type BotSkillLevel } from "../bot/factory.ts";
import type { BotSeats } from "./botAssignment.ts";

const STORAGE_KEY = "rumble31.stats";
const SCHEMA_VERSION = 1;

export interface WinLossTie {
  wins: number;
  losses: number;
  ties: number;
}

function emptyWinLossTie(): WinLossTie {
  return { wins: 0, losses: 0, ties: 0 };
}

function emptySkillRecords(): Record<BotSkillLevel, WinLossTie> {
  return Object.fromEntries(BOT_SKILL_LEVELS.map((skill) => [skill, emptyWinLossTie()])) as Record<BotSkillLevel, WinLossTie>;
}

// StreakState tracks one of the three place-based streaks
// (specs/stats.md): current.startDate and best.endDate are calendar
// dates (YYYY-MM-DD, see todayDateString), present only once the streak
// has actually started (count > 0).
export interface StreakState {
  current: { count: number; startDate?: string };
  best: { count: number; endDate?: string };
}

function emptyStreak(): StreakState {
  return { current: { count: 0 }, best: { count: 0 } };
}

// DifficultyStats is one bot version's "Per Difficulty Setting" stats
// (specs/stats.md). winsPerPlace is indexed 0 (First) through 3
// (Fourth); Rating is deliberately not stored here, since it's derived
// from winsPerPlace by ratingFor below.
export interface DifficultyStats {
  winsPerPlace: [number, number, number, number];
  recordsBySkill: Record<BotSkillLevel, WinLossTie>;
  firstPlaceStreak: StreakState;
  topTwoStreak: StreakState;
  notLastStreak: StreakState;
}

function emptyDifficultyStats(): DifficultyStats {
  return {
    winsPerPlace: [0, 0, 0, 0],
    recordsBySkill: emptySkillRecords(),
    firstPlaceStreak: emptyStreak(),
    topTwoStreak: emptyStreak(),
    notLastStreak: emptyStreak(),
  };
}

function emptyPerDifficulty(): Record<Difficulty, DifficultyStats> {
  return Object.fromEntries(DIFFICULTIES.map((difficulty) => [difficulty, emptyDifficultyStats()])) as Record<Difficulty, DifficultyStats>;
}

// GlobalStats is one bot version's "Global Stats" (specs/stats.md).
export interface GlobalStats {
  gamesPlayed: number;
  gamesAbandoned: number;
  recordsBySkill: Record<BotSkillLevel, WinLossTie>;
}

function emptyGlobalStats(): GlobalStats {
  return { gamesPlayed: 0, gamesAbandoned: 0, recordsBySkill: emptySkillRecords() };
}

// BotVersionStats is every stat tracked for one bot version.
export interface BotVersionStats {
  global: GlobalStats;
  perDifficulty: Record<Difficulty, DifficultyStats>;
}

function emptyBotVersionStats(): BotVersionStats {
  return { global: emptyGlobalStats(), perDifficulty: emptyPerDifficulty() };
}

// StatsStore is every bot version's stats, keyed by that version's
// src/bot/version.ts string.
export interface StatsStore {
  byBotVersion: Record<string, BotVersionStats>;
}

function emptyStatsStore(): StatsStore {
  return { byBotVersion: {} };
}

// loadStats reads StatsStore from storage, falling back to an empty
// store when nothing is stored, what's stored isn't valid JSON, or its
// schema version doesn't match.
export function loadStats(storage: Storage): StatsStore {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === null) {
    return emptyStatsStore();
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return emptyStatsStore();
    }
    const { version, store } = parsed as { version?: unknown; store?: unknown };
    if (version !== SCHEMA_VERSION || typeof store !== "object" || store === null) {
      return emptyStatsStore();
    }
    return store as StatsStore;
  } catch {
    return emptyStatsStore();
  }
}

// saveStats writes store to storage as JSON, tagged with the current
// schema version.
export function saveStats(store: StatsStore, storage: Storage): void {
  storage.setItem(STORAGE_KEY, JSON.stringify({ version: SCHEMA_VERSION, store }));
}

// statsFor returns botVersion's stats within store, creating (and
// inserting) an empty set the first time that version is seen -- this
// is what satisfies specs/stats.md's "don't discard the older stats,
// create a new set" when the bot version changes.
function statsFor(store: StatsStore, botVersion: string): BotVersionStats {
  const existing = store.byBotVersion[botVersion];
  if (existing) {
    return existing;
  }
  const created = emptyBotVersionStats();
  store.byBotVersion[botVersion] = created;
  return created;
}

// viewStats is statsFor's read-only counterpart, for the Stats screen
// (specs/screens/stats.md): looking at a bot version's stats -- even
// one never recorded a game under -- must never itself create or save
// a store entry the way recording an event does.
export function viewStats(store: StatsStore, botVersion: string): BotVersionStats {
  return store.byBotVersion[botVersion] ?? emptyBotVersionStats();
}

// recordGameStarted increments Games played (specs/stats.md's Global
// Stats), called once per freshly-started (not resumed) game.
export function recordGameStarted(store: StatsStore, botVersion: string): void {
  statsFor(store, botVersion).global.gamesPlayed++;
}

// recordGameAbandoned increments Games abandoned (specs/stats.md's
// Global Stats).
export function recordGameAbandoned(store: StatsStore, botVersion: string): void {
  statsFor(store, botVersion).global.gamesAbandoned++;
}

// recordRoundElimination applies specs/stats.md's win/loss/tie rule for
// one round's eliminations, updating both the Global and the given
// Difficulty's Win/Loss/Tie records. It's also used to score an
// abandoned game (specs/stats.md): pass eliminatedThisRound as [0] and
// eliminatedBeforeRound as the game's eliminated array at the moment of
// abandonment, which always yields a loss (never a tie) against every
// still-active bot, since no bot is ever eliminated by an abandonment.
//
// eliminatedBeforeRound is indexed by seat (0-3, South first) and
// reflects each seat's elimination status going into this round;
// eliminatedThisRound lists the seats newly eliminated by it. A bot
// seat already eliminated before this round is skipped -- its
// win/loss/tie was already recorded when it was actually eliminated.
export function recordRoundElimination(store: StatsStore, botVersion: string, difficulty: Difficulty, botSeats: BotSeats, eliminatedBeforeRound: readonly boolean[], eliminatedThisRound: readonly number[]): void {
  const bvStats = statsFor(store, botVersion);
  const southEliminated = eliminatedThisRound.includes(0);
  for (const seat of [1, 2, 3] as const) {
    if (eliminatedBeforeRound[seat]) {
      continue;
    }
    const eliminatedNow = eliminatedThisRound.includes(seat);
    let outcome: keyof WinLossTie | undefined;
    if (southEliminated) {
      outcome = eliminatedNow ? "ties" : "losses";
    } else if (eliminatedNow) {
      outcome = "wins";
    }
    if (outcome === undefined) {
      continue;
    }
    const skill = botSeats[seat - 1] as BotSkillLevel;
    bvStats.global.recordsBySkill[skill][outcome]++;
    bvStats.perDifficulty[difficulty].recordsBySkill[skill][outcome]++;
  }
}

// applyStreak advances one StreakState for a single game: met is
// whether that game satisfied the streak's condition (e.g. "placed
// First"). While the streak keeps extending it's also the best one
// seen so far at that length, so best's date keeps moving forward each
// time -- it only stops once the streak breaks (see specs/stats.md).
function applyStreak(streak: StreakState, met: boolean, todayStr: string): void {
  if (!met) {
    streak.current = { count: 0 };
    return;
  }
  if (streak.current.count === 0) {
    streak.current.startDate = todayStr;
  }
  streak.current.count++;
  if (streak.current.count >= streak.best.count) {
    streak.best = { count: streak.current.count, endDate: todayStr };
  }
}

// recordGamePlace applies specs/stats.md's per-difficulty placement
// stats for one finished or abandoned game: place is South's 1-based
// finish (1 = First, matching specs/log.md), incrementing the
// corresponding Wins-per-place bucket and updating all three streaks.
export function recordGamePlace(store: StatsStore, botVersion: string, difficulty: Difficulty, place: 1 | 2 | 3 | 4, todayStr: string): void {
  const dStats = statsFor(store, botVersion).perDifficulty[difficulty];
  dStats.winsPerPlace[place - 1] = (dStats.winsPerPlace[place - 1] as number) + 1;
  applyStreak(dStats.firstPlaceStreak, place === 1, todayStr);
  applyStreak(dStats.topTwoStreak, place <= 2, todayStr);
  applyStreak(dStats.notLastStreak, place <= 3, todayStr);
}

// ratingFor computes specs/stats.md's Rating for one DifficultyStats:
// the average place value (1st=3 ... 4th=0) across every game recorded
// in winsPerPlace, scaled to 0-1000. No separate game count is stored
// for this -- it's derived from winsPerPlace itself, per the spec's own
// normalization note.
export function ratingFor(dStats: DifficultyStats): number {
  const [first, second, third, fourth] = dStats.winsPerPlace;
  const total = first + second + third + fourth;
  if (total === 0) {
    return 0;
  }
  const avgPlaceValue = (first * 3 + second * 2 + third * 1 + fourth * 0) / total;
  return Math.round((avgPlaceValue / 3) * 1000);
}

// totalWinLossTie sums a skill-keyed set of records into one overall
// WinLossTie -- the Stats screen's headline Wins/Losses/Ties counters
// (specs/screens/stats.md), derived rather than separately tracked,
// same as ratingFor above.
export function totalWinLossTie(records: Record<BotSkillLevel, WinLossTie>): WinLossTie {
  return BOT_SKILL_LEVELS.reduce<WinLossTie>(
    (total, skill) => {
      const rec = records[skill];
      return { wins: total.wins + rec.wins, losses: total.losses + rec.losses, ties: total.ties + rec.ties };
    },
    { wins: 0, losses: 0, ties: 0 },
  );
}

// gamesPlayedFor sums a DifficultyStats' winsPerPlace into that
// difficulty's own games-played count -- specs/stats.md tracks Games
// played only globally, so the Stats screen's per-difficulty counter
// (specs/screens/stats.md) derives it from the one per-difficulty
// count that's always in lockstep with it: every game ends with South
// placed somewhere.
export function gamesPlayedFor(dStats: DifficultyStats): number {
  return dStats.winsPerPlace.reduce((sum, count) => sum + count, 0);
}

// todayDateString returns now's local calendar date as YYYY-MM-DD, for
// StreakState's startDate/endDate. now is injectable for tests
// (mirrors state.ts's own clock-injection pattern).
export function todayDateString(now: () => Date = () => new Date()): string {
  const d = now();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
