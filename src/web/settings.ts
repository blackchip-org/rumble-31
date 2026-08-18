// User-configurable settings (specs/gui.md's Settings Screen), persisted
// to a Storage (localStorage in the browser) as a single JSON blob.

import { DIFFICULTIES, type Difficulty } from "../config.ts";
import { SUIT_COLORS, type SuitColor } from "./cardSheet.ts";
import { FOCUS_FIRSTS, type FocusFirst } from "./focusNav.ts";

const STORAGE_KEY = "rumble31.settings";

export interface Settings {
  soundsEnabled: boolean;
  difficulty: Difficulty;
  // swapConfirmCancel swaps which button confirms vs. cancels for
  // controller/keyboard navigation (specs/controller.md), for players
  // used to a Nintendo-style layout instead of the default W3C
  // Standard Gamepad one.
  swapConfirmCancel: boolean;
  // suitColor picks how many colors distinguish the four suits when
  // rendering cards (specs/screens/settings.md).
  suitColor: SuitColor;
  // focusFirst picks which card gets app-managed focus first when it
  // becomes the human player's turn and trading is available: the
  // pot's or the hand's center card (specs/screens/settings.md,
  // specs/controller.md).
  focusFirst: FocusFirst;
}

export const defaultSettings: Settings = {
  soundsEnabled: true,
  difficulty: "moderate",
  swapConfirmCancel: false,
  suitColor: "four",
  focusFirst: "pot",
};

function isDifficulty(value: unknown): value is Difficulty {
  return typeof value === "string" && (DIFFICULTIES as readonly string[]).includes(value);
}

function isSuitColor(value: unknown): value is SuitColor {
  return typeof value === "string" && (SUIT_COLORS as readonly string[]).includes(value);
}

function isFocusFirst(value: unknown): value is FocusFirst {
  return typeof value === "string" && (FOCUS_FIRSTS as readonly string[]).includes(value);
}

// loadSettings reads Settings from storage, falling back to
// defaultSettings when nothing is stored, or what's stored isn't valid
// JSON for a Settings object.
export function loadSettings(storage: Storage): Settings {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === null) {
    return { ...defaultSettings };
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return { ...defaultSettings };
    }
    const p = parsed as Record<string, unknown>;
    if (typeof p.soundsEnabled === "boolean") {
      // swapConfirmCancel, difficulty (which replaced the older
      // bot1/bot2/bot3 fields), suitColor, and focusFirst all postdate
      // soundsEnabled -- a value saved before any of them existed
      // falls back to its default instead of invalidating the rest of
      // an otherwise-valid settings blob.
      const swapConfirmCancel = typeof p.swapConfirmCancel === "boolean" ? p.swapConfirmCancel : defaultSettings.swapConfirmCancel;
      const difficulty = isDifficulty(p.difficulty) ? p.difficulty : defaultSettings.difficulty;
      const suitColor = isSuitColor(p.suitColor) ? p.suitColor : defaultSettings.suitColor;
      const focusFirst = isFocusFirst(p.focusFirst) ? p.focusFirst : defaultSettings.focusFirst;
      return { soundsEnabled: p.soundsEnabled, difficulty, swapConfirmCancel, suitColor, focusFirst };
    }
  } catch {
    // Falls through to the default below.
  }
  return { ...defaultSettings };
}

// saveSettings writes settings to storage as JSON.
export function saveSettings(settings: Settings, storage: Storage): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
