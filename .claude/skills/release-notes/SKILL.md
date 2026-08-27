---
name: release-notes
description: Generate user-facing release notes from the diff between the top of main and the last git tag, then (after the user approves the wording) prepend a new dated section to CHANGELOG.md. Use when the user asks to write, generate, or draft release notes, or to update the changelog for the latest release. Notes describe what a player of the app would notice — new features, rule/UI changes, bug fixes — not internal refactors, tooling, tests, docs, or dev-only scripts.
---

# Release Notes

Draft a concise, player-facing summary of what changed between the last
git tag and the top of `main` (i.e. everything released since the last
tag but not yet tagged), get the user's sign-off on the wording, then
prepend it to `CHANGELOG.md` at the repo root.

If the user instead asks for notes between two specific tags (or any
other explicit range), use that range for Steps 3 onward instead of the
default described here.

## Step 1: Find the latest tag

```bash
git for-each-ref refs/tags --sort=-creatordate --format='%(refname:short) %(creatordate:short)'
```

Take the top line as the latest tag. Sort by creation date, not
tag-name string order, since that's robust even if tags aren't named in
strict sequence.

If there are no tags, stop and tell the user there's nothing to diff
against yet.

## Step 2: Check for an already-existing entry

Read `CHANGELOG.md` if it exists. If it already has a section for the
version currently in `src/version.ts` (the version at the top of
`main`), tell the user and ask whether to regenerate (replace) that
section or stop — don't silently duplicate or overwrite.

## Step 3: Gather the changes

```bash
git log <latest-tag>..HEAD --oneline
```

Then read the full diff for context on anything whose user-facing effect
isn't obvious from the commit message alone:

```bash
git diff <latest-tag>..HEAD -- src/
```

Scope the diff to `src/` (the game engine and web GUI) — that's where
player-visible behavior lives. Changes confined to `.claude/`, `specs/`,
`scripts/`, test files, CI config, or dev tooling (the simulator's
internals, permission allowlists, etc.) are implementation detail, not
release notes material.

## Step 4: Filter to what a player would notice

For each commit, decide whether it's in scope:

**Include:**
- New features or screens
- Changes to game rules, bot behavior, or scoring
- UI/UX changes (layout, wording, visual redesigns)
- Bug fixes that affected actual gameplay or the visible app

**Exclude:**
- Refactors with no behavior change
- Test additions/changes
- Documentation and spec-only edits
- Dev tooling, CI, simulator internals, build scripts
- Anything scoped only to `.claude/` (skills, settings, permissions)

When a commit's title alone doesn't make its user-facing effect clear,
check the diff before deciding — don't guess from the title only, and
don't include it "just in case." If nothing in the range is player-facing,
tell the user that and don't write an empty or padded-out entry.

## Step 5: Draft the notes

Write short, flat bullet points in plain language a player would
understand — no file names, function names, or implementation
mechanics. Say what changed for them, not how it was built. Group
related bullets together if there are enough of them to warrant it
(e.g. "New", "Changed", "Fixed"); for a small release, a flat bullet
list is fine.

Use the version number currently in `src/version.ts` at the top of
`main`, and today's date, to build the section header:

```markdown
## Version 9 - 2026-08-25

- Short, concrete bullet describing a player-visible change.
- Another one.
```

## Step 6: Get approval before writing anything

Show the drafted section to the user in chat and ask them to approve it
before touching `CHANGELOG.md`. Revise based on their feedback and
re-confirm if they ask for changes. Do not write the file until they
approve.

## Step 7: Prepend to CHANGELOG.md

Once approved, add the section to the **top** of `CHANGELOG.md` (newest
release first), immediately below the `# Changelog` title. If the file
doesn't exist yet, create it:

```markdown
# Changelog

## Version 9 - 2026-08-25

- ...
```

If regenerating an existing section (from Step 2), replace it in place
rather than adding a duplicate.

## Step 8: Report the result

Tell the user the file was updated and which version/date section was
added or replaced. Don't commit — leave that to the user's own commit
workflow (per this repo's CLAUDE.md, commits happen only after the user
approves a commit message).
