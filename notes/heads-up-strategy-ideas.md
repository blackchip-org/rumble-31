# Ideas: Heads Up-specific bot strategies

Four ideas for making the v4 bots play Heads Up (specs/bots_v4.md's
Heads Up section, 1 opponent remains) better than they do today,
where it's identical to Standard except for the danger-4/5 exclusion
in `headsUpStrategy` (`src/bot/v4/strategies.ts`). Came up while
looking for ways to widen Expert's edge specifically in that state,
as a companion to `notes/strike-aware-expert-strategy.md`'s broader
strike-awareness idea.

Each is meant to be explored independently, in its own session --
they don't depend on each other except where noted.

## How to measure

The simulator's `--strat` flag now accepts two letters (e.g.
`--strat=ae`) to play exactly those two bots against each other, every
round of every game, with the other two seats starting pre-eliminated
-- so every decision runs through Heads Up from the round's first
turn instead of it being a rare state buried inside a 4-bot game (see
`src/sim/simulate.ts`'s `runHeadsUpSimulation`, documented in
toolchain.md). This is the tool to use for measuring any of the ideas
below; the old 4-bot `aaee`-style table dilutes a Heads Up-only change
into near-total noise (confirmed while exploring idea 1).

Before/after comparison: pin `--seed`, change the code, run
`--strat=XX` at both `--games=20000` or more, `git stash` (or
`git checkout --`) just the changed file, re-run identically for the
baseline, then diff. See `.claude/skills/run-simulator/` for the full
method.

## 1. Lower/raise the Heads Up knock threshold for Expert -- explored

Rationale: a knock only gives the single remaining opponent one shot
to beat it in Heads Up, versus 2-3 opponents in Standard, so knocking
earlier seemed like it might be free safety margin worth cashing in.

Tested by giving `SkillConfig` a `headsUpKnockScoreThreshold` field
(defaulting equal to `knockScoreThreshold` for Novice/Advanced,
overridden for Expert only) and swapping it into `headsUpStrategy`'s
`knockPhase` call. Swept against Advanced with
`npm run simulate -- --games=20000 --seed=42 --strat=ae`:

| threshold | Expert win % |
|---|---|
| 27 (raised) | 55.2% |
| 25 (baseline, unchanged) | 55.75% |
| 23 | 55.78% |
| 21 | 55.9% |
| 20 | 55.0% |
| 18 | 52.2% -- Advanced takes the lead (53.0%) |

Flat within noise from 21-27. Below ~20 it degrades sharply: knocking
early banks a mediocre score before Expert's own Improve Hand logic
gets a chance to keep polishing the hand, which costs more than the
single-opponent safety margin is worth. No free win rate on this
lever at any threshold tried -- the code was reverted rather than
committed. Worth revisiting only with a smarter trigger (e.g.
conditioning the lower threshold on something other than a flat
score, like lap number or opponent behavior) rather than a flat
threshold move.

## 2. Read the opponent via `observe()`

With only one opponent, their public trade history is a real signal:
taking the pot on their first turn suggests a weak dealt hand,
re-trading the same hand slot repeatedly suggests they're hunting a
specific suit, and going quiet for several turns suggests they've
plateaued. `PublicTurn`/`observe` already exist on the `Strategy`
interface for exactly this (`src/game/types.ts`), and v3's Expert
already built known-cards/neighbor-tracking machinery on top of them
(`src/bot/v3/helpers.ts`'s `applyKnownCards`/`NeighborTracker`) -- v4
just never carried anything like it forward. Could bias Knock (knock
sooner against a modeled-weak opponent) and the Improve Hand pot
exchange threshold based on the modeled read.

This is the most powerful of the four ideas and the most expensive to
build -- it needs new per-seat state tracked across a round (and
reset between rounds), not just a threshold tweak.

## 3. Extend the danger exclusion to tier 3 (30.5)

Today Heads Up only excludes danger 4/5 candidates (pot would hit
31/32) from Improve Hand and Discard. A danger-3 pot (30.5) is
guaranteed to land in front of the *one* remaining opponent next turn
-- no second, weaker opponent to dilute the risk the way Standard's
2-3 opponents do -- so it may deserve exclusion in Heads Up even
though it's an acceptable risk in Standard. Implementation is a small
change to `excludeDangerous`/`forcedTradePool` (`src/bot/v4/
candidates.ts`) to take a threshold instead of a hardcoded >=4, with
Heads Up passing 3.

Worth checking whether this should apply to all three skill levels
(Novice's danger score is always zero anyway, so it's really an
Advanced/Expert question) or Expert only, matching idea 1's scoping.

## 4. Sequence strike-awareness to target Heads Up first

`notes/strike-aware-expert-strategy.md` proposes adjusting Expert's
thresholds when it's near elimination (one strike from being struck
out), but scoped across every strategy. Its payoff is biggest in a
pure duel -- the strike always goes to exactly one of two players in
Heads Up, with no dilution across 3-4 players the way Standard has --
so implementing it for Heads Up alone first would be cheaper than the
full multi-strategy version (still needs `PlayerView` extended with
strikes/leniency state, per that note's "Caveats") and likely
captures most of the benefit before deciding whether to generalize it.

## Status

Idea 1 explored and shelved (no benefit at any threshold tried).
Ideas 2-4 not yet pursued. Revisit individually using the `--strat=XX`
heads-up simulator mode described above.
