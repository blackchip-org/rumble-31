# GUI

The GUI is organized into different "screens". Right now, there is only
one screen: the game screen

At typical desktop window sizes, the game screen fits entirely within
the browser viewport; it does not scroll. Elements (cards in
particular) shrink as needed to fit a shorter or narrower window,
down to a minimum legible size. Below that minimum, on a viewport too
small to fit the whole screen, the page falls back to scrolling so
every panel stays reachable.

# Game Screen

The game screen has four panels -- one for each player.

- North panel is at the top of the screen, centered horizontally
- South panel is at the bottom of the screen, centered horizontally
- West panel is by the left border of the screen, centered vertically
- East panel is by the right border of the screen, centered vertically

The player panels should contain:

- The cards making up their hand arranged horizontally. If information about
their card is private, the light red card back tile should be shown instead.
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

A player eliminated from the game (three strikes) keeps their panel in
its usual place in the layout, but the panel is dimmed and tagged
"eliminated", and shows no cards.

In the center of the screen is the pot panel, showing the three cards in
the pot arranged horizontally.

Above South's player panel, is a panel of two buttons arranged horizontally:

- "Take Pot": Clicking on this exchanges all of the players cards with the pot
- "Knock": Clicking on this knocks

These buttons are always visible. They are disabled outside of the
player's turn.

To trade a card from a players hand with one from the pot, the player:

- Clicks on the card from the hand to trade; then
- Clicks on the card from the pot to trade

Once both cards are clicked, the trade happens. Cards should be highlighted
when clicked. Cards can be clicked in either order--hand then pot, or
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
is skipped. South's own cards show their real face as dealt; every
other player's card shows the light red card back tile. A short,
fixed delay separates each card as it's dealt, so the whole animation
takes about one second with all four players still in the game, and
proportionally less once players have been eliminated (fewer cards
left to deal).

A player's panel is always the same size, whether it currently holds
zero, one, two, or three cards; each card appears directly in its
final position within the hand and never shifts as later cards are
added next to it. The same applies to the pot panel.

## Trading/Exchanging Cards

When a player trades or exchanges cards with the pot, that action is animated.
The card from the player's hand being traded should first be exposed if
necessary (bots cards are normally hidden) and then it should slide over to
the card it is trading for in the pot. Once there, the card being traded for
in the pot slides over to its spot in the player's hand. The total duration
of one card's animation is configurable.

The z-index of the cards should be adjusted so that they appear over other
cards while sliding. Once the card reaches its final position in the player's
hand, it is concealed if it normally should be hidden (in a bot's hand).

When exchanging all cards with the pot, each card should be traded
individually. The full animation should first be applied to the first card,
then the second card, and then the third.

## Log Panel

A panel in the bottom-right corner of the screen shows a running,
chronological text log of what has happened: turns taken, end-of-round
recaps, and errors.

Between rounds, play pauses for three seconds before the next round
starts automatically. The log panel notes the pause. Clicking anywhere
on the screen skips the remainder of the wait.

The game ends immediately the moment South is eliminated, per
specs/cli.md — the rest of the bots' contest is never played out.

# Main Screen

When a user visits the web application without any URL parameters, the
main screen should be shown. The background color should be a green color
that resembles the same green you would see on a felt table.

If the URL includes any of the debug parameters described in
specs/params.md, the main screen is skipped entirely and the Game
Screen starts immediately, as it does today.

The entire contents of the screen are in a panel that should be centered
horizontally and vertically. This
panel contains:

- The title of the game "Battle 31" in a large font size. Battle and 31 should
be on different lines. Use New Rocker regular for this font and render it
in white.
- The following buttons. The background color of the button should be a dark
blue and the text is white:
    - New Game
    - Settings
    - About

Clicking on the "New Game" button navigates to the Game Screen. The other
buttons do nothing at the moment.

# Game Over Screen

At the end of the round, if the delay timer expires, instead of proceeding
to the next round, navigate to the game over screen. Background for now
is black.

The entire contents of the screen are in a panel that is centered both
horizontally and vertically on the screen. In big white lettering, say either
"You Won!" or "Game Over" with each word on its own line. Below that are three
buttons:

- Play Again
- Main Menu
- Save Log

Clicking on "Play Again" returns the user to the Game screen. Clicking on
Main Menu returns the user to the Main screen. Clicking on Save Log lets the
user save a text file containing the log from the game just played.

# Error Screen

When there is an unhandled exception, the error screen should be shown.
The background is full black. It starts with a large heading in Comic Neue Bold
with "Whoops-a-daisy!" in a pastel red color.

Following that is a message in Inconsolata Regular (with a foreground
color of white) stating "We are sorry, but the error you encountered was not
expected. Please reload your browser and try again. If you continue to
experience this problem, contact your local service technician for assistance."

A stack trace should then be shown in a scrollable text area using Inconsolata
Regular but in a smaller font. The text is rendered with a gray color.
