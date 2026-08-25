# Idea: give Expert strike-awareness (not yet pursued)

Came up while looking for ways to widen Expert's edge over Advanced
(see the `aaee` combo -- currently ~10-14pp in Expert's favor across
seeds, already measured before any of this). Advanced and Expert run
almost the same algorithm today, differing only in small threshold
nudges (see `SKILL_CONFIGS` in `src/bot/v4/strategies.ts`) and a
mistake-rate gap. Every idea that's just "tune the numbers further"
has produced small effects (the pairs-before-pot-score reorder moved
`aaee` by about +0.1pp). The bigger lever is giving Expert something
Advanced can't have by construction: awareness of the strikes
scoreboard, not just its own hand and the current pot.

## The core idea

Right now every skill level's thresholds (knock score, exchange
score, danger tolerance) are static -- a bot at 0 strikes and a bot
one strike from elimination play identically. Adjust Expert's
thresholds based on whether it's currently "at risk" of elimination.

## Defining "at risk"

Per `specs/rules.md`'s strike rules: reaching 3 strikes only
eliminates a player if someone else already claimed the one-time
second chance; otherwise their own 3rd strike grants *them* the
leniency and they're safe until a 4th. So "one strike from
elimination" precisely means:

- strikes == 2 and someone else has already used the second chance, or
- strikes == 3 and this player has already used their own second chance

That's derivable from game state, but `PlayerView` doesn't carry
strikes or leniency-used today (only hand/pot/lap/opponentCount/
isFirstTurnOfRound/isLastTurn). Threading that through is the real
implementation cost here, not the strategy logic itself.

## What would change when at risk

1. **Lower the knock threshold.** Staying in past your hand's peak is
   only risky because a future forced Discard (when nothing improves)
   can *degrade* your hand -- Discard doesn't check for improvement,
   it's forced to trade regardless. A bot with strikes to spare can
   shrug that off; a bot one strike from elimination can't afford to
   gamble a good-enough hand against a forced bad trade two turns
   later. Knock sooner, bank the score.

2. **Extend Heads Up's danger-4/5 exclusion into Standard.** Danger
   tier 4/5 isn't really "the opponent gets a good score" -- it's the
   round ending abruptly, cutting off everyone's remaining turns,
   including your own future chances to fix a weak hand. Comfortable
   bots can tolerate that; a bot on the brink, still holding a bad
   hand, can't afford to be the one who accidentally triggers the
   round-ending trade before its own hand is fixed.

3. **Raise the Hand Selection cutoff.** Expert currently exchanges a
   dealt hand of 16 or less. At risk, holding a mediocre-but-not-
   terrible hand (17-20) is more dangerous than usual, so it's worth
   grabbing the pot more often.

## Caveats

- This only activates during the relatively rare stretch of a game
  where someone's actually on the brink of elimination, so it
  probably won't move the aggregate `aaee` win rate as much as the
  plumbing effort might suggest. Worth measuring early rather than
  assuming it's a big lever.
- Needs a `specs/bots_v4.md` addition before implementation (a new
  per-skill rule keyed on strike/leniency state), plus extending
  `PlayerView` and whatever builds it in `src/game/` to expose
  strikes and leniency-used, which today only lives on the `Game`/
  round state.

## Status

Not implemented. Revisit if/when we want to keep pushing Expert's
edge past what pure threshold tuning gets us.
