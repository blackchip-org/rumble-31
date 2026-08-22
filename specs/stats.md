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

