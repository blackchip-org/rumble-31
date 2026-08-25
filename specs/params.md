# params

For debugging the game, the web GUI accepts URL parameters to adjust
settings or to pre-populate state. Those parameters are as follows:

## strikes

Set the number of strikes initially given for each player. This is a sequence
of four characters, where the first is for seat 0, the second for seat 1, the
third for seat 2, and the fourth for seat 3. For example, "strikes=1121" will
give each seat a strike except for seat 2, which gets two. A seat given 3 or
more strikes starts the game already eliminated. If that seat is seat 0, the
game is over before it starts: no rounds are played at all.

Each character is normally a digit, but may instead be "s" or "S" to give
that seat 3 strikes with an active, unused second chance (specs/rules.md)
instead of starting eliminated -- its strike indicators show XX/ rather than
XXX. For example, "strikes=s000" starts seat 0 on 3 strikes with a second
chance still in hand, one more strike away from elimination.

## north, south, east, west, pot

Used to immediately start a new game and pre-populate a player's hand
or the pot. This should use card notation and always contain three cards.
For example:

    north=7s8h9c

Populates North's starting hand with a seven of spades, an eight of hearts,
and a nine of clubs. When this happens, the rules are as follows:

- An initial deck is constructed
- Assigned cards are given out first to the specified players and/or pot
- Deck is then shuffled with the remaining cards
- Dealing happens like normal, but those who already have cards are skipped

Note that in this specific case, the dealing is not animated. The game
should immediately start.

## turn

The player that should start first. Value should be a seat name (north,
south, etc). This overrides the normal random choice of dealer
(specs/rules.md) for the game's first round: the dealer is taken to be
the active seat immediately counter-clockwise of the forced seat, so
later rounds still rotate the dealer sensibly from there.

By default, the forced seat's turn is not treated as the round's first
turn (so, for example, Take Pot as a trade is legal, and the seat isn't
tagged "First" in the GUI). Add first=true to instead treat it as the
round's actual first turn. first is only valid alongside turn.

## first

Only valid alongside turn. Value should be "true" or "false". See turn
above.

## screen

Start at this screen immediately. The value is a screen identifier as
listed in gui.md. Identifiers are at the end of the screen headings in
parentheses.

Each screen should work without throwing an error when started through this
parameter. Screens should make reasonable defaults to accommodate. The
exception, of course, is the error screen itself. That should show a
mock error in that case.

For the game over screen (over), the "You Won!" / "Game Over" message
is derived from the strikes parameter: if seat 0 already starts
eliminated (3 or more strikes), the message is "Game Over"; otherwise
it is "You Won!".

For the game menu screen (menu), with no saved game to show, a
placeholder game state is synthesized from the strikes parameter
(defaulting to no strikes) and the currently selected difficulty
(specs/screens/difficulty.md) -- the same "reasonable defaults"
approach as the over screen above. Resuming from that placeholder
starts a game with an empty log, same as any other debug-seeded game.

For the settings screen (settings), reaching it through this
parameter always shows the "Main Menu" back button, same as reaching
it from the Main screen -- see specs/screens/settings.md.

For the application info screen (appinfo), reaching it through this
parameter shows it directly regardless of platform, saved state, or
whether the game is already running standalone -- normally all three
gate whether it's shown at all (specs/screens/appinfo.md). Combine
with platform below to see a specific platform's instructions.

## clear

Value should be "true" or "false" (default "false" if omitted).
clear=true clears saved state (specs/state.md), same as every other
debug parameter, but on its own -- with no north/south/east/west/pot
seeding a game -- it also lands on the Main Screen instead of
starting a game, since there is nothing left to resume. Combined
with a game-seeding parameter, that parameter's normal behavior
takes over as usual.

## platform

Value should be "ios", "android", or "other". Overrides the
Application Info screen's own User-Agent-based detection of whether
it is shown at all and which platform's install instructions it
displays (specs/screens/appinfo.md), so that behavior can be
exercised without a real iOS or Android device. Combine with
screen=appinfo to see a specific platform's instructions directly,
for example "?platform=ios&screen=appinfo". platform=other never
shows the screen through normal navigation, same as a desktop
browser.

## showBots

Value should be "true" or "false" (default "false" if omitted).
showBots=true shows each bot seat's skill level (specs/bots_v3.md) next to
its seat name on the Game screen, as a parenthesized initial: " (N)" for
Novice, " (A)" for Advanced, " (E)" for Expert -- for example "West
(A)". South's seat label is never affected, since South is always the
human player.

## seedStats

Value should be "true" or "false" (default "false" if omitted).
seedStats=true replaces the current bot version's saved stats
(specs/stats.md) with a plausible, fully-populated test dataset
covering every difficulty and bot skill level, then saves it
immediately -- for checking the Stats screen's (specs/screens/stats.md)
layout without having to actually play games. Combine with
screen=stats to land there directly, for example
"?seedStats=true&screen=stats".

## botLog

Value should be a comma-separated list of bot seat names (north,
south, east, west). "botLog=north" enables bot decision logging
(specs/bots_v4.md's "Decision Logging") for just that seat;
"botLog=north,west" enables it for both. South is always the human
player, so naming it has no effect. Defaults to no seats enabled when
omitted.

A name's case controls the level of detail logged for that seat: an
all-lowercase name ("north") logs at the Summary level, while a name
starting with an uppercase letter ("North" or "NORTH") logs at the
Full Trace level -- see specs/bots_v4.md's "Decision Logging" for what
each level logs. "botLog=north,West" logs North at Summary and West
at Full Trace.

## age

Value should be a non-negative number of minutes. Pretends that saved
state (specs/state.md) was written this many minutes ago, for testing
specs/state.md's stale Over screen behavior without waiting five real
minutes or hand-editing local storage.

Unlike every other debug parameter, age does not clear saved state,
and saved state is still loaded and restored as it would be on a bare
visit -- but only when age is the only parameter present. Combined
with any other parameter, age is inert and every parameter's normal
behavior (including clearing saved state) applies as usual.

If there is no saved state, or its screen is not `over`, age has no
effect.


