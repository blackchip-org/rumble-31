# stats

The following stats are collected and are stored in local storage. Stats
are only valid for a given bot version. When the bot version changes, don't 
discard the older stats, create a new set of stats. 

When computing wins, losses, and ties against other bots' skill levels,
these are computed in the following way. At the end of the round:

- If a bot is eliminated but the human player remains, the human is given
a win over that bot
- If a player is eliminated, the human player receives a loss against all
remaining bots
- If a bot and human player are eliminated at the same time, the human player
receives a tie against that bot

Place is determined based on how many bots remain at the end of the game.
First place is 0, Second place is 1, etc. If a human and bot are eliminated
at the same time, the place is scored as if only the human was eliminated.

Abandoning a game (see "Games abandoned" below) is scored the same way as
the human player being eliminated: the human receives a loss against every
bot still active at the moment of abandonment (never a tie, since no bot is
ever eliminated by an abandonment), and the game is assigned a place using
those same still-active bots, feeding Wins per place, Rating, and the
streaks below exactly as a completed game would.

Stats can be normalized. If a stat can easily be derived from one or more
other stats. 

## Global Stats

- Games played: Incremented anytime a new game is started
- Win, Loss, Tie records per bot skill
- Games abandoned: Incremented anytime a game is abandoned. For scoring
purposes, an abandoned game is exactly like the round ending immediately
with the player being eliminated (see above).

## Per Difficulty Setting

- Wins per place (First, Second, Third, Fourth)
- Rating: A score between 0 and 1000. This is the average of place wins
(1st = 3, 2nd = 2, 3rd = 1, 4th = 0), and scaled up to 0 - 1000. No
separate game count is tracked for this: it's computed directly from
the Wins per place counts above (their sum is the number of games the
average is over), per the normalization note above.
- Win, Loss, Tie records per bot skill
- Current and best streaks for the following:
    - First place
    - Top two place
    - Not last place

Current streaks should include the date the streak started and the best
streaks should include the day the streak ended, both as calendar dates
(no time of day). While a streak is current (not yet broken), it is also
the best streak seen so far at that length, so its end date keeps moving
forward each time it extends; that end date stops changing once the
streak breaks.

- Wins by strikes: incremented once per game the human player actually
wins (never for a loss, and never for an abandoned game -- see "Games
abandoned" above), in exactly one of four buckets based on the human
player's own strike count at the moment the game was won: Zero
strikes, One strike, Two strikes, or Second chance. Second chance
covers every win with three or more strikes, which is only reachable
via the once-per-game leniency in the last section of "Rules of Rumble
31" -- reaching three strikes without it is an elimination, not a win.
- Rounds played: incremented once for every round that actually
finishes playing at that difficulty, whether or not the game it's part
of is later abandoned. Abandoning a game ends it without playing
another round, so an abandonment itself never adds to this count.
- Best: incremented every round the human player is awarded that
round's best-score tag (the highest score among that round's hands,
ties included -- see "The total point value" in specs/rules.md),
whether or not the game it's part of is later abandoned.
- Best with 32 / Best with 31 / Best with 30.5: the same event as
Best above, but only when the human player's winning score that round
was exactly 32, exactly 31, or exactly 30.5 (specs/rules.md's scoring
exceptions). Each is a subset of Best, not tracked separately from it.

The stats above are all simple counts, so, per the normalization note
above, the Overall tab's grand totals for them are just the sum of
their Easy/Moderate/Hard values -- nothing new is separately tracked at
the Global level for them.

