---
name: find-license-files
description: Scan the repository for dedicated third-party license files (LICENSE, COPYING, NOTICE, *.OFL.txt, and similar) and regenerate the root-level licenses.json manifest that maps each licensed item (fonts, vendored assets, bundled third-party code, etc.) to its license type and license text path, then regenerate the generated src/web/licensesData.ts the app actually reads. Use this whenever the user asks to find, list, catalog, or inventory license files, wants to know what third-party assets need attribution, mentions licenses.json, or is preparing a repo for release/distribution and needs its licensing situation documented. Do not use this for auditing npm/package-manager dependency licenses (that's a different concern) — this skill is for license files that live in the repository itself.
---

# Find License Files

Produce `licenses.json` at the repository root: a JSON array of
`{ "name": ..., "license": ..., "text": ... }` objects, one per dedicated
license file found in the repo, where `name` is a human-readable name for
the thing the license covers, `license` is the license type (e.g. `"MIT"`,
`"OFL-1.1"`, `"GPL-3.0"`), and `text` is the license file's path relative
to the repo root (e.g. `"assets/ComicNeue.OFL.txt"`).

This only covers **dedicated license files** — a standalone file whose
content *is* a license (LICENSE, COPYING, NOTICE, an OFL file, etc.). It
does not cover inline SPDX headers or copyright comments embedded at the
top of source files — those are a different, much noisier signal and are
out of scope here.

Regenerate the file from scratch on every run; don't try to merge with
whatever `licenses.json` currently contains.

## Step 1: Find candidates deterministically

Run the bundled script from the repository root:

```bash
node .claude/skills/find-license-files/scripts/find-license-candidates.mjs
```

It walks the tree (skipping `node_modules`, `.git`, `.claude`, build output
directories, and binary files) and prints a JSON array of candidates, each
matched either by filename convention (`LICENSE`, `COPYING`, `NOTICE`,
`OFL`, in any casing or as part of a longer filename) or by a license-text
signature phrase found in the file's content (e.g. "Permission is hereby
granted, free of charge", "SIL OPEN FONT LICENSE"). Each candidate includes
a short content snippet and a `detectedType` — the script's own best-effort
SPDX-style guess (e.g. `"MIT"`, `"OFL-1.1"`, `"GPL-3.0"`) based on the same
kind of signature phrases, or `null` if it didn't recognize the text.

The script only finds files and takes a first pass at typing them — it
makes no judgment about naming or relevance. That's the next steps, and
it's why this is split into a script plus your own review rather than one
opaque pass: file-walking and matching known boilerplate is mechanical and
deterministic, but deciding what a license actually *covers*, and catching
the cases the script's phrase list doesn't recognize, takes context a
script doesn't have.

## Step 2: Confirm the license type

For each candidate, decide the `license` value:

- If `detectedType` is set, spot-check it against the snippet — the
  script's phrase matching is reliable for common licenses but can't cover
  every license's wording. Use it as-is if it looks right.
- If `detectedType` is `null`, or looks wrong, read the file (the snippet
  is truncated to 300 characters, so open the full file if you need more)
  and identify the license yourself. Prefer the standard SPDX identifier
  when the text matches a known license family; if it's a genuinely custom
  or unrecognizable license, use whatever name the file gives itself, or
  `"Custom"` as a last resort.

## Step 3: Name each licensed item

For each candidate, figure out what it's the license for. The filename and
its sibling files are usually enough — a `LICENSE` file sitting next to a
`.ttf`/`.otf` font is a font license, one at the repo root next to
`package.json` is the project's own license, one inside a vendored
directory covers that vendored library. When it's ambiguous, check:

- Sibling files in the same directory (what asset is this license next to?)
- The license snippet itself (it often names the licensed work directly)
- Any mention of the file/directory in `README.md` or `package.json`

Write a short, human-readable `name` — the kind of name you'd put in a
credits page, not a raw filename. `"Comic Neue Font"`, not
`"ComicNeue.OFL"`.

Skip a candidate if, on inspection, it isn't actually a dedicated license
file (the content-signature heuristic can false-positive on files that
merely *mention* a license in passing, e.g. a changelog entry).

## Step 4: Write licenses.json

Write the final array to `licenses.json` at the repository root, pretty-printed
with 2-space indentation, sorted by `text` path. Each entry has exactly
three fields, in this order:

```json
{
  "name": "Comic Neue Font",
  "license": "OFL-1.1",
  "text": "assets/ComicNeue.OFL.txt"
}
```

Overwrite any existing `licenses.json` — this is a full regeneration, not
an incremental update.

## Step 5: Regenerate the in-app license data

`licenses.json` is a source file, not what the app actually reads —
`src/web/licensesData.ts` is generated from it (embedding each license
file's text) and is what the About screen renders. Run this from the
repository root to bring it back in sync:

```bash
node scripts/gen-licenses.mjs
```

Run this every time, even if `licenses.json` didn't change — it's cheap,
and it keeps `src/web/licensesData.ts` from silently drifting.

Don't run `npm run prepare` for this — it also regenerates
`buildstamp.json` and the how-to-play data, which are unrelated to
licensing and would add noise to the diff.
