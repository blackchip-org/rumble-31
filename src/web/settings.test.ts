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
      stored: {
        "rumble31.settings": '{"soundsEnabled":false,"difficulty":"hard","swapConfirmCancel":true,"suitColor":"two","focusFirst":"hand"}',
      },
      want: { soundsEnabled: false, difficulty: "hard", swapConfirmCancel: true, suitColor: "two", focusFirst: "hand" },
    },
    {
      name: "value saved before swapConfirmCancel, suitColor, and focusFirst existed: falls back to their defaults, keeps the rest",
      stored: { "rumble31.settings": '{"soundsEnabled":false,"difficulty":"hard"}' },
      want: {
        soundsEnabled: false,
        difficulty: "hard",
        swapConfirmCancel: false,
        suitColor: defaultSettings.suitColor,
        focusFirst: defaultSettings.focusFirst,
      },
    },
    {
      name: "value saved before difficulty existed (old bot1/2/3 fields): falls back to default difficulty, keeps the rest",
      stored: { "rumble31.settings": '{"soundsEnabled":false,"bot1":"regular","bot2":"difficult","bot3":"easy","swapConfirmCancel":true}' },
      want: {
        soundsEnabled: false,
        difficulty: defaultSettings.difficulty,
        swapConfirmCancel: true,
        suitColor: defaultSettings.suitColor,
        focusFirst: defaultSettings.focusFirst,
      },
    },
    { name: "malformed JSON: falls back to defaults", stored: { "rumble31.settings": "not json" }, want: defaultSettings },
    { name: "JSON missing soundsEnabled: falls back to defaults", stored: { "rumble31.settings": '{"difficulty":"easy"}' }, want: defaultSettings },
    { name: "JSON with wrong type for soundsEnabled: falls back to defaults", stored: { "rumble31.settings": '{"soundsEnabled":"yes","difficulty":"easy"}' }, want: defaultSettings },
    {
      name: "JSON with invalid difficulty value: falls back to default difficulty, keeps the rest",
      stored: { "rumble31.settings": '{"soundsEnabled":true,"difficulty":"nightmare"}' },
      want: {
        soundsEnabled: true,
        difficulty: defaultSettings.difficulty,
        swapConfirmCancel: defaultSettings.swapConfirmCancel,
        suitColor: defaultSettings.suitColor,
        focusFirst: defaultSettings.focusFirst,
      },
    },
    {
      name: "JSON with invalid suitColor value: falls back to default suit color, keeps the rest",
      stored: { "rumble31.settings": '{"soundsEnabled":true,"suitColor":"three"}' },
      want: {
        soundsEnabled: true,
        difficulty: defaultSettings.difficulty,
        swapConfirmCancel: defaultSettings.swapConfirmCancel,
        suitColor: defaultSettings.suitColor,
        focusFirst: defaultSettings.focusFirst,
      },
    },
    {
      name: "JSON with invalid focusFirst value: falls back to default focus first, keeps the rest",
      stored: { "rumble31.settings": '{"soundsEnabled":true,"focusFirst":"pile"}' },
      want: {
        soundsEnabled: true,
        difficulty: defaultSettings.difficulty,
        swapConfirmCancel: defaultSettings.swapConfirmCancel,
        suitColor: defaultSettings.suitColor,
        focusFirst: defaultSettings.focusFirst,
      },
    },
  ];

  for (const c of cases) {
    const got = loadSettings(memoryStorage(c.stored));
    assert.deepEqual(got, c.want, c.name);
  }
});

test("saveSettings round-trips through loadSettings", () => {
  const storage = memoryStorage();
  const settings: Settings = { soundsEnabled: false, difficulty: "hard", swapConfirmCancel: true, suitColor: "two", focusFirst: "hand" };
  saveSettings(settings, storage);
  assert.deepEqual(loadSettings(storage), settings);

  saveSettings(defaultSettings, storage);
  assert.deepEqual(loadSettings(storage), defaultSettings);
});
