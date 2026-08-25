# Game Over Screen (over)

At the end of the round, if the delay timer expires, instead of proceeding
to the next round, navigate to the game over screen. Background for now
is black.

The entire contents of the screen are in a panel that is centered both
horizontally and vertically on the screen. In big white lettering, say either
"You Won!" or "Game Over" with each word on its own line.

Below the title is a badge with two lines: a small caption naming the
difficulty the game was played at (specs/screens/difficulty.md's
"Easy", "Moderate", or "Hard" -- whichever difficulty was actually
rolled, if it came from the Difficulty screen's "Random" button)
above South's finish for this game in larger text: "First Place",
"Second Place", "Third Place", or "Fourth Place". The place is the
same 1-based value already tracked for the log (specs/log.md's "Game
over: X place" line) and the Stats screen's Rankings tile
(specs/screens/stats.md) -- including that spec's tie rule, where
going out together with one or more bots places South as if they'd
been eliminated alone. The badge is tinted per place, reusing the
Stats screen's Rankings colors for First/Second/Third (gold/silver/
bronze) plus a fourth, neutral tone for last place, which the Stats
screen itself never shows.

Below the badge is a table of South's result against each bot seat:

| Seat  | Skill    | Result |
| ----- | -------- | ------ |
| West  | Advanced | Win    |
| North | Novice   | Loss   |
| East  | Expert   | Tie    |

South itself is never a row -- the table is South's result against
each individual bot, not a bot-vs-bot ranking, so there's nothing to
say about South's own seat. Skill is that seat's bot skill level
(specs/bots_v3.md). Result is one of Win, Loss, or Tie, based on
elimination timing between South and that bot specifically:

- Both South and the bot lasted to the very end of the game -- Tie.
- The bot lasted to the end and South didn't -- Loss.
- South lasted to the end (or was among those tied for it) and the
  bot didn't -- Win.
- Both were eliminated during the game: if they were eliminated in
  the very same round, Tie; if the bot was eliminated in an earlier
  round, Win.

A bot can never be eliminated in a *later* round than South: once
South is eliminated, the game ends immediately for the player, even
if other bots are still active (specs/rules.md's normal play stops
there rather than continuing to determine a winner among them) -- so
there's no global final ranking to draw on, only this seat-by-seat
comparison.

Below the table is a tally of how many of the three results were
Wins, Losses, and Ties. Below that are three buttons:

- Play Again
- Main Menu
- Save Log

Clicking on "Play Again" starts a new game at the same difficulty
(specs/screens/difficulty.md) as the game just played, without
showing the Difficulty screen -- except that if that difficulty came
from the Difficulty screen's "Random" button, a fresh random
difficulty is rolled instead. Clicking on Main Menu returns the user
to the Main screen. Clicking on Save Log lets the user save a text
file containing the log from the game just played.
