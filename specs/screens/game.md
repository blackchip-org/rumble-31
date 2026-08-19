# Game Screen (game)

There is a bar at the very top of the screen. On the left hand side, it
has the title of the game "Rumble 31". On the right hand side is a
button labeled "Menu". Clicking on Menu, pressing the Escape key, or
pressing a controller's cancel button (specs/controller.md), navigates
to the Game Menu screen.

The game screen has four panels -- one for each player.

- North panel is at the top of the screen, centered horizontally
- South panel is at the bottom of the screen, centered horizontally
- West panel is by the left border of the screen, centered vertically
- East panel is by the right border of the screen, centered vertically

The player panels should contain:

- The cards making up their hand arranged horizontally. If information about
their card is private, the light red card back tile should be shown
instead. A bot's hand is private during play, then revealed once the
round is over and scores are announced, same as the score box below.
- A status tag in the upper right hand corner of the panel. This holds
information such as "turn", "first", "knocked", "eliminated", etc. Only
one tag can be shown at any time. If there is no tag to show, it should
still fill the same space so the panel doesn't jump when state changes.
- A dealer's button, shown inline with the score box and strike
indicators in the same row, placed before the score box. The
button's circle outline (black border) is always present. When the
seat is the dealer, the circle is filled white with the letter 'D'
in black text in the middle. When the seat is not the dealer, the
circle is filled dark gray instead, with no letter -- marking where
the button would go.
- A score box showing the current tally. If this information is private,
the box should be empty. It is always public for the human player and
public for bots once the round is over and scores are announced.
- A panel containing three strike indicators arranged horizontally. The
indicators show a green circle for no-strike, and a red X for a strike like
the following:

    - OOO: No strikes
    - XOO: One strike
    - XXO: Two strikes
    - XXX: Three strikes

The first player(s) to reach three strikes get a second chance instead
of being eliminated (specs/rules.md): while they hold it, the third
indicator shows a yellow "/" instead of a red X (XX/) rather than the
plain XXX above. It reverts to a plain red XXX, same as any other
elimination, once they're actually eliminated on a fourth strike.

The player panel should highlight in the following conditions:

- A yellowish highlight when it is the player's turn
- A white highlight at the end of the round when the player has won
- A blinking red highlight at the end of the round when the player receives a
strike

Each highlight uses its own color, defined as a separate theme variable, so
any of the three can be restyled independently. The red strike highlight's
blink interval is a configurable constant.

The win/strike highlights are shown for as long as the pause between rounds
lasts (including being cut short if the player skips the pause by clicking),
and clear once the next round's deal begins. If a player's strike eliminates
them, the panel blinks between its normal appearance (with the red
highlight) and the dimmed "eliminated" appearance described below, rather
than showing the highlight over a static dimmed panel.

A player struck this round, but not eliminated by that strike, has
their panel tagged "strike" for as long as the win/strike highlights
are shown, clearing at the same time those highlights do. If that
strike is their third and grants them a second chance (specs/rules.md)
rather than eliminating them, the panel is tagged "second chance"
instead of "strike", using the same red as the strike highlight.

A player who wins the round has their panel tagged "winner", using the
same white as the win highlight, for as long as the win/strike
highlights are shown, clearing at the same time those highlights do.
In the rare case where every remaining player ties (so all are struck
and all win at once), the strike/second-chance/eliminated tag takes
priority and is shown instead of "winner", since only one tag can be
shown at a time -- the white win highlight is still shown regardless.

A player eliminated from the game (three strikes) keeps their panel in
its usual place in the layout, but the panel is dimmed and tagged
"eliminated", and shows no cards. The one exception is the round a
player is eliminated in: their hand stays revealed (per the score
reveal above) through that round's win/strike pause, and only goes
blank starting with the next round's deal. Their score box, though,
clears as soon as that pause ends, rather than waiting for the next
deal like the hand does. A player eliminated by this round's strike
is tagged "eliminated" instead of "strike".

Any player who knocks (see specs/rules.md, which also counts exchanging
all cards as a knock) has their panel tagged "knocked" for the rest of
that round -- not just the round's first knocker, since a later player
may also knock or exchange on their own forced final turn. The tag is
removed as soon as the round ends.

In the center of the screen is the pot panel, showing the three cards in
the pot arranged horizontally.

Above South's player panel, is a panel of two buttons arranged horizontally:

- "Take Pot": Clicking on this exchanges all of the player's cards with the pot
- "Knock": Clicking on this knocks

These buttons are always visible. They are disabled outside of the
player's turn.

On the round's first turn, the pot is private (see "Dealing" below),
and whichever seat acts first (South or a bot) has its panel tagged
"First" instead of "turn", with its own distinct highlight color,
separate from the ordinary yellowish turn highlight. When it is
South's first turn, the "Knock" button reads "Keep" instead --
same position and style, but clicking it leaves South's hand untouched
instead of knocking (see specs/rules.md: neither Take Pot nor Keep
counts as a knock on this turn); "Take Pot" keeps its usual label,
since it's the same blind gamble every other seat faces on their own
first turn. Clicking a hand or pot card has no effect on this turn --
trading a single card isn't available until the round's second turn.

