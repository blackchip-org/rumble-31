# Settings Screen (settings)

Contents should be in a panel centered horizontally and vertically.

Main header shows "Settings"

Settings are in a two column setting. The first column describes the
setting, the second column is a control to adjust the setting. The
settings are:

- Sounds
- Suit Colors
- Confirm/Cancel
- Focus First
- Reset

Sounds is a button that by default reads "Enabled". Clicking on it toggles
to "Disabled". When this setting is disabled, the application should
not emit any sounds.

Suit Colors is a button that by default reads "Four". Clicking on it
toggles to "Two". "Four" renders each suit's cards in a different
color: spades black, hearts red, diamonds blue, clubs green. "Two"
renders cards using only black and red: spades and clubs black,
hearts and diamonds red.

Confirm/Cancel is a button that by default reads "Standard". Clicking
on it toggles to "Swapped". This controls which controller face
button confirms vs. cancels during controller navigation
(specs/controller.md); "Standard" follows the W3C Standard Gamepad
layout, "Swapped" reverses it for a Nintendo-style layout.

Focus First is a button that by default reads "Pot". Clicking on it
toggles to "Hand". This controls which card receives focus
automatically when it becomes the player's turn and trading is
available (specs/controller.md's "Selection Focus"): the pot's center
card, or the hand's center card.

Reset is a button that reads "Confirm", using a reddish fill color to
distinguish it from the other settings' buttons. Clicking on it shows a
dialog box centered on the screen asking "Are you sure you want to
reset all state?" with "Yes" and "No" buttons below it. Clicking on
"Yes" clears all local storage and reloads the application, landing
back on the Main Menu or the Application Info screen exactly as a
fresh visit would (specs/screens/appinfo.md). Clicking on "No"
dismisses the dialog box.

A "Main Menu" or "Game Menu" button is shown below the settings depending
on which screen it came from. Clicking on that button will navigate back to
that screen. If this screen was entered using a URL parameter, it shows
the "Main Menu" button.

This screen is not itself restored across a page leave/return
(specs/state.md). Reached from the Game Menu, a reload returns to the
Game Menu with the in-progress game preserved; reached from the Main
Menu, a reload returns to the Main Screen.

These settings should be saved and retrieved from local storage.

## Mobile

In landscape orientation, on a narrow enough (phone-sized) viewport,
the settings list is arranged into two side-by-side groups (Sounds
and Suit Colors on the left; Confirm/Cancel, Focus First, and Reset
on the right), instead of one column of five, so the whole panel fits
the shorter viewport height.
