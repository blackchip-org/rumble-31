---
name: bump-bot-version
description: Increment the shared bot strategy version number by one. Use when the user asks to bump, increment, or raise the bot version (e.g. "bump the bot version"). This tracks the Novice/Advanced/Expert strategies together (src/bot/version.ts, specs/bots.md) -- it is separate from the app's own version (src/version.ts), which is the bump-version skill's job. The caller decides whether a bump is warranted; this skill just does it.
---

# Bump Bot Version

Increment the integer version string in `src/bot/version.ts` by one,
and keep `specs/bots.md` in sync with it.

## Step 1: Read the current version

Read `src/bot/version.ts`. It contains exactly one export:

```ts
export const botVersion = "0";
```

Parse the string as an integer. If it isn't a plain non-negative
integer, stop and ask the user how to proceed instead of guessing --
this skill only knows how to bump a plain integer.

## Step 2: Write the incremented version

Edit `src/bot/version.ts`, replacing the string with the current
value + 1:

```ts
export const botVersion = "1";
```

## Step 3: Update the spec

Read `specs/bots.md`. Its "Bot version" section states the current
value in prose, e.g.:

```
The current bot version is 0.
```

Edit that line to match the new value (`The current bot version is
1.`). Leave the rest of the file untouched.

## Step 4: Report the result

Tell the user the old and new bot version numbers and which two files
changed. Do not commit -- leave that to the user's own commit
workflow (per this repo's CLAUDE.md, commits happen only after the
user approves a commit message).
