import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

// unwrap turns how-to-play.md's hard-wrapped paragraphs (wrapped to a
// fixed column per CLAUDE.md's 80-char line limit) back into one line
// per paragraph, so the How to Play screen's text area can wrap them
// itself to whatever width it's actually rendered at, same fix as
// gen-licenses.mjs's unwrap. Blocks containing a "- " list keep one
// item per output line instead -- a wrapped item's continuation
// lines are rejoined onto that same item -- so bullets don't get
// merged into a single run-on line.
function unwrap(text) {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split("\n").map((line) => line.trim());
      if (!lines.some((line) => line.startsWith("- "))) {
        return lines.join(" ").trim();
      }
      const items = [];
      for (const line of lines) {
        if (line.startsWith("- ")) {
          items.push(line);
        } else {
          items[items.length - 1] += ` ${line}`;
        }
      }
      return items.join("\n");
    })
    .join("\n\n")
    .trim();
}

const text = unwrap(readFileSync(join(repoRoot, "how-to-play.md"), "utf8"));

const outPath = join(repoRoot, "src", "web", "howToPlayData.ts");
writeFileSync(outPath, `export const howToPlayText: string = ${JSON.stringify(text)};\n`);
