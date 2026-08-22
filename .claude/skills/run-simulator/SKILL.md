---
name: run-simulator
description: Run the headless bot-vs-bot simulator (npm run simulate) to compare Novice/Advanced/Expert bot skill levels (specs/bots.md), either a single 4-bot combo or the full table of every distinct combo, and how to measure a strategy code change's win-rate impact with a seeded, apples-to-apples before/after comparison. Use when the user asks to run simulations, benchmark bot performance, compare bot combos, or measure how a change to bot strategy code affects win rates.
---

# Run Simulator

The simulator (`src/sim/`) plays many independent bot-vs-bot games
headlessly and reports win rates. It has no build step — run it
directly with `npm run simulate`. Run `nvm use v24.19.0` first if the
shell isn't already on the right Node version — the system Node fails
`npm` commands in this project.

## Step 1: Decide single combo vs. the full table

- **Full table** (omit `--strat`): runs all 15 distinct 4-bot
  multisets (order-independent — `nnae` and `eann` are the same combo,
  reported once) and prints one row per combo. This is the default —
  always run it, even if the user's question sounds narrow (e.g. "is
  advanced still beating novice") — because Step 5's report is built from
  this table, including the head-to-head pairings it contains.
- **Single combo** (`--strat=XXXX`, four letters, one per bot slot: `n`
  novice, `a` advanced, `e` expert, e.g. `--strat=naea`): only use this
  in addition to the full table, when the user names an exact 4-bot
  matchup that isn't one of the three head-to-head combos below (e.g.
  `--strat=nnae`, mixing three skill levels). It doesn't replace the
  full-table run. Order picks slots, not seats — each game reseats the
  four bots randomly, so a slot's win rate reflects its strategy, not
  seating position.

```bash
npm run simulate -- --games=1000 --strat=naea
npm run simulate -- --games=1000
```

`--games` defaults to 1000 if omitted. More games narrows noise at
the cost of runtime; 1000 is a reasonable default, 5000+ for a change
with a small expected effect.

## Step 2: Add `--seed=N` for anything you'll compare or reproduce

Without `--seed`, the batch seed is derived from the clock, so two
runs play different games and their win rates aren't directly
comparable beyond noise. Pin `--seed` to any fixed integer whenever
the user wants a reproducible result or is going to run this more
than once for comparison:

```bash
npm run simulate -- --games=5000 --seed=42
```

## Step 3: Reading the full-table output

```
Played 5000 game(s) per combo (15 combos) with seed 42

Combo  Games  Bot 1  Bot 2  Bot 3  Bot 4  Ties  Avg Rounds
-----  -----  -----  -----  -----  -----  ----  ----------
nnnn   5000   25.1%  24.8%  25.3%  24.8%  0.2%  8.34
nnna   5000   23.0%  23.4%  22.9%  30.7%  0.1%  8.41
...
```

- `Combo` is the 4-letter skill-level label, sorted novice-first then
  advanced then expert (matches `--strat` syntax) — e.g. `nnna` is
  three novice bots and one advanced bot.
- `Bot N` columns line up with the N-th letter of `Combo`, so in
  `nnna` row, `Bot 4`'s win % is the advanced bot's win rate against
  three novice bots.
- `Ties` is the share of games with more than one simultaneous winner
  (every remaining seat eliminated on the same round).
- `Avg Rounds` is how long games in that combo tend to run.

For a single-combo run (`--strat=`), the output is a short plain-text
report instead of a table row, with the same win/tie/rounds numbers.

## Step 4: Before/after comparison for a strategy code change

This is the standard way to measure whether a change to
`src/bot/*.ts` (or `specs/bots.md`) actually moved the needle, used
throughout this repo's bot-strategy experiments. It only works
cleanly on a clean working tree — check `git status` first and let
the user know if there's unrelated uncommitted work in the way.

1. Pick a fixed `--seed` and `--games` count once, and reuse the exact
   same values for both runs — the whole comparison depends on both
   runs playing the identical sequence of shuffles/deals.
2. With the change in place, run the full table (or a targeted
   `--strat` including the changed skill level) and save the output.
3. `git stash` the change (or `git checkout -- <file>` if it's
   unstaged and you don't need to keep it staged), confirm
   `git status` shows the file reverted, then re-run the identical
   command and save that output as the baseline.
4. `git stash pop` to restore the change.
5. Diff the two outputs. Combos that don't include the changed
   skill level should be byte-identical between runs (same seed, same
   RNG stream) — if they aren't, the change wasn't properly isolated
   to the intended bot, and that's worth flagging before trusting the
   rest of the comparison. Combos that do include it show the actual
   win-rate delta.
6. Report the delta per affected combo, not just an aggregate — a
   change can help against one skill-level mix and hurt against
   another.

If a 15-combo table at the chosen `--games` is too slow to run twice,
drop to a smaller `--games` for both runs rather than narrowing to
fewer combos, so the comparison stays apples-to-apples across the
whole table.

## Step 5: Report results

Always report a fresh full-table run in this order — full table, then
head-to-head, then summary. Don't skip straight to a summary even for
a narrow question; the reader needs the numbers, not just the
conclusion.

1. **Full table.** Show the complete 15-combo output from Step 1
   (or the before/after tables from Step 4) as-is.
2. **Head-to-head.** Pull out the three combos that pit exactly two
   skill levels against each other two-seats-apiece — `nnaa` (novice vs.
   advanced), `nnee` (novice vs. expert), and `aaee` (advanced vs.
   expert) — and present each pairing's edge: sum the two seats'
   win rates for each skill level, then report the gap between them
   (the stronger skill level's combined win % minus the weaker's; 0pp
   is an even matchup, since two evenly-matched bots would split
   50/50). For example:

   ```
   Pairing          Novice  Advanced  Expert  Edge
   ----------------------------------------------------------
   nnaa (n v a)     41.2%   58.8%     --      Advanced +17.6pp
   nnee (n v e)     33.0%   --        67.0%   Expert +34.0pp
   aaee (a v e)     --      44.5%     55.5%   Expert +11.0pp
   ```

   These three rows are the cleanest read on relative skill-level
   strength, since every other combo mixes in a third or fourth
   skill level that dilutes the signal.
3. **Summary.** Close with a few sentences of plain-language
   synthesis — which skill level is strongest overall, how big the gaps
   are, and (for a before/after comparison) whether the change moved
   the needle in the intended direction. State deltas as numbers, not
   just "improved" or "regressed."
