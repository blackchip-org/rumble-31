// Parses and validates the web GUI's debugging URL parameters, per
// specs/params.md: strikes, north/south/east/west, pot, turn, and
// screen. Every validation failure throws a descriptive Error — there
// is no silent fallback for malformed or self-contradictory debug
// input.

import { parseCard, cardToString } from "../card/card.ts";
import type { Card } from "../card/card.ts";
import { seatByName, seatName } from "../game/seat.ts";
import { parseStrikesDigits } from "../game/strikes.ts";
import type { RoundDealOverride } from "../game/round.ts";
import type { Hand, Pot } from "../game/types.ts";

const HAND_PARAM_NAMES = ["north", "south", "east", "west"] as const;

// SCREEN_IDS are the screen identifiers listed in specs/gui.md's
// section headings.
const SCREEN_IDS = ["game", "main", "over", "error", "settings", "about"] as const;
export type ScreenId = (typeof SCREEN_IDS)[number];

export interface DebugParams {
  initialStrikes: [number, number, number, number];
  initialDeal: RoundDealOverride | undefined;
  // skipDealAnimation is true iff any of north/south/east/west/pot was
  // given — per specs/params.md, only that case starts the game
  // immediately with an unanimated deal.
  skipDealAnimation: boolean;
  screen: ScreenId | undefined;
}

// parseDebugParams reads search (e.g. window.location.search) for the
// params documented in specs/params.md.
export function parseDebugParams(search: string | URLSearchParams): DebugParams {
  const q = typeof search === "string" ? new URLSearchParams(search) : search;

  const strikesRaw = q.get("strikes");
  const initialStrikes = strikesRaw === null ? ([0, 0, 0, 0] as [number, number, number, number]) : parseStrikesDigits(strikesRaw);
  const eliminated = initialStrikes.map((s) => s >= 3);

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

  const skipDealAnimation = assignedHands.size > 0 || assignedPot !== undefined;
  const initialDeal: RoundDealOverride | undefined =
    skipDealAnimation || firstSeat !== undefined
      ? { assignedHands: assignedHands.size > 0 ? assignedHands : undefined, assignedPot, firstSeat }
      : undefined;

  const screenRaw = q.get("screen");
  let screen: ScreenId | undefined;
  if (screenRaw !== null) {
    if (!(SCREEN_IDS as readonly string[]).includes(screenRaw)) {
      throw new Error(`params: screen=${screenRaw} is not a valid screen`);
    }
    screen = screenRaw as ScreenId;
  }

  return { initialStrikes, initialDeal, skipDealAnimation, screen };
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
