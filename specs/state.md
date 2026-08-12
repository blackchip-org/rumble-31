# State

The web GUI persists enough state to local storage that a user who
leaves the application (closing the tab, reloading the page) and
later returns finds it exactly as they left it: on the same screen
(see specs/gui.md), and, if a game was in progress, still in that
game rather than back at the Main Screen.

State is saved as it changes, not just on exit. Saved state is
distinct from the Settings Screen's saved preferences (specs/gui.md,
`rumble31.settings`), which have their own separate storage and are
never read, written, or cleared by anything in this spec.

## What is stored

State is stored under a single local storage key, `rumble31.state`,
as one JSON object tagged with a schema version. If the stored value
is missing, unreadable, or written by an old schema version, it is
treated exactly like no saved state at all -- the application starts
fresh, the same as a first-ever visit.

The stored object records:

- Which screen is showing: `main`, `settings`, `about`, `game`, or
  `over`. The error screen is never recorded here (see "Error screen"
  below).
- If the screen is `game` or `over`: each seat's strikes and
  elimination status, the current round number, and which seat holds
  the dealer button (specs/rules.md).
- If the screen is `game` and a round is in progress: that round's
  checkpoint -- every active seat's current hand, the current pot,
  which seat acts next, whether that seat's turn is the round's first
  turn, and whether a player has already knocked (or exchanged past
  the round's first turn) and which seat that was. This checkpoint is
  absent between rounds, when the next round has not been dealt yet.
- If the screen is `over`: the final win/loss outcome, so the screen
  can be redrawn without replaying the game.
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
independently, as described in specs/gui.md's Settings Screen
section.

## When state is restored

On a visit with none of the debug parameters described in
specs/params.md:

- If valid saved state exists, the application starts on the screen
  it names, instead of the Main Screen.
- If that screen is `game`, the saved strikes, eliminations, round
  number, and dealer button are restored. If a round-in-progress
  checkpoint was saved, that round resumes from the checkpoint: hands
  and the pot are placed immediately with no deal animation (the same
  as the animation skip described in specs/params.md for the
  north/south/east/west/pot parameters), and the checkpoint's
  first-turn and knocked state are restored so the round ends under
  the same rules a freshly dealt round would. If no round-in-progress
  checkpoint was saved, the next round deals normally.
- If that screen is `over`, the saved outcome is redrawn directly,
  with no game replayed.
- If there is no saved state, or it is invalid, the application
  behaves as it does today: a bare visit shows the Main Screen.

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
