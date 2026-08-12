import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const now = new Date();
const day = now.getDate();
const month = now.toLocaleString("en-US", { month: "short" });
const year = now.getFullYear();
const hh = String(now.getHours()).padStart(2, "0");
const mm = String(now.getMinutes()).padStart(2, "0");
const buildTime = `${day} ${month} ${year} at ${hh}:${mm}`;

const outPath = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "buildstamp.ts");
writeFileSync(outPath, `export const buildTime = ${JSON.stringify(buildTime)};\n`);
