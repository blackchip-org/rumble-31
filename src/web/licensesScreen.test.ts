import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultLicense, sortedLicenses } from "./licensesScreen.ts";
import type { LicenseEntry } from "./licensesData.ts";

const entries: LicenseEntry[] = [
  { name: "New Rocker Font", license: "OFL-1.1", text: "new-rocker-text" },
  { name: "Rumble-31", license: "MIT", text: "rumble-31-text" },
  { name: "Comic Neue Font", license: "OFL-1.1", text: "comic-neue-text" },
];

test("sortedLicenses orders entries alphabetically by name", () => {
  const got = sortedLicenses(entries).map((e) => e.name);
  assert.deepEqual(got, ["Comic Neue Font", "New Rocker Font", "Rumble-31"]);
});

test("sortedLicenses does not mutate its input", () => {
  const before = entries.map((e) => e.name);
  sortedLicenses(entries);
  assert.deepEqual(
    entries.map((e) => e.name),
    before,
  );
});

const defaultLicenseCases = [
  { name: "picks Rumble-31 when present", entries, want: "Rumble-31" },
  {
    name: "falls back to the first sorted entry when Rumble-31 is absent",
    entries: entries.filter((e) => e.name !== "Rumble-31"),
    want: "Comic Neue Font",
  },
  { name: "undefined for an empty list", entries: [] as LicenseEntry[], want: undefined },
];

test("defaultLicense", () => {
  for (const c of defaultLicenseCases) {
    const got = defaultLicense(c.entries);
    assert.equal(got?.name, c.want, c.name);
  }
});
