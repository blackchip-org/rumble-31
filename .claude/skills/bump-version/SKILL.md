---
name: bump-version
description: Increment the app's displayed version number by one. Use when the user asks to bump, increment, or raise the version (e.g. "bump the version", "/bump-version"). This is the version shown on the About screen and in the game-log welcome line (src/version.ts) — not package.json's npm version, which isn't referenced anywhere in the app and is out of scope for this skill.
---

# Bump Version

Increment the integer version string in `src/version.ts` by one, and keep
`specs/version.md` in sync with it.

## Step 1: Read the current version

Read `src/version.ts`. It contains exactly one export:

```ts
export const version = "0";
```

Parse the string as an integer. If it isn't a plain non-negative integer
(e.g. someone hand-edited it to `"0.1"` or `"1.0.0-beta"`), stop and ask the
user how to proceed instead of guessing — this skill only knows how to bump
a plain integer.

## Step 2: Write the incremented version

Edit `src/version.ts`, replacing the string with the current value + 1:

```ts
export const version = "1";
```

## Step 3: Update the spec

Read `specs/version.md`. It states the current version in prose, e.g.:

```
The current version is 0.
```

Edit that line to match the new value (`The current version is 1.`). Leave
the rest of the file untouched.

## Step 4: Report the result

Tell the user the old and new version numbers and which two files changed.
Do not commit — leave that to the user's own commit workflow (per this
repo's CLAUDE.md, commits happen only after the user approves a commit
message).
