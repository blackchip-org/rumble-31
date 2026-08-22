// Parses and validates the web GUI's debugging URL parameters, per
// specs/params.md: strikes, north/south/east/west, pot, turn, screen,
// clear, platform, showBots, and age. Every validation failure throws a
// descriptive Error — there is no silent fallback for malformed or
// self-contradictory debug input.

import { parseCard, cardToString } from "../card/card.ts";
import type { Card } from "../card/card.ts";
import { seatByName, seatName } from "../game/seat.ts";
import { parseStrikesDigits } from "../game/strikes.ts";
import type { ParsedStrikes } from "../game/strikes.ts";
import type { RoundDealOverride } from "../game/round.ts";
import type { Hand, Pot } from "../game/types.ts";
import { PLATFORMS, type Platform } from "./installPrompt.ts";

const HAND_PARAM_NAMES = ["north", "south", "east", "west"] as const;

// SCREEN_IDS are the screen identifiers listed in specs/gui.md's
// section headings.
const SCREEN_IDS = ["game", "main", "appinfo", "over", "error", "settings", "about", "licenses", "htp", "menu"] as const;
export type ScreenId = (typeof SCREEN_IDS)[number];

export interface DebugParams {
  initialStrikes: ParsedStrikes;
  initialDeal: RoundDealOverride | undefined;
  // skipDealAnimation is true iff any of north/south/east/west/pot was
  // given — per specs/params.md, only that case starts the game
  // immediately with an unanimated deal.
  skipDealAnimation: boolean;
  screen: ScreenId | undefined;
  clear: boolean;
  // platform overrides installPrompt.ts's own User-Agent-based
  // detection, for exercising the Application Info screen's
  // (specs/screens/appinfo.md) iOS/Android instructions without a
  // real iOS/Android device.
  platform: Platform | undefined;
  // showBots shows each bot seat's skill level (specs/bots.md) next to
  // its seat name on the Game screen (specs/screens/game.md).
  showBots: boolean;
  // ageMinutes pretends that saved state was written this many
  // minutes ago, for exercising specs/state.md's stale Over screen
  // behavior without waiting or hand-editing local storage. Unlike
  // every other debug parameter, main.ts only honors this (and only
  // skips clearing saved state for it) when it's the only parameter
  // present — see main.ts's own comment.
  ageMinutes: number | undefined;
}

