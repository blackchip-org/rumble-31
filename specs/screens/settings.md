# Settings Screen (settings)

Contents should be in a panel centered horizontally and vertically.

Main header shows "Settings"

Settings are in a two column setting. The first column describes the
setting, the second column is a control to adjust the setting. The
settings are:

- Sounds
- Difficulty
- Suit Color
- Confirm/Cancel
- Reset

Sounds is a button that by default reads "Enabled". Clicking on it toggles
to "Disabled". When this setting is disabled, the application should
not emit any sounds.

Difficulty is a button that by default reads "Moderate". Clicking on it
cycles through "Easy", "Moderate", "Hard". Each difficulty determines
the three bot strategies (specs/bots.md) seated for the game's three bot
seats, per the mapping configured in config.ts. Changing the difficulty
takes effect starting with the next game; it has no effect on a game
already in progress.

Suit Color is a button that by default reads "Four". Clicking on it
toggles to "Two". "Four" renders each suit's cards in a different
color: spades black, hearts red, diamonds blue, clubs green. "Two"
renders cards using only black and red: spades and clubs black,
hearts and diamonds red.

Confirm/Cancel is a button that by default reads "Standard". Clicking
on it toggles to "Swapped". This controls which controller face
button confirms vs. cancels during controller navigation
(specs/controller.md); "Standard" follows the W3C Standard Gamepad
layout, "Swapped" reverses it for a Nintendo-style layout.

Reset is a button that reads "Confirm", using a reddish fill color to
distinguish it from the other settings' buttons. Clicking on it shows a
dialog box centered on the screen asking "Are you sure you want to
reset all state?" with "Yes" and "No" buttons below it. Clicking on
"Yes" clears all local storage and reloads the application, landing
back on the Main Menu or the Application Info screen exactly as a
fresh visit would (specs/screens/appinfo.md). Clicking on "No"
dismisses the dialog box.

When the Settings screen is entered via the Game Menu, the Difficulty
setting should be disabled. It should not be modified while a game is
in progress.

A "Main Menu" or "Game Menu" button is shown below the settings depending
on which screen it came from. Clicking on that button will navigate back to
that screen. If this screen was entered using a URL parameter, it shows
the "Main Menu" button.

These settings should be saved and retrieved from local storage.

## Mobile

In landscape orientation, on a narrow enough (phone-sized) viewport,
the settings list is arranged into two side-by-side groups (Sounds,
Difficulty, and Suit Color on the left; Confirm/Cancel and Reset on
the right), instead of one column of five, so the whole panel fits the
shorter viewport height.
