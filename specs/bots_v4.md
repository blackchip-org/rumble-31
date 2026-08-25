# Bots

This is the specification for version 4 of the bots implementation.

## Skill Levels

There are three different bots based on its skill level:

- Novice
- Advanced
- Expert

## Bot version

The v4 strategies share their bot version number with v3's, tracked
in src/bot/version.ts. Since the web GUI and the simulator's default
strategy (toolchain.md) now run v4, the number bumps when a v4
strategy file changes -- src/bot/v4/candidates.ts, phases.ts,
strategies.ts, or factory.ts -- rather than a v3 file. v3 keeps its
last version number frozen (specs/bots_v3.md), since from here on it
is only run by the simulator's `--bot-version=v3` comparison mode.

The current bot version is 5.

## Trade Candidates

When considering trading a card from the hand to a card in the pot, there
are nine possible trades (each card in the hand can be traded with any
three cards in the pot making nine). The following metrics are calculated
to aid in evaluating candidates:

- Hand score: The score of the hand after the trade completes
- Danger score: How safe is the pot after trading, see below
- Pot score: The score of the pot after the trade completes
- Pairs: 1 if the hand contains a pair after the trade, 0 otherwise
- Random: A randomized number used as a last-resort tiebreaker

Some trades with the pot should be avoided when possible and are assigned a
danger score. Those values are as follows:

- 5: Pot value would be 31 (next player will immediately end the game)
- 4: Pot value would be 32 (next player will have the best score)
- 3: Pot value would be 30.5 (next player will take pot)
- 2: Pot value would be >= 27 (next player will take pot)
- 1: Card to give to the pot is an Ace (next players might take and get a 31)
- 0: No special consideration

Not all skill levels will use all metrics and those values should be set
to zero in that case -- see each phase's per-skill breakdown below.

Candidates should be sorted according to the above metrics in the order
listed above. Higher value is better for all values except for pot score
and danger score, where lower is better (danger score is a risk scale --
0 is safest, 5 is worst). Highest scoring candidate should be first in
the list.

## Random Values

Sometimes, random numbers are used here so that the strategy doesn't appear
to the human as "locked" to a certain value which can then be exploited.
When there is rand(x) notated, that means to choose a random integer
between 0 and x inclusive.

## Phases

Strategies have sequence of phases that are checked to determine what
action the bot should take. These phases are:

- Mistake: Determine if the bot should make a mistake this turn
- Hand Selection: Only for when the bot goes first. Determines if the bot
should keep its hand or to exchange with the pot.
- Improve Hand: Act if there is an eligible trade or exchange that improves
the score of the hand
- Knock: If the hand cannot be improved, decide if it is time to knock
- Discard: Trade is forced, determine which trade is the best here

### Mistake

Each bot skill is configured with a variable that determines how often a
mistake should happen. This is a percentage in the range of 0 to 1, where
0 is to never make a mistake, and 1 is to always make a mistake.

The chance is Novice 0.2, Advanced 0.05, Expert 0 -- Expert never
makes a mistake.

If it is determined that a mistake should be made, a mistake site is
chosen uniformly at random among the decision points the current turn's
strategy (see "Strategies" below) actually lists -- e.g. 1-of-3 for
Standard/Heads Up (Improve Hand, Knock, Discard), 1-of-1 for First (Hand
Selection) and Knocked (Improve Hand; Always Knock never hosts a
mistake, since there is no wrong way to unconditionally knock). This
keeps every listed point equally likely to be where the mistake shows up
on a turn that has one, rather than always landing on whichever point is
evaluated first.

Every point strictly before the chosen site is forced to fall through
(as if it found nothing to do), regardless of what it would have
normally decided, so the chosen site is always reached and a rolled
mistake is never silently wasted. The chosen site itself then applies
its own mistake behavior in place of its normal decision, described
under that phase below. Every point after the chosen site decides
normally.

Each phase below describes both its normal decision and, if it is
chosen as the mistake site, what it does instead.

### Hand Selection