// parseDebugParams reads search (e.g. window.location.search) for the
// params documented in specs/params.md.
export function parseDebugParams(search: string | URLSearchParams): DebugParams {
  const q = typeof search === "string" ? new URLSearchParams(search) : search;

  const strikesRaw = q.get("strikes");
  const initialStrikes: ParsedStrikes =
    strikesRaw === null
      ? { strikes: [0, 0, 0, 0], secondChance: [false, false, false, false], eliminated: [false, false, false, false] }
      : parseStrikesDigits(strikesRaw);
  const eliminated = initialStrikes.eliminated;

  const assignedHands = new Map<number, Hand>();
  for (const name of HAND_PARAM_NAMES) {
    const raw = q.get(name);
    if (raw === null) {
      continue;
    }
    const seat = seatByName(name) as number;
    if (eliminated[seat]) {
      throw new Error(`params: ${name}=${raw} given, but ${seatName(seat)} starts eliminated by strikes=${strikesRaw}`);
    }
    assignedHands.set(seat, parseCardGroup(name, raw));
  }

  const potRaw = q.get("pot");
  const assignedPot: Pot | undefined = potRaw === null ? undefined : parseCardGroup("pot", potRaw);

  assertNoDuplicateCards(assignedHands, assignedPot);

  let firstSeat: number | undefined;
  const turnRaw = q.get("turn");
  if (turnRaw !== null) {
    const seat = seatByName(turnRaw);
    if (seat === undefined) {
      throw new Error(`params: turn=${turnRaw} is not a seat name`);
    }
    if (eliminated[seat]) {
      throw new Error(`params: turn=${turnRaw} given, but that seat starts eliminated by strikes=${strikesRaw}`);
    }
    firstSeat = seat;
  }

  // first only makes sense alongside turn: it decides whether turn's
  // seat is taken to be acting on the round's actual first turn
  // (turnIndex 0, per RoundDealOverride) or, by default, on some
  // later turn instead (turnIndex 1) — see specs/params.md.
  const firstRaw = q.get("first");
  if (firstRaw !== null && turnRaw === null) {
    throw new Error(`params: first=${firstRaw} given without turn`);
  }
  if (firstRaw !== null && firstRaw !== "true" && firstRaw !== "false") {
    throw new Error(`params: first=${firstRaw} must be "true" or "false"`);
  }
  const isFirstTurn = firstRaw === "true";

  const skipDealAnimation = assignedHands.size > 0 || assignedPot !== undefined;
  const initialDeal: RoundDealOverride | undefined =
    skipDealAnimation || firstSeat !== undefined
      ? {
          assignedHands: assignedHands.size > 0 ? assignedHands : undefined,
          assignedPot,
          firstSeat,
          turnIndex: firstSeat !== undefined ? (isFirstTurn ? 0 : 1) : undefined,
        }
      : undefined;

  const screenRaw = q.get("screen");
  let screen: ScreenId | undefined;
  if (screenRaw !== null) {
    if (!(SCREEN_IDS as readonly string[]).includes(screenRaw)) {
      throw new Error(`params: screen=${screenRaw} is not a valid screen`);
    }
    screen = screenRaw as ScreenId;
  }

  const clearRaw = q.get("clear");
  if (clearRaw !== null && clearRaw !== "true" && clearRaw !== "false") {
    throw new Error(`params: clear=${clearRaw} must be "true" or "false"`);
  }
  const clear = clearRaw === "true";

  const platformRaw = q.get("platform");
  let platform: Platform | undefined;
  if (platformRaw !== null) {
    if (!(PLATFORMS as readonly string[]).includes(platformRaw)) {
      throw new Error(`params: platform=${platformRaw} is not a valid platform`);
    }
    platform = platformRaw as Platform;
  }

  const showBotsRaw = q.get("showBots");
  if (showBotsRaw !== null && showBotsRaw !== "true" && showBotsRaw !== "false") {
    throw new Error(`params: showBots=${showBotsRaw} must be "true" or "false"`);
  }
  const showBots = showBotsRaw === "true";

  const ageRaw = q.get("age");
  let ageMinutes: number | undefined;
  if (ageRaw !== null) {
    const parsed = Number(ageRaw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new Error(`params: age=${ageRaw} must be a non-negative number`);
    }
    ageMinutes = parsed;
  }

  return { initialStrikes, initialDeal, skipDealAnimation, screen, clear, platform, showBots, ageMinutes };
}

// parseCardGroup parses paramName's raw value as exactly three
// back-to-back two-character cards (specs/cards.md notation), e.g.
// "7s8h9c".
function parseCardGroup(paramName: string, raw: string): Hand {
  if (raw.length !== 6) {
    throw new Error(`params: ${paramName}=${raw} must be exactly 3 cards (6 characters)`);
  }
  try {
    return [parseCard(raw.slice(0, 2)), parseCard(raw.slice(2, 4)), parseCard(raw.slice(4, 6))];
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`params: ${paramName}=${raw}: ${message}`);
  }
}

function assertNoDuplicateCards(assignedHands: ReadonlyMap<number, Hand>, assignedPot: Pot | undefined): void {
  const seen = new Set<string>();
  const allCards: Card[] = [...assignedHands.values(), ...(assignedPot ? [assignedPot] : [])].flat();
  for (const c of allCards) {
    const key = cardToString(c);
    if (seen.has(key)) {
      throw new Error(`params: card ${key} is assigned more than once`);
    }
    seen.add(key);
  }
}
