import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultSettings, loadSettings, saveSettings, type Settings } from "./settings.ts";

// memoryStorage returns a minimal in-memory Storage — Node's test
// runner has no browser localStorage, and settings.ts only needs
// getItem/setItem.
function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    clear: () => data.clear(),
    key: (index: number) => Array.from(data.keys())[index] ?? null,
    get length() {
      return data.size;
    },
  } as Storage;
}

test("loadSettings", () => {
  const cases: Array<{ name: string; stored: Record<string, string>; want: Settings }> = [
    { name: "nothing stored: falls back to defaults", stored: {}, want: defaultSettings },
    { name: "valid stored value: sounds disabled", stored: { "rumble31.settings": '{"soundsEnabled":false}' }, want: { soundsEnabled: false } },
    { name: "valid stored value: sounds enabled", stored: { "rumble31.settings": '{"soundsEnabled":true}' }, want: { soundsEnabled: true } },
    { name: "malformed JSON: falls back to defaults", stored: { "rumble31.settings": "not json" }, want: defaultSettings },
    { name: "JSON missing soundsEnabled: falls back to defaults", stored: { "rumble31.settings": "{}" }, want: defaultSettings },
    { name: "JSON with wrong type: falls back to defaults", stored: { "rumble31.settings": '{"soundsEnabled":"yes"}' }, want: defaultSettings },
  ];

  for (const c of cases) {
    const got = loadSettings(memoryStorage(c.stored));
    assert.deepEqual(got, c.want, c.name);
  }
});

test("saveSettings round-trips through loadSettings", () => {
  const storage = memoryStorage();
  saveSettings({ soundsEnabled: false }, storage);
  assert.deepEqual(loadSettings(storage), { soundsEnabled: false });

  saveSettings({ soundsEnabled: true }, storage);
  assert.deepEqual(loadSettings(storage), { soundsEnabled: true });
});
