# Controller and Keyboard Navigation

Every screen, including the Game Screen's hand and pot cards, can be
navigated with a game controller or the keyboard, in addition to
mouse/touch.

## Focus

Exactly one button, list box, or card on the current screen is
"focused" at a time, shown with a colored outline distinct from any
other highlight (such as a selected or first-turn-highlighted card).
Most screens are a single column, where any direction moves to the
next or previous item, wrapping back around at either end. The Game
Screen is arranged in rows instead (Menu; the pot's cards; Take
Pot/Knock; the hand's cards): within a row of cards, left/right moves
along the row and wraps at either end; up/down always moves to the
previous/next row, wrapping past the top/bottom row, and so does
left/right on a row with nothing else in it (such as Menu).

Opening a dialog (the Abandon or Install confirmation) moves focus
into that dialog only, for as long as it's open; the screen behind it
cannot be focused until the dialog closes.

If the focused button becomes disabled, it immediately loses focus.
Nothing else gains focus automatically -- the next navigation input
recomputes focus the normal way, falling back to the first item.

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

## Card Navigation

On South's turn, once trading is available (i.e. not the round's
first turn -- specs/screens/game.md), the pot's cards and South's
hand cards are each their own row in the focus order, matching
specs/screens/game.md's "To trade a card..." behavior: activating a
card picks or un-picks it exactly like clicking it does, and a trade
completes once a card in each row is picked, in either order. On the
round's first turn, cards aren't part of the focus order at all --
only Menu and Take Pot/Knock (reading "Keep Pot"/"Keep Hand") are
navigable, matching that turn's mouse/touch behavior of cards being
unclickable.

Cancel never undoes a half-made pick (a card chosen in only one row so
far) -- it always does what it does everywhere else, opening the Game
Menu. Un-picking a card is done the same way as with a mouse:
activating that same card again.

## Selection Focus

Once a card in a pot's or hand's row is picked, focus jumps to the
other row's center card, so a trade can be made with left/right and
confirm alone: focus starts on the hand's center card as soon as
trading becomes available each turn; picking a hand card moves focus
to the pot's center card, and picking a pot card (whether picked first
or after the hand) moves focus to the hand's center card. Un-picking a
card (activating an already-picked card again) does not move focus.

On the round's first turn, when cards aren't part of the focus order
at all (see Card Navigation above), focus instead starts on the Keep
Hand button, rather than any card.

This only takes effect once the player has used a controller or
keyboard at least once in the current session -- a player who has only
ever used the mouse never sees a focus ring appear on its own.
