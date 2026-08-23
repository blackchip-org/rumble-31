// The Game Over screen's results table and Win/Loss/Tie tally
// (specs/screens/over.md): South's result against each bot seat, kept
// separate from main.ts's DOM wiring, same split as statsScreen.ts.

import { PLACE_ORDINALS } from "../log.ts";
import { seatName } from "../game/seat.ts";

export type BotResult = "win" | "loss" | "tie";

// PLACE_TIER_CLASSES maps a 1-based place to its rank badge's tier
// class (style.css's .rank-badge.first/.second/.third/.fourth).
const PLACE_TIER_CLASSES = ["first", "second", "third", "fourth"] as const;

// BOT_SEATS is the seat number (1/2/3) for each index of a BotSeats/
// BotResults triple, i.e. West/North/East in that fixed order.
const BOT_SEATS = [1, 2, 3] as const;

// computeBotResults classifies South's result against each bot seat
// (West/North/East, matching BotSeats' own index order), given the
// game's final eliminated state and which seats were eliminated in
// the game's final round (RoundOutcome.eliminated from the round that
// ended it). A seat still not-eliminated once the game is over is by
// definition one of Game.winners() -- more than one only when the
// last contenders were eliminated together (see game.ts) -- so
// `eliminated` alone is enough to tell winners from losers here.
//
// The game stops the instant South is eliminated, even if other bots
// are still active (main.ts's gameOver check) -- so there's never a
// final ranking among bots to compare against. Instead this is a
// pairwise comparison between South and each bot individually, based
// on elimination timing:
//   - both South and the bot survived to the end -> tie (co-winners)
//   - the bot survived and South didn't -> loss
//   - South survived (or ended tied) and the bot didn't -> win
//   - both were eliminated: in the same final round -> tie; the bot
//     in an earlier round -> win (a bot can't go out *after* South,
//     since play stops the moment South is eliminated)
export function computeBotResults(eliminated: readonly [boolean, boolean, boolean, boolean], finalRoundEliminated: readonly number[]): [BotResult, BotResult, BotResult] {
  const southSurvived = !eliminated[0];
  return BOT_SEATS.map((seat): BotResult => {
    const botSurvived = !eliminated[seat];
    if (botSurvived) {
      return southSurvived ? "tie" : "loss";
    }
    if (southSurvived) {
      return "win";
    }
    return finalRoundEliminated.includes(seat) && finalRoundEliminated.includes(0) ? "tie" : "win";
  }) as [BotResult, BotResult, BotResult];
}

// fillResultsTable fills root's static West/North/East result rows
// (index.html's over-results-table, one `tr[data-seat="west"]` etc.
// per bot seat) with that seat's skill label and a Win/Loss/Tie pill.
// botLabels is West/North/East order, matching botResults/BotSeats.
function fillResultsTable(root: HTMLElement, botResults: readonly [BotResult, BotResult, BotResult], botLabels: readonly [string, string, string]): void {
  BOT_SEATS.forEach((seat, i) => {
    const row = root.querySelector<HTMLElement>(`.over-results-table tr[data-seat="${seatName(seat).toLowerCase()}"]`);
    if (!row) {
      return;
    }
    const result = botResults[i] as BotResult;
    const skillCell = row.querySelector<HTMLElement>(".skill");
    if (skillCell) {
      skillCell.textContent = botLabels[i] as string;
    }
    const resultCell = row.querySelector<HTMLElement>(".result-pill");
    if (resultCell) {
      resultCell.textContent = result === "win" ? "Win" : result === "loss" ? "Loss" : "Tie";
      resultCell.classList.remove("win", "loss", "tie");
      resultCell.classList.add(result);
    }
  });
}

// fillRankBadge fills root's rank badge (index.html's .rank-badge)
// with South's 1-based finish for this game -- "First Place" through
// "Fourth Place" in .rank-badge-place, tinted per style.css's medal
// tier colors (the same gold/silver/bronze the Stats screen's
// Rankings tiles use, plus a fourth tier for last that the Stats
// screen deliberately omits) -- and the difficulty the game was
// played at (e.g. "Hard Difficulty") in .rank-badge-difficulty above
// it.
function fillRankBadge(root: HTMLElement, southPlace: 1 | 2 | 3 | 4, difficultyLabel: string): void {
  const badge = root.querySelector<HTMLElement>(".rank-badge");
  if (!badge) {
    return;
  }
  const difficultyEl = badge.querySelector<HTMLElement>(".rank-badge-difficulty");
  if (difficultyEl) {
    difficultyEl.textContent = `${difficultyLabel} Difficulty`;
  }
  const placeEl = badge.querySelector<HTMLElement>(".rank-badge-place");
  if (placeEl) {
    placeEl.textContent = `${PLACE_ORDINALS[southPlace - 1]} Place`;
  }
  badge.classList.remove(...PLACE_TIER_CLASSES);
  badge.classList.add(PLACE_TIER_CLASSES[southPlace - 1] as string);
}

// fillTally fills root's Wins/Losses/Ties tiles (index.html's
// over-tally) with botResults' totals.
function fillTally(root: HTMLElement, botResults: readonly [BotResult, BotResult, BotResult]): void {
  const wins = botResults.filter((r) => r === "win").length;
  const losses = botResults.filter((r) => r === "loss").length;
  const ties = botResults.filter((r) => r === "tie").length;
  const set = (selector: string, value: number) => {
    const el = root.querySelector<HTMLElement>(selector);
    if (el) {
      el.textContent = String(value);
    }
  };
  set(".over-tally .wins .value", wins);
  set(".over-tally .losses .value", losses);
  set(".over-tally .ties .value", ties);
}

// renderOverResults fills root's rank badge, results table, and
// tally. southPlace is South's 1-based finish (main.ts's southPlace,
// the same value already fed to log.ts's gameEndLines and
// stats.ts's recordGamePlace). botResults/botLabels are both
// West/North/East order, matching BotSeats -- botLabels is each
// bot's display label (main.ts's BOT_LABELS, already mapped from its
// BotSeats skill levels, the same way it's already passed into
// log.ts's gameEndLines). difficultyLabel is the difficulty the game
// was played at (main.ts's DIFFICULTY_LABELS[settings.difficulty],
// the same label already used for log.ts's gameStartLines).
export function renderOverResults(root: HTMLElement, southPlace: 1 | 2 | 3 | 4, botResults: readonly [BotResult, BotResult, BotResult], botLabels: readonly [string, string, string], difficultyLabel: string): void {
  fillRankBadge(root, southPlace, difficultyLabel);
  fillResultsTable(root, botResults, botLabels);
  fillTally(root, botResults);
}
