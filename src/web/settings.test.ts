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
    {
      name: "valid stored value",
      stored: { "rumble31.settings": '{"soundsEnabled":false,"bot1":"regular","bot2":"difficult","bot3":"easy","swapConfirmCancel":true}' },
      want: { soundsEnabled: false, bot1: "regular", bot2: "difficult", bot3: "easy", swapConfirmCancel: true },
    },
    {
      name: "value saved before swapConfirmCancel existed: falls back to its default, keeps the rest",
      stored: { "rumble31.settings": '{"soundsEnabled":false,"bot1":"regular","bot2":"difficult","bot3":"easy"}' },
      want: { soundsEnabled: false, bot1: "regular", bot2: "difficult", bot3: "easy", swapConfirmCancel: false },
    },
    { name: "malformed JSON: falls back to defaults", stored: { "rumble31.settings": "not json" }, want: defaultSettings },
    { name: "JSON missing soundsEnabled: falls back to defaults", stored: { "rumble31.settings": '{"bot1":"easy","bot2":"easy","bot3":"easy"}' }, want: defaultSettings },
    { name: "JSON with wrong type for soundsEnabled: falls back to defaults", stored: { "rumble31.settings": '{"soundsEnabled":"yes","bot1":"easy","bot2":"easy","bot3":"easy"}' }, want: defaultSettings },
    { name: "JSON missing bot1: falls back to defaults", stored: { "rumble31.settings": '{"soundsEnabled":true,"bot2":"easy","bot3":"easy"}' }, want: defaultSettings },
    { name: "JSON with invalid bot2 value: falls back to defaults", stored: { "rumble31.settings": '{"soundsEnabled":true,"bot1":"easy","bot2":"nightmare","bot3":"easy"}' }, want: defaultSettings },
  ];

  for (const c of cases) {
    const got = loadSettings(memoryStorage(c.stored));
    assert.deepEqual(got, c.want, c.name);
  }
});

test("saveSettings round-trips through loadSettings", () => {
  const storage = memoryStorage();
  const settings: Settings = { soundsEnabled: false, bot1: "difficult", bot2: "regular", bot3: "easy", swapConfirmCancel: true };
  saveSettings(settings, storage);
  assert.deepEqual(loadSettings(storage), settings);

  saveSettings(defaultSettings, storage);
  assert.deepEqual(loadSettings(storage), defaultSettings);
});
