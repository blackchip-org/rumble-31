// User-configurable settings (specs/gui.md's Settings Screen), persisted
// to a Storage (localStorage in the browser) as a single JSON blob.

import { BOT_NAMES, type BotName } from "../bot/factory.ts";

const STORAGE_KEY = "rumble31.settings";

export interface Settings {
  soundsEnabled: boolean;
  bot1: BotName;
  bot2: BotName;
  bot3: BotName;
  // swapConfirmCancel swaps which button confirms vs. cancels for
  // controller/keyboard navigation (specs/controller.md), for players
  // used to a Nintendo-style layout instead of the default W3C
  // Standard Gamepad one.
  swapConfirmCancel: boolean;
}

export const defaultSettings: Settings = { soundsEnabled: true, bot1: "regular", bot2: "regular", bot3: "difficult", swapConfirmCancel: false };

function isBotName(value: unknown): value is BotName {
  return typeof value === "string" && (BOT_NAMES as readonly string[]).includes(value);
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
    if (typeof p.soundsEnabled === "boolean" && isBotName(p.bot1) && isBotName(p.bot2) && isBotName(p.bot3)) {
      // swapConfirmCancel postdates the other fields -- a value saved
      // before it existed falls back to its default instead of
      // invalidating the rest of an otherwise-valid settings blob.
      const swapConfirmCancel = typeof p.swapConfirmCancel === "boolean" ? p.swapConfirmCancel : defaultSettings.swapConfirmCancel;
      return { soundsEnabled: p.soundsEnabled, bot1: p.bot1, bot2: p.bot2, bot3: p.bot3, swapConfirmCancel };
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
