# Controller and Keyboard Navigation

Every screen except the Game Screen's hand/pot cards (see "Not Yet
Supported" below) can be navigated with a game controller or the
keyboard, in addition to mouse/touch.

## Focus

Exactly one button or list box on the current screen is "focused" at
a time, shown with a colored outline distinct from any other
highlight (such as a selected or first-turn-highlighted card). Moving
focus off the last item in a screen's list wraps back around to the
first, and vice versa.

Opening a dialog (the Abandon or Install confirmation) moves focus
into that dialog only, for as long as it's open; the screen behind it
cannot be focused until the dialog closes.

## Controller Mapping

By default, a controller's D-pad or left stick moves focus, its
bottom face button (A on an Xbox-style controller) activates the
focused item, and its right face button (B) cancels/backs out. This
matches the W3C Standard Gamepad layout.

The Settings screen has a "Confirm/Cancel" toggle that swaps which
face button confirms vs. cancels, for players used to a
Nintendo-style layout instead.

## Keyboard Mapping

The arrow keys move focus, Enter activates the focused item, and
Escape cancels/backs out -- the same as pressing Escape already does
on the Game Screen (specs/screens/game.md), now also available from
every other screen and, while a dialog is open, closing that dialog.

## Not Yet Supported

Trading cards between a hand and the pot (specs/screens/game.md's
"To trade a card...") is mouse/touch-only for now -- a controller or
keyboard can still fully play a game via the Take Pot/Knock buttons,
which are ordinary buttons like any other.
