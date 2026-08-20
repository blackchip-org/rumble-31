---
name: proofread-docs
description: Proofread this repo's markdown documentation (README.md, CLAUDE.md, toolchain.md, how-to-play.md, and everything under specs/ and assets/) for spelling errors, grammar errors, and internal data inconsistencies in lists or tables, then propose and apply fixes. Use this whenever the user asks to check spelling, check grammar, proofread the docs, look for typos, or review the specs/docs for errors — even if they only name one file, since a full sweep is cheap and catches cross-file inconsistencies. Do not use this for short UI strings in src/web (button labels, headings) — those are intentionally terse, not prose, and flagging them produces noise. Do not use this for code comments or commit messages.
---

# Proofread Docs

Find and fix spelling errors, grammar errors, and internal inconsistencies
in this repo's markdown documentation, the same way a careful human editor
would read it: mechanically first, then closely.

## Scope

Read every markdown file in the repo root plus everything under `specs/`
and `assets/` — that's `README.md`, `CLAUDE.md`, `toolchain.md`,
`how-to-play.md`, `specs/**/*.md`, and `assets/**/*.md`. If the user names
one specific file, still check it in the context of this full sweep rather
than in isolation — several past fixes here were only obvious by comparing
a doc against a related one (e.g. a tile-sheet description in `assets/`
against how it's actually used).

Leave two things alone:

- **`src/web` UI strings** (button labels, headings, short prompts). These
  are deliberately terse — "Keep Hand", "Game Over" — not prose, and
  grammar rules for sentences don't apply to them. Proofreading them
  produces false positives, not fixes.
- **The embedded CC0 license text in `assets/sounds/SoundEffects.md`**. It's
  third-party legal boilerplate copied verbatim from Creative Commons —
  don't "fix" its wording even if something reads oddly, since altering
  license text changes its legal meaning.

## Step 1: Grep sweep for common typos

Run a first pass with a wordlist grep — this catches the most common typos
cheaply, before the slower close reading in Step 2:

```bash
grep -rnE "\b(teh|recieve|seperate|occured|definately|accross|wich|thier|noticable|priviledge|independant|maintainance|calender|refering|untill|becuase|beleive|foward|neccessary|alot|existant|paramenter|accomodate|Identifer|folliwng|freind|goverment|apparant|arguement|acheive|concious|embarass|greatful|humourous|liason|mispell|occassion|persistant|posession|reccommend|relevent|succesful|tommorow|wierd)\b" -i README.md CLAUDE.md toolchain.md how-to-play.md specs assets 2>/dev/null
```

This wordlist is a starting point, not a ceiling — if Step 2 turns up a
typo pattern not on this list, it's still in scope, the grep just won't
catch it for you automatically.

## Step 2: Close read for grammar and consistency

Read each file in full and look for what a wordlist can't catch:

- **Missing apostrophes on possessives** — "a players hand" should be "a
  player's hand", "at a players turn" should be "at a player's turn".
- **Wrong word form** — a noun where a verb was needed or vice versa (e.g.
  "for each playing" where "for each player" was meant), a preposition
  swapped for a similar-looking word ("Note that is this case" instead of
  "Note that in this case").
- **Subject-verb agreement** — "Over screen show with..." instead of
  "Over screen shown with...".
- **Missing or wrong punctuation** — a run-on sentence that needs a
  semicolon or period where a spec lists "X depending on Y these are:"
  without anything joining the two clauses.
- **Internal data inconsistencies** — this repo's specs and assets docs
  describe layouts, tables, and enumerated lists (e.g.
  `assets/images/cards.md`'s tile-sheet column descriptions). Read
  these for self-consistency, not just wording: if a list pairs
  "filled/outlined" with "light/dark" and
  one row breaks the pattern with no explanation, that's very likely a
  transcription error worth flagging even though it isn't a spelling or
  grammar issue. Use judgment here — only flag a break in a clear,
  established pattern, not every list entry that merely looks unusual.

Trailing whitespace and line-wrapping are worth cleaning up opportunistically
if you're already editing a line, but they're not the point of this pass —
don't go hunting for them separately.

## Step 3: Propose, then apply

Before editing, list every fix you found as a short "found X, going to
change to Y" line per issue, grouped by file, so the user can see the full
set at a glance. Then apply them with Edit.

For anything that's ambiguous — a phrasing that might be intentional, an
apparent data inconsistency you're not fully sure about — ask before
changing it rather than guessing, the same way the joker tile's light/dark
label needed a confirmation before being treated as a data fix rather than
a stylistic one.

## Step 4: Report

Summarize what changed per file (a one-line diff description each), and
call out anything you noticed but deliberately left alone (e.g. an
ambiguous phrasing you weren't sure about, or something in the excluded
scope) so the user knows it was seen, not missed.
