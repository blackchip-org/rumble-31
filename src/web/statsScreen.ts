// The Stats screen (specs/screens/stats.md): formatting/lookup logic
// kept separate from main.ts's DOM wiring, same as licensesScreen.ts,
// plus the screen's own DOM-filling and tab-switching (mirroring
// errorScreen.ts's showErrorScreen, which also owns its screen's DOM
// directly rather than leaving it all to main.ts).

import { BOT_SKILL_LEVELS, type BotSkillLevel } from "../bot/factory.ts";
import { DIFFICULTIES, DIFFICULTY_BOT_SKILL_LEVELS, type Difficulty } from "../config.ts";
import { gamesPlayedFor, ratingFor, totalWinLossTie, type BotVersionStats, type DifficultyStats, type StreakState, type WinLossTie } from "./stats.ts";

// PLACE_CLASSES maps a 0-based winsPerPlace index to its medal tile's
// class (style.css), in First-to-Fourth order.
const PLACE_CLASSES = ["first", "second", "third", "fourth"] as const;

// STREAK_ACCESSORS maps a stats-streak-row's data-streak value to the
// DifficultyStats field it displays.
const STREAK_ACCESSORS: Readonly<Record<string, (d: DifficultyStats) => StreakState>> = {
  firstPlace: (d) => d.firstPlaceStreak,
  topTwo: (d) => d.topTwoStreak,
  notLast: (d) => d.notLastStreak,
};

// isSkillSeatedInDifficulty reports whether skill is ever seated at
// difficulty (config.ts's DIFFICULTY_BOT_SKILL_LEVELS) -- a skill
// never seated there can never have a non-zero Win/Loss/Tie record at
// that difficulty, so the Stats screen dashes it out instead of
// showing a permanent, meaningless 0-0-0.
export function isSkillSeatedInDifficulty(difficulty: Difficulty, skill: BotSkillLevel): boolean {
  return (DIFFICULTY_BOT_SKILL_LEVELS[difficulty] as readonly BotSkillLevel[]).includes(skill);
}

// formatShortDate renders an iso "YYYY-MM-DD" date (stats.ts's
// StreakState dates) as "Mon D" (e.g. "Aug 18"), for the Stats
// screen's streak pills. Built from the parsed y/m/d components
// (rather than handed to `new Date(iso)` directly) so the date reads
// the same regardless of the browser's local timezone -- an ISO date
// with no time component parses as UTC midnight, which a timezone
// behind UTC would otherwise roll back a day.
export function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y as number, (m as number) - 1, d as number).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// formatStreakCurrentMeta/formatStreakBestMeta render a streak pill's
// small print (specs/screens/stats.md): "since <date>"/"through
// <date>" once the streak has actually started, "—" while it's still
// at 0 (current.startDate/best.endDate are only ever set once count >
// 0 -- see stats.ts's StreakState).
export function formatStreakCurrentMeta(streak: StreakState): string {
  return streak.current.startDate === undefined ? "—" : `since ${formatShortDate(streak.current.startDate)}`;
}

export function formatStreakBestMeta(streak: StreakState): string {
  return streak.best.endDate === undefined ? "—" : `through ${formatShortDate(streak.best.endDate)}`;
}

function setText(root: ParentNode, selector: string, text: string): void {
  const el = root.querySelector<HTMLElement>(selector);
  if (el) {
    el.textContent = text;
  }
}

// fillCounters fills a pane's Games played/Wins/Losses/Ties tiles
// (shared markup between the Overall pane and every difficulty pane).
function fillCounters(pane: HTMLElement, games: number, wlt: WinLossTie): void {
  setText(pane, ".stats-counter.games .value", String(games));
  setText(pane, ".stats-counter.wins .value", String(wlt.wins));
  setText(pane, ".stats-counter.losses .value", String(wlt.losses));
  setText(pane, ".stats-counter.ties .value", String(wlt.ties));
}

// fillSkillTable fills pane's Record vs. bot skill table, dashing out
// rows for a skill isSeated says is never seated there instead of
// showing its permanent zero record.
function fillSkillTable(pane: HTMLElement, records: Record<BotSkillLevel, WinLossTie>, isSeated: (skill: BotSkillLevel) => boolean): void {
  for (const skill of BOT_SKILL_LEVELS) {
    const row = pane.querySelector<HTMLElement>(`.stats-skill-table tr[data-skill="${skill}"]`);
    if (!row) {
      continue;
    }
    const seated = isSeated(skill);
    row.classList.toggle("unseated", !seated);
    const rec = records[skill];
    setText(row, ".w", seated ? String(rec.wins) : "—");
    setText(row, ".l", seated ? String(rec.losses) : "—");
    setText(row, ".t", seated ? String(rec.ties) : "—");
  }
}

