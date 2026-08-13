// Pure logic for the Licenses screen (specs/gui.md's "Licenses"
// section): ordering the list box and picking its default selection.
// Kept separate from main.ts's DOM wiring so it's unit-testable
// without a browser, same as botAssignment.ts/dealOrder.ts.

import type { LicenseEntry } from "./licensesData.ts";

// DEFAULT_LICENSE_NAME is the entry selected, with its text already
// shown, when the Licenses screen is first opened.
const DEFAULT_LICENSE_NAME = "Rumble-31";

// sortedLicenses orders entries alphabetically by name, for the list
// box display order.
export function sortedLicenses(entries: readonly LicenseEntry[]): LicenseEntry[] {
  return [...entries].sort((a, b) => a.name.localeCompare(b.name));
}

// defaultLicense returns the entry the list box should start
// selected on, per DEFAULT_LICENSE_NAME -- falling back to the first
// alphabetically sorted entry if that name isn't present (not
// expected in practice, but leaves the screen usable rather than
// blank).
export function defaultLicense(entries: readonly LicenseEntry[]): LicenseEntry | undefined {
  const sorted = sortedLicenses(entries);
  return sorted.find((e) => e.name === DEFAULT_LICENSE_NAME) ?? sorted[0];
}
