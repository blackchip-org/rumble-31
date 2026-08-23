# Stats Screen (stats)

Contents should be in a panel centered horizontally and vertically.

Main header shows "Stats".

Below the header are four tabs: "Overall", "Easy", "Moderate", and
"Hard". Exactly one tab is active at a time; clicking a tab switches
which one's content is shown below it. The screen remembers which tab
was showing the last time it was visited and reopens on that same
tab; if it's never been visited this session, it opens on "Overall".

Below the tabs is a single panel showing the active tab's content.
This panel is a fixed height, so switching tabs never moves the
header, tabs, or "Main Menu" button below it: a tab whose content is
shorter than the panel leaves blank space below it, and a tab whose
content is taller than the panel scrolls within it.

The "Overall" tab shows the Global Stats (specs/stats.md):

- Totals: Games played, Rounds played (summed across Easy/Moderate/
  Hard, specs/stats.md), and Bot opponents faced -- Games played
  multiplied by three, since every game seats exactly three bots.
- Games abandoned, shown as a small note below those numbers rather
  than as its own headline number.
- Record vs. Bots: the total Wins, Losses, Ties, and Win% summed
  across every bot skill level, and, below those, a table with one
  row each for Novice, Advanced, and Expert showing that skill's own
  Wins, Losses, Ties, and Win%. Win% is Wins divided by total games
  (Wins + Losses + Ties), shown as a percentage to one decimal place.
- Wins by strikes, summed across Easy/Moderate/Hard (specs/stats.md):
  Zero strikes, One strike, Two strikes, and Second chance.
- Rounds, summed across Easy/Moderate/Hard (specs/stats.md): Best,
  with its Best with 32 / Best with 31 / Best with 30.5 breakdown.

Each of the "Easy", "Moderate", and "Hard" tabs shows that
difficulty's Per Difficulty Setting stats (specs/stats.md):

- Totals: Games played (the sum of the Wins per place counts below),
  Rounds played, and Bot opponents faced -- Games played multiplied by
  three, since every game seats exactly three bots.
- Rating, shown as a number out of 1000 alongside a filled gauge bar
  proportional to that number.
- Rankings, shown as three tiles -- First, Second, and Third -- each
  showing that place's win count. First is tinted gold, Second
  silver, and Third bronze.
- Record vs. Bots: the total Wins, Losses, Ties, and Win% summed
  across every bot skill level at that difficulty, and, below those,
  a table breaking that same record down by skill (Novice/Advanced/
  Expert), same as the Overall tab's, except a row for a skill never
  seated at that difficulty (specs/bots.md's Difficulty mapping) shows
  a dash in each column instead of a permanent zero.
- The three streaks (specs/stats.md): First place, Top two, and Not
  last. Each shows its current streak (its length, and, once it has
  started, the date it started) and its best streak (its length, and,
  once one has been reached, the date it was last extended). A current
  streak still going is visually distinct from one that has broken.
- Wins by strikes (specs/stats.md): Zero strikes, One strike, Two
  strikes, and Second chance.
- Rounds (specs/stats.md): Best, with its Best with 32 / Best with 31
  / Best with 30.5 breakdown.

A "Main Menu" button is shown below the tabbed panel. Clicking it
navigates back to the Main Screen.

The screen shows stats for the bot version currently in effect
(specs/bots.md); merely viewing this screen never records or changes
any stat.

Which screen the player is on is saved and restored the same as every
other screen (specs/state.md); the Stats screen is one of them.