// fillRating fills a difficulty pane's Rating value and gauge fill
// width (specs/screens/stats.md), derived from dStats via stats.ts's
// ratingFor.
function fillRating(pane: HTMLElement, dStats: DifficultyStats): void {
  const rating = ratingFor(dStats);
  setText(pane, ".stats-rating-row .value", String(rating));
  const fill = pane.querySelector<HTMLElement>(".stats-gauge .fill");
  if (fill) {
    fill.style.width = `${(rating / 1000) * 100}%`;
  }
}

// fillPlaces fills a difficulty pane's four Wins-per-place medal
// tiles, in First-to-Fourth order.
function fillPlaces(pane: HTMLElement, winsPerPlace: readonly [number, number, number, number]): void {
  PLACE_CLASSES.forEach((cls, i) => {
    setText(pane, `.place-tile.${cls} .value`, String(winsPerPlace[i] as number));
  });
}

// fillStreaks fills a difficulty pane's three streak rows (First
// place/Top two/Not last), including the current pill's "live" class
// (style.css: a still-growing streak reads green, a broken one dim).
function fillStreaks(pane: HTMLElement, dStats: DifficultyStats): void {
  for (const [key, accessor] of Object.entries(STREAK_ACCESSORS)) {
    const row = pane.querySelector<HTMLElement>(`.stats-streak-row[data-streak="${key}"]`);
    if (!row) {
      continue;
    }
    const streak = accessor(dStats);
    row.querySelector(".pill.current")?.classList.toggle("live", streak.current.count > 0);
    setText(row, ".pill.current .n", String(streak.current.count));
    setText(row, ".pill.current .meta", formatStreakCurrentMeta(streak));
    setText(row, ".pill.best .n", String(streak.best.count));
    setText(row, ".pill.best .meta", formatStreakBestMeta(streak));
  }
}

// renderStatsScreen fills every tab of #stats-screen (root) from
// stats -- the current bot version's stats (stats.ts's viewStats),
// per specs/screens/stats.md. Safe to call every time the screen is
// shown; it only ever overwrites already-present text/classes.
export function renderStatsScreen(root: HTMLElement, stats: BotVersionStats): void {
  const overallPane = root.querySelector<HTMLElement>('.stats-pane[data-tab="overall"]');
  if (overallPane) {
    fillCounters(overallPane, stats.global.gamesPlayed, totalWinLossTie(stats.global.recordsBySkill));
    setText(overallPane, ".stats-footnote", `${stats.global.gamesAbandoned} games abandoned`);
    fillSkillTable(overallPane, stats.global.recordsBySkill, () => true);
  }

  for (const difficulty of DIFFICULTIES) {
    const pane = root.querySelector<HTMLElement>(`.stats-pane[data-tab="${difficulty}"]`);
    if (!pane) {
      continue;
    }
    const dStats = stats.perDifficulty[difficulty];
    fillCounters(pane, gamesPlayedFor(dStats), totalWinLossTie(dStats.recordsBySkill));
    fillRating(pane, dStats);
    fillPlaces(pane, dStats.winsPerPlace);
    fillSkillTable(pane, dStats.recordsBySkill, (skill) => isSkillSeatedInDifficulty(difficulty, skill));
    fillStreaks(pane, dStats);
  }
}

// resetStatsToOverallTab switches root back to its Overall tab/pane
// and scrolls cardEl back to the top -- called every time the Stats
// screen is shown, so it never reopens on whichever tab/scroll
// position the player left it on last (specs/screens/stats.md).
export function resetStatsToOverallTab(root: HTMLElement, cardEl: HTMLElement): void {
  for (const tab of root.querySelectorAll<HTMLElement>(".stats-tab")) {
    tab.classList.toggle("active", tab.dataset.tab === "overall");
  }
  for (const pane of root.querySelectorAll<HTMLElement>(".stats-pane")) {
    pane.classList.toggle("active", pane.dataset.tab === "overall");
  }
  cardEl.scrollTop = 0;
}

// initStatsTabs wires up root's tab buttons once at startup, swapping
// the active tab/pane and resetting cardEl's scroll position on each
// click.
export function initStatsTabs(root: HTMLElement, cardEl: HTMLElement): void {
  const tabs = Array.from(root.querySelectorAll<HTMLElement>(".stats-tab"));
  for (const tab of tabs) {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab;
      for (const t of tabs) {
        t.classList.toggle("active", t === tab);
      }
      for (const pane of root.querySelectorAll<HTMLElement>(".stats-pane")) {
        pane.classList.toggle("active", pane.dataset.tab === target);
      }
      cardEl.scrollTop = 0;
    });
  }
}
