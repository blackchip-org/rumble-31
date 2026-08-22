# GUI

The GUI is organized into different "screens".

At typical desktop window sizes, the game screen fits entirely within
the browser viewport; it does not scroll. Elements (cards in
particular) shrink as needed to fit a shorter or narrower window,
down to a minimum legible size. Below that minimum, on a viewport too
small to fit the whole screen, the page falls back to scrolling so
every panel stays reachable.

## Mobile

For mobile devices, the GUI should expect that normal operation is with
the phone in landscape mode.

## Screens

- [Game Screen](screens/game.md) (game) — Player panels, the pot,
  dealing, trading, and the log panel during a round.
- [Main Screen](screens/main.md) (main) — Landing screen shown when
  the app is opened with no debug URL parameters.
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
- [Settings Screen](screens/settings.md) (settings) — Sound and bot
  difficulty settings, persisted to local storage.
- [Game Menu Screen](screens/menu.md) (menu) — In-game pause menu
  with resume, settings, and abandon.
- [About Screen](screens/about.md) (about) — Version, credits, and a
  link to the Licenses screen.
- [Licenses](screens/licenses.md) (licenses) — Third-party license
  text sourced from licenses.json.
- [How to Play](screens/htp.md) (htp) — Renders how-to-play.md from
  the repository root.