The hand selection phase determines if the bot, when first to act, should keep
the hand dealt to it or to exchange for the pot. The determination here is:

- Novice: Exchange 25% of the time if the hand scores less than 28
- Advanced: Exchange only if the hand contains three cards of different suits
- Expert: Exchange if the hand scores 16 or less

If there is a mistake, consume it, and then choose the opposite action
that the expert would have taken.

### Improve Hand

The improve hand phase determines if the bot can either exchange with
the pot or trade a card with the pot. Trade candidates should be calculated
discarding any candidate where the hand score is less than or equal to the
current hand score. The value of the pot and hand should also be calculated.

If taking the pot improves the hand and its value is greater than the
highest trade candidate's hand value, first see if a pot exchange is eligible:

- Novice: Score of the pot must be >= 28
- Advanced: Score of the pot must be >= 27
- Expert: Score of the pot must be >= 26

If the pot meets that criteria, the action is to exchange the pot.

When trade candidates are calculated, take into consideration:

- Novice: Danger score is zero, Pairs is zero
- Advanced: Danger score is calculated, Pairs is zero
- Expert: Danger score is calculated, Pairs is calculated

If there are trade candidates, take the top one as the action.

If this phase is the mistake site, ignore the pot-exchange check above
entirely and, among the same improving trade candidates, pick one
uniformly at random instead of taking the top one. If there are no
improving candidates to pick from, the mistake has nothing to act on
and this phase falls through as normal.

### Knock

The knock phase determines if the bot should knock when the hand cannot be
improved. Right now, that condition is if the hand score is at or above
the current knock threshold.

The bot also keeps track of the best score it has had so far and a
repeat counter. At the end of its turn, if the hand score is higher than
its best score, set the best score to the hand score and the repeat
counter to zero. If instead, the hand score is the same as the best score,
increment the repeat score by one.

First, check the repeat counter. Knock under the following conditions:

- Novice: repeat counter >= 2
- Advanced: repeat counter >= 3
- Expert: repeat counter >= 5

Next check the knock thresholds:

- Novice: Hand score is >= 27
- Advanced: Hand score is >= 26
- Expert: Hand score is >= 25

As a failsafe, the bot should knock on lap 10 + rand(3)

If this phase is the mistake site, do not knock this turn regardless of
whether any of the above conditions are met -- fall through instead.

### Discard

The discard phase determines which card to trade for when forced to make
a move. Trade candidates should be calculated and the topmost candidate
should be selected.

When trade candidates are calculated, take into consideration:

- Novice: Danger score is zero, Pairs is zero
- Advanced: Danger score is calculated, Pairs is zero
- Expert: Danger score is calculated, Pairs is calculated

If this phase is the mistake site, pick a candidate uniformly at random
from all nine instead of the topmost one. Discard is always reached with
a forced trade to make, so unlike Improve Hand this mistake always has
candidates to pick from.

## Strategies

There are four different strategies that the bot may follow depending
on the state of the game. They are:

- First: When the bot is the first to act in a round
- Standard: Main strategy when 2 or 3 opponents remain
- Heads Up: Strategy for when only 1 opponent remains
- Knocked: Followed when another player has knocked

### First

The first strategy is used on a bot's turn if it is the first to act
for the current round. The phases in this strategy are:

- Mistake
- Hand Selection

### Standard

The standard strategy is used on other turns when 2 or 3 opponents remain
and a player has not yet knocked. The phases in this strategy are:

- Mistake
- Improve Hand
- Knock
- Discard

### Heads Up

The heads up strategy is used on other turns when only 1 opponent remains
and that opponent has not yet knocked. The phases in this strategy are:

- Mistake
- Improve Hand
- Knock
- Discard

### Knocked

This strategy is used when a player has knocked. At this point, there is
only one more opportunity to improve the hand. The phases are:

- Mistake
- Improve Hand
- Always Knock

## Decision Logging

