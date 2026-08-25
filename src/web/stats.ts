// Gameplay stats (specs/stats.md), persisted to a Storage (localStorage
// in the browser) as a single JSON blob, mirroring settings.ts/state.ts's
// own load/save pattern. Stats are scoped per bot version -- "v3" or
// "v4" (specs/bots_v4.md's "Bot version" section): switching versions
// never discards older stats, it just starts a fresh,
// independently-tracked set alongside them.

import { DIFFICULTIES, type Difficulty } from "../config.ts";
import { BOT_SKILL_LEVELS, type BotSkillLevel } from "../bot/v4/factory.ts";
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
  roundsPlayed: number;
  zeroStrikeWins: number;
  oneStrikeWins: number;
  twoStrikeWins: number;
  secondChanceWins: number;
  best: number;
  bestWith32: number;
  bestWith31: number;
  bestWith305: number;
}

function emptyDifficultyStats(): DifficultyStats {
  return {
    winsPerPlace: [0, 0, 0, 0],
    recordsBySkill: emptySkillRecords(),
    firstPlaceStreak: emptyStreak(),
    topTwoStreak: emptyStreak(),
    notLastStreak: emptyStreak(),
    roundsPlayed: 0,
    zeroStrikeWins: 0,
    oneStrikeWins: 0,
    twoStrikeWins: 0,
    secondChanceWins: 0,
    best: 0,
    bestWith32: 0,
    bestWith31: 0,
    bestWith305: 0,
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
// label ("v3"/"v4").
export interface StatsStore {
  byBotVersion: Record<string, BotVersionStats>;
}

function emptyStatsStore(): StatsStore {
  return { byBotVersion: {} };
}

// isRecord narrows to a plain, indexable object -- the common guard
// every normalize* function below uses before reading a field off of
// otherwise-unknown persisted data.
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeWinLossTie(raw: unknown): WinLossTie {
  const r = isRecord(raw) ? raw : {};
  return {
    wins: typeof r.wins === "number" ? r.wins : 0,
    losses: typeof r.losses === "number" ? r.losses : 0,
    ties: typeof r.ties === "number" ? r.ties : 0,
  };
}

function normalizeSkillRecords(raw: unknown): Record<BotSkillLevel, WinLossTie> {
  const r = isRecord(raw) ? raw : {};
  return Object.fromEntries(BOT_SKILL_LEVELS.map((skill) => [skill, normalizeWinLossTie(r[skill])])) as Record<BotSkillLevel, WinLossTie>;
}

function normalizeStreak(raw: unknown): StreakState {
  const r = isRecord(raw) ? raw : {};
  const current = isRecord(r.current) ? r.current : {};
  const best = isRecord(r.best) ? r.best : {};
  return {
    current: {
      count: typeof current.count === "number" ? current.count : 0,
      ...(typeof current.startDate === "string" ? { startDate: current.startDate } : {}),
    },
    best: {
      count: typeof best.count === "number" ? best.count : 0,
      ...(typeof best.endDate === "string" ? { endDate: best.endDate } : {}),
    },
  };
}

function normalizeWinsPerPlace(raw: unknown): [number, number, number, number] {
  if (Array.isArray(raw) && raw.length === 4 && raw.every((n) => typeof n === "number")) {
    return raw as [number, number, number, number];
  }
  return [0, 0, 0, 0];
}

function normalizeCount(raw: unknown): number {
  return typeof raw === "number" ? raw : 0;
}

function normalizeDifficultyStats(raw: unknown): DifficultyStats {
  const r = isRecord(raw) ? raw : {};
  return {
    winsPerPlace: normalizeWinsPerPlace(r.winsPerPlace),
    recordsBySkill: normalizeSkillRecords(r.recordsBySkill),
    firstPlaceStreak: normalizeStreak(r.firstPlaceStreak),
    topTwoStreak: normalizeStreak(r.topTwoStreak),
    notLastStreak: normalizeStreak(r.notLastStreak),
    roundsPlayed: normalizeCount(r.roundsPlayed),
    zeroStrikeWins: normalizeCount(r.zeroStrikeWins),
    oneStrikeWins: normalizeCount(r.oneStrikeWins),
    twoStrikeWins: normalizeCount(r.twoStrikeWins),
    secondChanceWins: normalizeCount(r.secondChanceWins),
    best: normalizeCount(r.best),
    bestWith32: normalizeCount(r.bestWith32),
    bestWith31: normalizeCount(r.bestWith31),
    bestWith305: normalizeCount(r.bestWith305),
  };
}

function normalizePerDifficulty(raw: unknown): Record<Difficulty, DifficultyStats> {
  const r = isRecord(raw) ? raw : {};
  return Object.fromEntries(DIFFICULTIES.map((difficulty) => [difficulty, normalizeDifficultyStats(r[difficulty])])) as Record<Difficulty, DifficultyStats>;
}

function normalizeGlobalStats(raw: unknown): GlobalStats {
  const r = isRecord(raw) ? raw : {};
  return {
    gamesPlayed: typeof r.gamesPlayed === "number" ? r.gamesPlayed : 0,
    gamesAbandoned: typeof r.gamesAbandoned === "number" ? r.gamesAbandoned : 0,
    recordsBySkill: normalizeSkillRecords(r.recordsBySkill),
  };
}

// normalizeBotVersionStats rebuilds a well-formed BotVersionStats out
// of whatever's actually stored for one bot version, filling in any
// missing or wrong-typed field with its empty default instead of
// trusting the persisted shape verbatim -- see normalizeStatsStore's
// own comment for why this matters.
function normalizeBotVersionStats(raw: unknown): BotVersionStats {
  const r = isRecord(raw) ? raw : {};
  return { global: normalizeGlobalStats(r.global), perDifficulty: normalizePerDifficulty(r.perDifficulty) };
}

// normalizeStatsStore rebuilds a well-formed StatsStore, normalizing
// every bot version entry it finds. loadStats only ever checked the
// top-level {version, store} envelope, trusting store's own contents
// verbatim -- a partial or differently-shaped entry (e.g. one written
// by a since-changed build, or corrupted in storage) would otherwise
// resurface as a crash the first time some other code reached into a
// field it assumed was always there, rather than as a handled "not
// present yet" case the way a wholly-missing entry already is
// (statsFor/viewStats).
function normalizeStatsStore(raw: unknown): StatsStore {
  const r = isRecord(raw) ? raw : {};
  const byBotVersion = isRecord(r.byBotVersion) ? r.byBotVersion : {};
  return { byBotVersion: Object.fromEntries(Object.entries(byBotVersion).map(([botVersion, entry]) => [botVersion, normalizeBotVersionStats(entry)])) };
}

// loadStats reads StatsStore from storage, falling back to an empty
// store when nothing is stored, what's stored isn't valid JSON, or its
// schema version doesn't match -- and normalizing whatever store it
// does find (normalizeStatsStore), so a partial or malformed entry
// never crashes later instead of just showing up as zeroes.
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
    if (version !== SCHEMA_VERSION) {
      return emptyStatsStore();
    }
    return normalizeStatsStore(store);
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
//
// botSeats normally comes straight from a live Game, but the Abandon
// path instead passes whatever GameState specs/state.md last
// persisted -- possibly a game resumed from well before botSeats
// existed in that shape (a long-lived PWA install can have a paused
// game sitting in local storage across many app updates). A seat
// whose value there isn't actually a recognized BotSkillLevel is
// skipped rather than recorded under a bogus key, the same "missing
// data doesn't crash the app" leniency loadStats/viewStats give a
// missing or malformed stats entry above.
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
    const skill = botSeats?.[seat - 1];
    if (typeof skill !== "string" || !(BOT_SKILL_LEVELS as readonly string[]).includes(skill)) {
      continue;
    }
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

// recordRoundPlayed applies specs/stats.md's Rounds played/Best stats
// for one real round: roundsPlayed always increments (a played round
// counts even if the game it's part of is later abandoned -- only the
// abandonment moment itself, which has no round of its own, doesn't
// call this). southWasBest is whether South was awarded that round's
// best-score tag (outcome.result.winners.includes(0), ties included);
// when true, best increments, plus whichever of
// bestWith32/31/305 matches southScore exactly.
export function recordRoundPlayed(store: StatsStore, botVersion: string, difficulty: Difficulty, southWasBest: boolean, southScore: number | undefined): void {
  const dStats = statsFor(store, botVersion).perDifficulty[difficulty];
  dStats.roundsPlayed++;
  if (!southWasBest) {
    return;
  }
  dStats.best++;
  if (southScore === 32) {
    dStats.bestWith32++;
  } else if (southScore === 31) {
    dStats.bestWith31++;
  } else if (southScore === 30.5) {
    dStats.bestWith305++;
  }
}

// recordGameCompleted applies specs/stats.md's Wins by strikes stats:
// called once per real (non-abandoned) game end, win or loss, but only
// ever increments a bucket when southWon -- a loss leaves every bucket
// untouched, same as never calling this at all for an abandoned game.
// southFinalStrikes of 3 or more
// only happens via the once-per-game second-chance leniency
// (specs/rules.md), since reaching three strikes without it is an
// elimination (a loss), never a win.
export function recordGameCompleted(store: StatsStore, botVersion: string, difficulty: Difficulty, southWon: boolean, southFinalStrikes: number): void {
  if (!southWon) {
    return;
  }
  const dStats = statsFor(store, botVersion).perDifficulty[difficulty];
  if (southFinalStrikes === 0) {
    dStats.zeroStrikeWins++;
  } else if (southFinalStrikes === 1) {
    dStats.oneStrikeWins++;
  } else if (southFinalStrikes === 2) {
    dStats.twoStrikeWins++;
  } else {
    dStats.secondChanceWins++;
  }
}

// sumPerDifficulty totals one numeric field of DifficultyStats across
// every difficulty -- the Overall tab's grand totals for Rounds
// played/Zero-One strike games/Best (specs/stats.md's normalization
// note: these are simple counts, so summed rather than separately
// tracked at the Global level).
export function sumPerDifficulty(perDifficulty: Record<Difficulty, DifficultyStats>, pick: (dStats: DifficultyStats) => number): number {
  return DIFFICULTIES.reduce((total, difficulty) => total + pick(perDifficulty[difficulty]), 0);
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

// winPercentFor computes specs/screens/stats.md's Win% for one
// WinLossTie: wins divided by total games (wins + losses + ties),
// scaled to 0-100. Unrounded -- the Stats screen rounds it for
// display, same division of labor as ratingFor above.
export function winPercentFor(wlt: WinLossTie): number {
  const total = wlt.wins + wlt.losses + wlt.ties;
  return total === 0 ? 0 : (wlt.wins / total) * 100;
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

// daysAgoString returns the calendar date daysAgo days before today, so
// seedDebugStats' streak dates read as recent no matter when it runs.
function daysAgoString(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return todayDateString(() => d);
}

// seedDebugStats replaces botVersion's stats in store with a
// plausible, fully-populated dataset -- specs/params.md's seedStats
// debug parameter, for checking the Stats screen's layout
// (specs/screens/stats.md) without having to actually play games.
// Every cross-field invariant the real recording functions above
// maintain (global.recordsBySkill summing its per-difficulty
// counterparts, a difficulty's strike-win buckets summing to its
// first-place count, and so on) holds here too, so the seeded data
// looks like it came from real games.
export function seedDebugStats(store: StatsStore, botVersion: string): void {
  store.byBotVersion[botVersion] = {
    global: {
      gamesPlayed: 43,
      gamesAbandoned: 3,
      recordsBySkill: {
        novice: { wins: 14, losses: 4, ties: 1 },
        advanced: { wins: 9, losses: 8, ties: 0 },
        expert: { wins: 5, losses: 9, ties: 1 },
      },
    },
    perDifficulty: {
      easy: {
        winsPerPlace: [10, 3, 2, 1],
        recordsBySkill: {
          novice: { wins: 12, losses: 3, ties: 1 },
          advanced: { wins: 2, losses: 1, ties: 0 },
          expert: { wins: 0, losses: 1, ties: 0 },
        },
        firstPlaceStreak: { current: { count: 3, startDate: daysAgoString(5) }, best: { count: 5, endDate: daysAgoString(15) } },
        topTwoStreak: { current: { count: 3, startDate: daysAgoString(5) }, best: { count: 8, endDate: daysAgoString(10) } },
        notLastStreak: { current: { count: 9, startDate: daysAgoString(12) }, best: { count: 9, endDate: daysAgoString(3) } },
        roundsPlayed: 58,
        zeroStrikeWins: 6,
        oneStrikeWins: 3,
        twoStrikeWins: 1,
        secondChanceWins: 0,
        best: 14,
        bestWith32: 2,
        bestWith31: 5,
        bestWith305: 1,
      },
      moderate: {
        winsPerPlace: [6, 5, 3, 2],
        recordsBySkill: {
          novice: { wins: 2, losses: 1, ties: 0 },
          advanced: { wins: 6, losses: 5, ties: 0 },
          expert: { wins: 1, losses: 3, ties: 0 },
        },
        firstPlaceStreak: { current: { count: 0 }, best: { count: 3, endDate: daysAgoString(20) } },
        topTwoStreak: { current: { count: 1, startDate: daysAgoString(1) }, best: { count: 4, endDate: daysAgoString(7) } },
        notLastStreak: { current: { count: 2, startDate: daysAgoString(2) }, best: { count: 6, endDate: daysAgoString(9) } },
        roundsPlayed: 72,
        zeroStrikeWins: 2,
        oneStrikeWins: 2,
        twoStrikeWins: 1,
        secondChanceWins: 1,
        best: 11,
        bestWith32: 1,
        bestWith31: 3,
        bestWith305: 2,
      },
      hard: {
        winsPerPlace: [2, 3, 2, 4],
        recordsBySkill: {
          novice: { wins: 0, losses: 0, ties: 0 },
          advanced: { wins: 1, losses: 2, ties: 0 },
          expert: { wins: 4, losses: 5, ties: 1 },
        },
        firstPlaceStreak: { current: { count: 1, startDate: daysAgoString(1) }, best: { count: 2, endDate: daysAgoString(14) } },
        topTwoStreak: { current: { count: 1, startDate: daysAgoString(1) }, best: { count: 3, endDate: daysAgoString(14) } },
        notLastStreak: { current: { count: 1, startDate: daysAgoString(1) }, best: { count: 4, endDate: daysAgoString(18) } },
        roundsPlayed: 33,
        zeroStrikeWins: 1,
        oneStrikeWins: 1,
        twoStrikeWins: 0,
        secondChanceWins: 0,
        best: 4,
        bestWith32: 0,
        bestWith31: 1,
        bestWith305: 1,
      },
    },
  };
}
