// User-configurable settings (specs/gui.md's Settings Screen), persisted
// to a Storage (localStorage in the browser) as a single JSON blob.

const STORAGE_KEY = "rumble31.settings";

export interface Settings {
  soundsEnabled: boolean;
}

export const defaultSettings: Settings = { soundsEnabled: true };

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
    if (typeof parsed === "object" && parsed !== null && "soundsEnabled" in parsed && typeof (parsed as { soundsEnabled: unknown }).soundsEnabled === "boolean") {
      return { soundsEnabled: (parsed as { soundsEnabled: boolean }).soundsEnabled };
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
