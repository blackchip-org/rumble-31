# Controller and Keyboard Navigation

Every screen, including the Game Screen's hand and pot cards, can be
navigated with a game controller or the keyboard, in addition to
mouse/touch.

## Focus

Exactly one button, list box, scrollable panel, or card on the current
screen is "focused" at a time, shown with a colored outline distinct
from any other highlight (such as a selected card).
Most screens are a single column, where any direction moves to the
next or previous item, wrapping back around at either end. The Game
Screen and the Stats screen are arranged in rows instead: the Game
Screen's rows are Menu; the pot's cards; Take Pot/Knock; the hand's
cards; the Stats screen's rows are its four tabs; its stat panel;
Main Menu. Within a row of cards or tabs, left/right moves along the
row and wraps at either end; up/down always moves to the
previous/next row, wrapping past the top/bottom row, and so does
left/right on a row with nothing else in it (such as Menu).

Opening the Abandon or Reset confirmation dialog moves focus into that
dialog only, for as long as it's open; the screen behind it cannot be
focused until the dialog closes.

If the focused button becomes disabled, it immediately loses focus.
Nothing else gains focus automatically -- the next navigation input
recomputes focus the normal way, falling back to the screen's default
control (see Default Focus below).

## Default Focus

Once the player has used a controller or keyboard at least once in the
current session, each screen focuses a default control the moment it's
visited, without waiting for a navigation input:

- Main Menu defaults to "New Game", but remembers whichever button was
  last clicked on it and defaults to that instead the next time it's
  visited (e.g. clicking "About" and returning to the Main Menu later
  focuses "About").
- Difficulty defaults to "Moderate", but remembers whichever
  difficulty was last clicked on it and defaults to that instead the
  next time it's visited, same as the Main Menu above.
- How to Play, Settings, About, and Licenses always default to their
  "Main Menu" (or, on Settings entered from the Game Menu, "Game
  Menu") button.
- Stats defaults to its currently active tab (specs/screens/stats.md),
  remembering that across visits the same way the tab itself does.
- The Game Over screen defaults to "Play Again".
- The Application Info screen defaults to "Proceed Anyway".
- The Error screen defaults to its stack trace panel, since it has no
  buttons of its own.

Screens not listed above (the Game Screen, the Game Menu screen) fall
back to the first item in their focus order, per Focus above; the Game
Screen's own turn-based defaults are covered by Selection Focus below.

## Controller Mapping

By default, a controller's D-pad moves focus, its bottom face button
(A on an Xbox-style controller) activates the focused item, and its
right face button (B) cancels/backs out. This matches the W3C Standard
Gamepad layout.

The Settings screen has a "Confirm/Cancel" toggle that swaps which
face button confirms vs. cancels, for players used to a
Nintendo-style layout instead.

## Keyboard Mapping

The arrow keys move focus, Enter activates the focused item, and
Escape cancels/backs out -- the same as pressing Escape already does
on the Game Screen (specs/screens/game.md), now also available from
every other screen and, while a dialog is open, closing that dialog.

## Card Navigation

On South's turn, once trading is available (i.e. not the round's
first turn -- specs/screens/game.md), the pot's cards and South's
hand cards are each their own row in the focus order, matching
specs/screens/game.md's "To trade a card..." behavior: activating a
card picks or un-picks it exactly like clicking it does, and a trade
completes once a card in each row is picked, in either order. On the
round's first turn, cards aren't part of the focus order at all --
only Menu and Take Pot/Knock (reading "Take Pot"/"Keep", and
relocated into the round's-first-turn dialog while South is acting --
specs/screens/game.md) are navigable, matching that turn's mouse/touch
behavior of cards being unclickable.

Cancel never undoes a half-made pick (a card chosen in only one row so
far) -- it always does what it does everywhere else, opening the Game
Menu. Un-picking a card is done the same way as with a mouse:
activating that same card again.

## Selection Focus

Once a card in a pot's or hand's row is picked, focus jumps to the
other row's center card, so a trade can be made with left/right and
confirm alone: focus starts on the pot's or hand's center card, per
the Focus First setting (specs/screens/settings.md; the pot by
default), as soon as trading becomes available each turn; picking a
hand card moves focus to the pot's center card, and picking a pot
card moves focus to the hand's center card -- unless that pick is the
second of the pair (a hand card is already picked, or vice versa),
completing the trade: no further action remains to take, so focus is
dropped instead of moved. Un-picking a card (activating an
already-picked card again) does not move focus.

On the round's first turn, when cards aren't part of the focus order
at all (see Card Navigation above), focus instead starts on the Keep
Hand button, rather than any card.

This only takes effect once the player has used a controller or
keyboard at least once in the current session -- a player who has only
ever used the mouse never sees a focus ring appear on its own.

## List Boxes

The Licenses screen's item list is a list box rather than a button, so
moving focus onto it doesn't let the D-pad change which item is
selected on its own. Pressing confirm while it's focused "activates"
it instead (shown with a differently colored focus ring): while
active, the D-pad moves the selected item up/down through the list
(clamping at either end, not wrapping) instead of moving focus
elsewhere, updating the shown license text immediately, the same as
clicking a different item would. Pressing cancel deactivates the list
box, without triggering cancel's usual behavior elsewhere (closing a
dialog, or opening the Game Menu) -- the D-pad goes back to moving
focus around the rest of the screen. Scrollable panels use this same
activation pattern -- see Scrolling below.

## Scrolling

The Game Screen's log, the How to Play and Licenses screens' text, the
About screen's credits, the Application Info screen's instructions,
the Stats screen's stat panel, and the Error screen's stack trace are
each a scrollable panel that also takes a place in the focus order,
alongside that screen's buttons/list box in whatever position it
occupies on-screen (e.g. the Stats screen's panel sits between its
difficulty tabs and its Main Menu button). Its focus ring looks the
same as any other focused item.

Moving focus onto a panel doesn't scroll it by itself. Pressing
confirm while it's focused "activates" it instead (shown with the same
differently colored focus ring List Boxes use): while active, the
D-pad's up/down page-scroll the panel -- the same amount a single
L1/R1 bumper press does (see below) -- instead of moving focus
elsewhere. Pressing cancel deactivates the panel, without triggering
cancel's usual behavior elsewhere (closing a dialog, or opening the
Game Menu) -- the D-pad goes back to moving focus around the rest of
the screen. Left/right and confirm have no effect while a panel is
active.

Independent of all of the above, the left stick scrolls whichever
panel belongs to the screen currently on-screen, proportionally to how
far the stick is pushed up or down. This works regardless of what has
focus, or whether a panel is active, and never moves focus itself. For
controllers without a stick usable for fine scrolling, the L1/R1
shoulder bumpers page up/down the same panel a fixed amount per press,
also regardless of focus.

Only up/down scrolling is supported, whether via an active panel's
D-pad, the stick, or the bumpers -- the stick's left/right axis and
the D-pad's left/right always only move focus.
