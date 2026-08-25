# GUI

The GUI is organized into different "screens".

## Layout

Every screen is designed to fit entirely within the browser viewport
at typical window sizes, without the page itself scrolling. Elements
(cards in particular) shrink as needed to fit a shorter or narrower
window, down to a minimum legible size. A screen with content whose
length can vary or grow past what fits -- the Stats screen's tabbed
content (specs/screens/stats.md), for example -- puts that content in
its own scrollable panel within the screen instead, so the header,
tabs, and buttons around it stay fully on screen and reachable
without scrolling.

Page-level scrolling (the whole screen, rather than a panel within
it) is a failsafe, not part of the intended design: if a layout still
doesn't fit after shrinking and any internal panel has taken the
overflow it can, the screen falls back to scrolling as a whole so
every part stays reachable. Relying on this in a new or changed
layout is a sign the layout needs another look, not a substitute for
designing it to fit.

When adjusting a screen's layout, check it at both desktop and mobile
window sizes, and on mobile check both portrait and landscape
orientation -- a change that fits one doesn't guarantee it fits the
others.

## Mobile

For mobile devices, the GUI should expect that normal operation is with
the phone in landscape mode.

A button that swaps to a different screen waits TAP_FEEDBACK_DELAY
(specs/config.md) before actually swapping, so the button's
pressed-down feedback has time to paint first -- otherwise a touch tap
can swap screens before the pressed state is ever visible, leaving no
confirmation of which button was actually pressed.

## Screens

- [Game Screen](screens/game.md) (game) — Player panels, the pot,
  dealing, trading, and the log panel during a round.
- [Main Screen](screens/main.md) (main) — Landing screen shown when
  the app is opened with no debug URL parameters.
- [Difficulty Screen](screens/difficulty.md) (difficulty) — Picks the
  bot difficulty for a new game, reached from the Main Screen's "New
  Game" button.
- [Application Info Screen](screens/appinfo.md) (appinfo) — Shown
  instead of the Main Screen on a qualifying mobile visit with no
  saved state, nudging the player to install the game as an app.
- [Game Over Screen](screens/over.md) (over) — Shown when a game
  ends, with options to play again, return to the menu, or save the
  log.
- [Error Screen](screens/error.md) (error) — Shown on an unhandled
  exception.
- [Stats Screen](screens/stats.md) (stats) — Gameplay stats
  (specs/stats.md), tabbed by Overall and each difficulty.
- [Settings Screen](screens/settings.md) (settings) — Sound, suit
  color, and controller settings, persisted to local storage.
- [Game Menu Screen](screens/menu.md) (menu) — In-game pause menu
  with resume, settings, and abandon.
- [About Screen](screens/about.md) (about) — Version, credits, and a
  link to the Licenses screen.
- [Licenses](screens/licenses.md) (licenses) — Third-party license
  text sourced from licenses.json.
- [How to Play](screens/htp.md) (htp) — Renders how-to-play.md from
  the repository root.
