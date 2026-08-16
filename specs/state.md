# State

The web GUI persists enough state to local storage that a user who
leaves the application (closing the tab, reloading the page) and
later returns finds it exactly as they left it: on the same screen
(see specs/gui.md), and, if a game was in progress, still in that
game rather than back at the Main Screen.

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

The stored object records:

- Which screen is showing: `main`, `settings`, `about`, `licenses`,
  `htp`, `game`, `over`, or `menu`. The error screen is never recorded
  here (see "Error screen" below).
- If the screen is `game`, `over`, or `menu`: each seat's strikes,
  elimination status, and second-chance status (specs/rules.md), the
  current round number, which seat holds
  the dealer button (specs/rules.md), and which bot difficulty
  (specs/bots.md) is seated at each of the three bot seats. The
  latter is fixed for the life of the game: it is chosen once, when
  the game starts, and does not change even if the player changes
  the Settings Screen's bot settings while the game is in progress.
- If the screen is `game` and a round is in progress: that round's
  checkpoint -- every active seat's current hand, the current pot,
  which seat acts next, whether that seat's turn is the round's first
  turn, whether a player has already knocked (or exchanged past the
  round's first turn) and which seat that was, and each bot seat's
  own tracked opponent information (specs/bots.md's "This bot
  tracks" sections -- best score and turn, and either tracked suits
  or a memory map of known cards, depending on difficulty), so a
  reload does not reset what a bot has already learned this round.
  This checkpoint is absent between rounds, when the next round has
  not been dealt yet.
- If the screen is `over`: the final win/loss outcome, so the screen
  can be redrawn without replaying the game.
- If the screen is `menu`: the same fields recorded for `game` above
  (including that round's checkpoint, if any), read back exactly as
  last saved for the `game` screen -- entering the Game Menu (see
  "The Game Menu screen" below) does not create new game state, it
  re-tags the most recently saved one under `menu` instead of `game`.
- If the screen is `settings`: which screen it was entered from --
  `main`, or `menu` together with that same `game` state -- per
  specs/screens/settings.md, driving its back button and whether the
  bot-difficulty toggles are disabled.
- The log panel's lines, so the visible history and Save Log survive
  a reload.

## When state is saved

State is written to local storage:

- On every screen transition (see specs/gui.md).
- After every completed deal.
- After every completed turn.
- After every round ends (once that round's recap is applied, before
  the next round is dealt).
- When the game ends.

Settings changes are not covered by this spec; they continue to save
independently, as described in specs/screens/settings.md.

## When state is restored

On a visit with none of the debug parameters described in
specs/params.md:

- If valid saved state exists, the application starts on the screen
  it names, instead of the Main Screen.
- If that screen is `game`, the saved strikes, eliminations,
  second-chance status, round number, dealer button, and bot seat
  assignment are restored -- the
  same three bot difficulties stay in the same seats they started the
  game in, rather than being reshuffled per specs/bots.md's normal
  new-game behavior. If a round-in-progress
  checkpoint was saved, that round resumes from the checkpoint: hands
  and the pot are placed immediately with no deal animation (the same
  as the animation skip described in specs/params.md for the
  north/south/east/west/pot parameters), and the checkpoint's
  first-turn and knocked state are restored so the round ends under
  the same rules a freshly dealt round would. Each bot seat's tracked
  opponent information is restored the same way, so a bot resumes
  with exactly what it had already learned before the reload rather
  than starting that round over blank. If no round-in-progress
  checkpoint was saved, the next round deals normally.
- If that screen is `over`, the saved outcome is redrawn directly,
  with no game replayed and no win/lose sound (see assets.md).
- If that screen is `menu`, the Game Menu screen is shown directly
  with the saved `game` state, restored the same way as the `game`
  screen above but without resuming play (see "The Game Menu screen"
  below).
- If that screen is `settings`, the saved origin decides its back
  button and bot-toggle state, restoring a `menu` origin's `game`
  state the same way as above so returning to the Game Menu (rather
  than Resume) still works after the reload.
- If there is no saved state, or it is invalid, the application
  behaves as it does today: a bare visit shows the Main Screen --
  unless specs/screens/appinfo.md's Application Info screen conditions
  are also met, in which case that screen is shown instead (see
  "Application Info screen" below).

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
proceeds past it to the Main Menu, the Main Menu's own normal
navigation saves state (per "When state is saved" above) and the
Application Info screen is not shown again on any later visit, unless
saved state is cleared some other way (e.g. Abandon, or a debug
parameter -- see "Interaction with debug parameters" below).