For debugging, a bot seat's decision-making process can be logged
per-turn, in addition to the normal game log (specs/log.md). This is
off by default and enabled per seat: in the web GUI via the `botLog`
URL parameter (specs/params.md), or in the headless simulator via the
`--bot-log` flag (toolchain.md). It only applies to v4 bots -- v3 is
not instrumented.

Decision log lines are written after that turn's "Seat's turn"/"Seat
goes first" line (specs/log.md) and before the line describing the
chosen action (e.g. "Seat trades...", "Seat knocks"), so they read as
the bot's thinking during that turn. Each line is prefixed `[bot]`
so it's easy to tell apart from the player-facing game log, and is
never written to the saved log file (specs/log.md's "save the log"
feature).

There are two levels of detail: Summary and Full Trace. Which one a
seat gets is controlled by the case of its name in `botLog`/
`--bot-log` above -- an all-lowercase name ("north") logs at Summary,
while a name starting with an uppercase letter ("North" or "NORTH")
logs at Full Trace.

### Summary

One line naming the phase that produced the turn's action and the
figure that justified it:

    [bot] Seat: Hand Selection -- exchange for pot (hand score 14)
    [bot] Seat: Hand Selection -- keeps hand (hand score 24)
    [bot] Seat: Improve Hand -- exchange for pot (pot score 27)
    [bot] Seat: Improve Hand -- trades [7h] for [8d] (hand 24 -> 27)
    [bot] Seat: Knock -- knocks (repeat counter 3 >= 3)
    [bot] Seat: Knock -- knocks (failsafe lap 11)
    [bot] Seat: Always Knock -- knocks
    [bot] Seat: Discard -- trades [Ah] for [2c]

### Full Trace

Every phase the seat's active strategy (see "Strategies" above)
evaluates, in the order it's evaluated, whether it acted or fell
through to the next phase, and why -- citing the specific rule from
"Phases" above and the actual values compared. For example:

    [bot] Seat (Mistake): no mistake (chance 0.05)
    [bot] Seat (Hand Selection): exchange for pot (hand score 14 <= 16)
    [bot] Seat (Improve Hand): pot exchange not eligible (pot score 24 < 27)
    [bot] Seat (Improve Hand): candidates ranked --
    [bot] Seat (Improve Hand):  [7h]->[8d]: hand 27, danger 0, pot 24, pairs 0
    [bot] Seat (Improve Hand):  [7h]->[9d]: hand 26, danger 0, pot 25, pairs 0
    [bot] Seat (Improve Hand): trades [7h] for [8d]
    [bot] Seat (Knock): repeat counter 1 < 3, hand score 24 < 26
    [bot] Seat (Discard): candidates ranked --
    [bot] Seat (Discard):   [Ah]->[2c]: hand 24, danger 1, pot 20, pairs 0
    [bot] Seat (Discard): trades [Ah] for [2c]

If the Mistake phase determines a mistake should be made, the phases
before the chosen site say they were skipped for it, and the site
itself says so and names the mistaken choice taken, e.g. a mistake
landing on Knock:

    [bot] Seat (Mistake): mistake made
    [bot] Seat (Improve Hand): skipped (mistake happens at a later phase this turn)
    [bot] Seat (Knock): mistake -- fails to knock
    [bot] Seat (Discard): candidates ranked --
    [bot] Seat (Discard):   [Ah]->[2c]: hand 24, danger 1, pot 20, pairs 0
    [bot] Seat (Discard): trades [Ah] for [2c]

Or landing on First's only point, Hand Selection:

    [bot] Seat (Mistake): mistake made
    [bot] Seat (Hand Selection): mistake -- keeps hand (opposite of Expert)

When a trade-candidate list is logged (Improve Hand and Discard), list
every candidate that survives that phase's own filtering (for Improve
Hand, that's candidates whose hand score improves -- see "Improve
Hand" above), sorted per "Trade Candidates" above, one per line.

The final line for whichever phase produces the turn's action states
the action taken and doubles as Full Trace's own summary -- no
separate Summary-style line is written in this mode.








