// User-configurable settings (specs/gui.md's Settings Screen), persisted
// to a Storage (localStorage in the browser) as a single JSON blob.

import { DIFFICULTIES, type Difficulty } from "../config.ts";

const STORAGE_KEY = "rumble31.settings";

export interface Settings {
  soundsEnabled: boolean;
  difficulty: Difficulty;
  // swapConfirmCancel swaps which button confirms vs. cancels for
  // controller/keyboard navigation (specs/controller.md), for players
  // used to a Nintendo-style layout instead of the default W3C
  // Standard Gamepad one.
  swapConfirmCancel: boolean;
}

export const defaultSettings: Settings = { soundsEnabled: true, difficulty: "moderate", swapConfirmCancel: false };

function isDifficulty(value: unknown): value is Difficulty {
  return typeof value === "string" && (DIFFICULTIES as readonly string[]).includes(value);
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
      // swapConfirmCancel and difficulty (which replaced the older
      // bot1/bot2/bot3 fields) both postdate soundsEnabled -- a value
      // saved before either existed falls back to its default instead
      // of invalidating the rest of an otherwise-valid settings blob.
      const swapConfirmCancel = typeof p.swapConfirmCancel === "boolean" ? p.swapConfirmCancel : defaultSettings.swapConfirmCancel;
      const difficulty = isDifficulty(p.difficulty) ? p.difficulty : defaultSettings.difficulty;
      return { soundsEnabled: p.soundsEnabled, difficulty, swapConfirmCancel };
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
