# Expert Win Probability Knock trigger (implemented, perf decision pending)

Came out of a long design conversation about giving Expert exact
opponent-hand deduction (the pot is always public, so every opponent
trade reveals exactly what left and entered their hand -- not a
probability, a certainty) and using it to estimate whether knocking
right now would avoid a strike. Landed on an "independent combine"
estimator: per active opponent, enumerate their few unknown hand slots
and model their best possible reply to the live pot, then combine each
opponent's beat-probability as `1 - product(1 - beatProbability)` --
the chance of not being beaten by every opponent at once, which is
what avoiding a strike actually requires (specs/rules.md: only the
lowest score is struck). A standalone prototype validated this against
exact joint enumeration (near-identical accuracy, much cheaper) before
any of it touched the real bot code.

## What's implemented

- `specs/bots_v4.md`: new "Opponent Tracking" and "Win Probability"
  sections, plus a new Expert-only trigger in the Knock phase (checked
  after the existing repeat-counter and hand-score-threshold checks,
  before the failsafe lap) -- knock once win probability is > 0.5.
- `src/bot/v4/opponentTracking.ts`: the per-seat known-card tracker,
  built from `Strategy.observe(PublicTurn)`.
- `src/bot/v4/winProbability.ts`: the independent-combine estimator.
- `src/bot/v4/phases.ts`, `strategies.ts`, `factory.ts`: wiring --
  `SkillConfig.winProbabilityThreshold` is `0.5` for Expert, `undefined`
  for Novice/Advanced (skips the check and the tracker entirely).
- Unit tests: `opponentTracking.test.ts`, `winProbability.test.ts`,
  plus additions to `phases.test.ts`. All pass, along with the full
  existing suite (`npm test`, `npm run typecheck`).

## Status: uncommitted

Every file above is still sitting uncommitted in the working tree --
this note is what's committed, not the feature itself. Also present
but unrelated: `scratch-win-prob.ts` at the repo root, leftover
prototyping scaffolding from before the real implementation existed,
safe to delete whenever.

## Measured behavior: working as intended

Seeded before/after comparison (`git stash` the change, rerun the
same seed/games, restore), `--metrics`, 500 games each, seed 42:

| Combo | Expert win % before -> after | Knocks before -> after |
|---|---|---|
| eeee | 27.4/27.6/23.6/25.4 -> 26.6/25.2/26.0/26.6 | 2659->2721, 2641->2684, 2598->2665, 2677->2727 |
| eeea | 30.0/29.8/22.8 -> 28.0/26.8/26.4 (advanced 21.2->24.2) | 2736->2830, 2674->2730, 2638->2694 |
| naee | expert 30.6/32.0 -> 28.4/34.0 (novice 16.4->14.8, advanced 25.2->27.0) | 2802->2889, 2861->2961 |
| ee (heads up) | 55.8/52.0 -> 55.2/52.6 | 2578->2614, 2589->2625 |

Win rates stay within normal 500-game noise everywhere (no clear
win/loss shift) -- same win-rate-neutral-but-behavior-visible pattern
as the earlier ace-hoarding tiebreak. Every Expert slot in every combo
knocked 1.4%-3.5% more often, confirming the trigger actually fires
and does what it's meant to.

## The problem: simulator performance regression

| Combo (500 games) | Before | After | Slowdown |
|---|---|---|---|
| eeee | 1.07s | 36.99s | 34.6x |
| eeea | 1.07s | 28.62s | 26.7x |
| naee | 1.08s | 21.02s | 19.5x |
| ee (heads up) | 0.86s | 7.20s | 8.4x |

Much worse than the standalone prototype's "~15-35ms per decision"
suggested. The gap: the win-probability check runs on *every*
Knock-phase turn that gets past the cheap repeat-counter/hand-score
checks -- for Expert (repeat threshold 5, score threshold 25), that's
often many turns per round, each paying up to a ~2,600-combo-per-
opponent exact enumeration, especially early in a round before
Opponent Tracking has deduced enough to shrink it. Heads up scales
much better (only one opponent to enumerate, matching the standalone
prototype's own finding that opponent count -- not knowledge state --
drives cost).

Practically: `npm run simulate -- --games=1000` on the full 15-combo
table would now take many minutes whenever Expert appears in multiple
combos, versus seconds today. That's a real regression to the tool
used constantly for this kind of tuning work (see
`notes/knock-score-sweep.md`, `notes/strike-aware-expert-strategy.md`
for other examples of leaning on it), not just a synthetic-benchmark
concern.

## Decision needed

Cheapest to implement first:

1. **Sampling fallback above a combo-count cap.** Bring back a
   capped/sampled mode (like the standalone prototype had) only for
   the expensive 0-1-known-cards cases; 2+ known stays exact since
   it's already cheap.
2. **Reduce call frequency.** E.g. only start checking win probability
   once the repeat counter is nonzero, or every other turn, instead of
   from a round's very first Knock-phase turn.
3. **Leave it as-is.** Accept Expert-heavy simulator runs are slower,
   document the cost, use a smaller `--games` count for Expert-
   involving combos.

## Status

Feature works, cost doesn't -- pick a direction above before writing
more code here. The existing unit tests check correctness at the
current exact/uncapped level and won't be invalidated by whichever
direction gets picked, but a sampling fallback would need its own new
tests.
