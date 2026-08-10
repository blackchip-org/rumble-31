import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const version = "0.1";

// loadBuildTime reads the timestamp stamped by `npm install`'s prepare
// script (scripts/gen-buildtime.mjs). Falls back to "unknown" if it
// hasn't been generated yet.
export function loadBuildTime(): string {
  try {
    const stampPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "buildstamp.json");
    const data = JSON.parse(fs.readFileSync(stampPath, "utf8")) as { buildTime?: string };
    return data.buildTime ?? "unknown";
  } catch {
    return "unknown";
  }
}
