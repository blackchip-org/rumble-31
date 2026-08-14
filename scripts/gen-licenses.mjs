import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(repoRoot, "licenses.json"), "utf8"));

// unwrap turns a plain-text license file's hard-wrapped paragraphs
// (wrapped to some fixed column, e.g. 78 chars) back into one line
// per paragraph, so the GUI's text area can wrap them itself to
// whatever width it's actually rendered at, instead of double-wrapping
// the source file's own line breaks inside a wider box. Blank lines
// (one or more) are kept as single paragraph breaks; everything else
// in a paragraph is joined with a space.
function unwrap(text) {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((para) =>
      para
        .split("\n")
        .map((line) => line.trim())
        .join(" ")
        .trim(),
    )
    .join("\n\n")
    .trim();
}

const entries = manifest.map((entry) => ({
  name: entry.name,
  license: entry.license,
  text: unwrap(readFileSync(join(repoRoot, entry.text), "utf8")),
}));

const outPath = join(repoRoot, "src", "web", "licensesData.ts");
const body = `export interface LicenseEntry {
  name: string;
  license: string;
  text: string;
}

export const licenses: LicenseEntry[] = ${JSON.stringify(entries, null, 2)};
`;
writeFileSync(outPath, body);

const SEPARATOR = "-".repeat(80);

const txtEntries = manifest
  .map((entry) => ({
    name: entry.name,
    license: entry.license,
    source: entry.text,
    fullText: readFileSync(join(repoRoot, entry.text), "utf8")
      .replace(/\r\n/g, "\n")
      .trim(),
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

const txtBody =
  txtEntries
    .map(
      (entry) =>
        `${entry.name}\nLicense: ${entry.license}\nSource: ${entry.source}\n\n${entry.fullText}`,
    )
    .join(`\n\n${SEPARATOR}\n\n`) + "\n";

writeFileSync(join(repoRoot, "licenses.txt"), txtBody);
