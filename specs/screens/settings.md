# Settings Screen (settings)

Contents should be in a panel centered horizontally and vertically.

Main header shows "Settings"

Settings are in a two column setting. The first column describes the
setting, the second column is a control to adjust the setting. The
settings are:

- Sounds
- Bot 1
- Bot 2
- Bot 3

Sounds is a button that by default reads "Enabled". Clicking on it toggles
to "Disabled". When this setting is disabled, the application should
not emit any sounds.

For each bot setting there is a button that by default reads "Easy".
Clicking on it cycles through "Easy", "Regular", "Difficult". Changing
a bot setting takes effect starting with the next game; it has no
effect on a game already in progress.

When the Settings screen is entered via the Game Menu, the Bot settings
should be disabled. Those settings should not be modified while a game
is in progress.

A "Main Menu" or "Game Menu" button is shown below the settings depending
on which screen it came from. Clicking on that button will navigate back to
that screen. If this screen was entered using a URL parameter, it shows
the "Main Menu" button.

These settings should be saved and retrieved from local storage.