On South's first turn, a dialog box appears over the board, containing,
top to bottom: three face-down cards, the text "You are first this
round. For your hand, choose to either keep the cards dealt to you or
to take the cards dealt to the pot.", South's actual hand (its real
cards, not backs), and the Take Pot/Keep buttons (relocated into the
dialog for as long as it's shown). This replaces highlighting either
the hand or the pot as a group -- the dialog states the choice
directly instead. South's hand behind the dialog, on the board itself,
stays face-down for as long as the dialog is showing (see "Dealing"
below) -- the dialog is the only place it's actually shown. The Menu
button remains visible and clickable while the dialog is shown. The
dialog closes the moment Take Pot or Keep is clicked, at which point
South's hand turns face-up on the board too, Take Pot/Keep move back
to their usual place above South's panel, and the Knock button
reverts to reading "Knock" and card-clicking to trade resumes working,
from South's second turn on.

To trade a card from a player's hand with one from the pot, the player:

- Clicks on the card from the hand to trade; then
- Clicks on the card from the pot to trade

Once both cards are clicked, the trade happens. Cards should be highlighted
when clicked. Cards can be clicked in either order -- hand then pot, or
pot then hand. Clicking an already-highlighted card un-highlights it,
cancelling that half of the trade. Clicking a different card in the same
zone (hand or pot) before the trade completes moves the highlight to
that card instead.

## Dealing

At the start of each round, every player panel and the pot panel
show no cards at all -- hands and the pot are cleared before dealing
begins. Cards are then dealt one at a time: one card to each active
player in turn, starting with South and proceeding clockwise (South,
West, North, East), repeated three times so each player ends up with
three cards -- matching the actual deal order in specs/rules.md --
followed by the three pot cards, one at a time. An eliminated player
is skipped. Every card, South's own included, shows the light red card
back tile as it's dealt -- nobody's hand is shown face-up during the
deal itself. A short, fixed delay separates each card as it's dealt,
so the whole animation takes about one second with all four players
still in the game, and proportionally less once players have been
eliminated (fewer cards left to deal).

Once dealing finishes, South's own hand turns face-up on the board and
its score box fills in, the same as ever, since both are always public
-- unless South is also the round's first player to act, in which case
both stay hidden instead: the first-turn dialog above is where they're
actually shown, not the board, so nothing on the board itself gives
them away early. They turn face-up on the board (and the score box
fills in) the moment that dialog's decision resolves, the same instant
the Take Pot/Keep buttons move back out of it.

The pot is private to everyone, including the round's first player to
act (specs/rules.md) -- its three cards are always dealt showing the
light red card back tile, the same as a private bot hand, regardless
of who acts first. Once the first player has taken their turn (Take
Pot or Keep), the pot's cards turn face-up and stay public for the
rest of the round.

A player's panel is always the same size, whether it currently holds
zero, one, two, or three cards; each card appears directly in its
final position within the hand and never shifts as later cards are
added next to it. The same applies to the pot panel.

## Trading/Exchanging Cards

When a player trades or exchanges cards with the pot, that action is animated.
The card from the player's hand being traded should first be exposed if
necessary (bots' cards are normally hidden) and then it should slide over to
the card it is trading for in the pot. Once there, the card being traded for
in the pot slides over to its spot in the player's hand. The total duration
of one card's animation is configurable.

The z-index of the cards should be adjusted so that they appear over other
cards while sliding. Once the card reaches its final position in the player's
hand, it is concealed if it normally should be hidden (in a bot's hand).

When exchanging all cards with the pot, each card should be traded
individually. The full animation should first be applied to the first card,
then the second card, and then the third.

On the round's first turn, if the acting seat takes the pot (Take Pot),
the cards moving from the pot to the hand stay face-down for their
entire slide instead of being briefly exposed like a normal
trade/exchange -- the pot is still private at that point (see "Dealing"
above), so unlike every other trade/exchange, these cards were never
public to begin with and must stay that way. The cards moving from the
hand to the pot are unaffected and still animate face-up, since they
become the round's new public pot regardless.

## Log Panel

A panel in the bottom-right corner of the screen shows a running,
chronological text log of what has happened: turns taken, end-of-round
recaps, and errors.

Between rounds, play pauses for three seconds before the next round
starts automatically. The log panel notes the pause. Clicking anywhere
on the screen skips the remainder of the wait.

The game ends immediately the moment South is eliminated -- the rest of
the bots' contest is never played out.

## Mobile

For mobile devices, the layout of the game screen needs to be adjusted
to fit the screen. The top bar should be removed as this takes up much
needed space. The log panel is hidden in this layout. Fit in the menu
button wherever there is space. Bot hands (West, North, East) are
shown smaller than South's, since they're mostly card backs and
secondary information even once revealed. The floating menu button
stays above the round's-first-turn dialog here too, same as on desktop
-- it's still clickable regardless of which layout put it where.

In landscape orientation, the main board is arranged into two columns.
The left column has player seats in the following top-down order:
West, North, East. The right column has the pot at the top, the Take
Pot / Knock buttons, and then the South player panel.

In portrait orientation, on a narrow enough (phone-sized) viewport,
the main board is a single column, top-down: West, North, East, the
pot, the Take Pot / Knock buttons, then the South player panel. A
portrait viewport wide enough to be a tablet rather than a phone does
not get this treatment -- it falls back to the normal narrow-viewport
behavior described in gui.md (shrinking, then scrolling if that isn't
enough), same as any other screen size this section doesn't cover.
