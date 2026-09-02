# State

The web GUI persists enough state to local storage that a user who
leaves the application (closing the tab, reloading the page) while a
game is in progress and later returns finds that game still running
rather than being dropped back at the Main Screen.

Only game-related screens are restored this way. Leaving from any other
screen -- the Main Screen itself, Difficulty, Settings reached from the
Main Menu, About, Licenses, How to Play, Stats, or the Game Over screen
-- returns to the Main Screen on the next visit; there is nothing
time-sensitive or effortful to lose on those screens.

State is saved as it changes, not just on exit. Saved state is
distinct from the Settings Screen's saved preferences
(specs/screens/settings.md, `rumble31.settings`), which have their
own separate storage and are never read, written, or cleared by
anything in this spec.

## What is stored

State is stored under a single local storage key, `rumble31.state`,
as one JSON object tagged with a schema version. If the stored value
is missing, unreadable, or written by an old schema version, it is
treated exactly like no saved state at all -- the application starts
fresh, the same as a first-ever visit.

The stored object records which screen is showing, as one of:

- `main` -- the marker every non-resumable screen writes (the Main
  Screen, Difficulty, About, Licenses, How to Play, Stats, the Game
  Over screen, and Settings reached from the Main Menu). It carries no
  other data; restoring it shows the Main Screen.
- `game` -- a game is in progress and being played.
- `menu` -- a game is in progress but paused behind the Game Menu (see
  "The Game Menu screen" below), including while the Settings screen
  reached from the Game Menu is showing.

The error screen and the Application Info screen are never recorded
(see "Error screen" and "Application Info screen" below).

For `game` and `menu`, the stored object also records, alongside the
screen:

- Each seat's strikes, elimination status, and second-chance status
  (specs/rules.md), the current round number, which seat holds the
  dealer button (specs/rules.md), and which bot skill level
  (specs/bots_v3.md) is seated at each of the three bot seats. The
  latter is fixed for the life of the game: it is chosen once, when
  the game starts, and does not change while the game is in progress.
- The log panel's lines, so the visible history and Save Log survive
  a reload.
- If a round is in progress: that round's checkpoint -- every active
  seat's current hand, the current pot, which seat acts next, whether
  that seat's turn is the round's first turn, whether a player has
  already knocked (or exchanged past the round's first turn) and which
  seat that was, and each bot seat's own round-scoped Knock bookkeeping
  (specs/bots_v4.md's "Knock" phase -- its best score seen this round,
  repeat counter, and failsafe lap), so a reload does not reset how
  close a bot is to knocking. Bots track nothing that persists across
  rounds, so there is no separate opponent-memory map to restore. This
  checkpoint is absent between rounds, when the next round has not been
  dealt yet.

A `menu` object holds exactly the fields listed for `game` above, read
back exactly as last saved for the `game` screen -- entering the Game
Menu does not create new game state, it re-tags the most recently
saved one under `menu` instead of `game`.

## When state is saved

State is written to local storage:

- On every screen transition (see specs/gui.md). A transition to the
  Game screen saves `game`; a transition to the Game Menu, or to the
  Settings screen reached from it, saves `menu`; every other screen
  transition saves the bare `main` marker.
- After every completed deal.
- After every completed turn.
- After every round ends (once that round's recap is applied, before
  the next round is dealt).
- When the game ends -- as the bare `main` marker, since the Game Over
  screen is not restored.

Settings changes are not covered by this spec; they continue to save
independently, as described in specs/screens/settings.md.

Saved state is only ever cleared outright -- as opposed to being
overwritten with a new value -- when the URL supplies valid debug
parameters (see "Interaction with debug parameters" below), when the
player abandons a game from the Game Menu, and when Settings' Reset
wipes all local storage. Navigating between screens never clears it.

## When state is restored

On a visit with no URL parameters at all:

- If the saved screen is `game`, the application resumes that game
  instead of showing the Main Screen. The saved strikes, eliminations,
  second-chance status, round number, dealer button, and bot seat
  assignment are restored -- the same three bot skill levels stay in
  the same seats they started the game in, rather than being reshuffled
  per specs/bots_v3.md's normal new-game behavior. If a
  round-in-progress checkpoint was saved, that round resumes from the
  checkpoint: hands and the pot are placed immediately with no deal
  animation (the same as the animation skip described in specs/params.md
  for the north/south/east/west/pot parameters), and the checkpoint's
  first-turn and knocked state are restored so the round ends under the
  same rules a freshly dealt round would. Each bot seat's round-scoped
  Knock bookkeeping is restored the same way, so a bot resumes exactly
  as close to knocking as it was before the reload rather than starting
  that round over blank. If no round-in-progress checkpoint was saved,
  the next round deals normally.
- If the saved screen is `menu`, the Game Menu screen is shown directly
  with the saved game state, restored the same way as the `game` screen
  above but without resuming play (see "The Game Menu screen" below).
  This covers leaving the page from the Game Menu itself and from the
  Settings screen reached from it.
- If the saved screen is `main`, or there is no saved state, or it is
  invalid, the application shows the Main Screen -- unless
  specs/screens/appinfo.md's Application Info screen conditions are also
  met, in which case that screen is shown instead (see "Application
  Info screen" below).

If the URL contains any parameter, saved state is not consulted at all
(see "Interaction with debug parameters" below).

## The Game Menu screen

Opening the Game Menu (or the Settings screen reached from it) stops
the in-progress game outright rather than pausing it in place: no
further bot turns, round-end pause, or sounds. "Resume" restarts the
Game screen from the last checkpoint saved before the Game Menu was
entered -- the same mechanism used to resume a game after a page
reload, described above -- so nothing is lost, but nothing in the
game's own log or checkpoint advances while the menu is shown, even
across a reload.

"Abandon" clears all saved state (as if local storage had been
wiped) and returns to the Main screen; the game cannot be resumed
after that.

## Interaction with debug parameters

If the URL contains any of the debug parameters described in
specs/params.md, and every one of them is valid, any saved state is
cleared before that parameter's normal behavior proceeds. This
includes `screen`, even when used only to navigate directly to a
screen with no other game-seeding parameters present.

If any parameter present is invalid, saved state is left untouched
and today's behavior applies unchanged: an error is thrown and the
error screen is shown.

## Error screen

Reaching the error screen never reads or writes saved state. A
reload after an error re-attempts normal restoration from whatever
state existed before the error was thrown; it does not return to the
error screen itself.

## Application Info screen

Like the error screen, the Application Info screen (specs/screens/
appinfo.md) never reads or writes saved state -- it is not one of the
screens listed under "What is stored" above. It is shown only when
there is no saved state to restore at all, so once the player
proceeds past it to the Main Menu, the Main Menu's own transition
saves the `main` marker (per "When state is saved" above) and the
Application Info screen is not shown again on any later visit, unless
saved state is cleared some other way (e.g. Abandon, or a debug
parameter -- see "Interaction with debug parameters" above).
