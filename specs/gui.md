# GUI

The GUI is organized into different "screens". Right now, there is only
one screen: the game screen

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
public for bots once the game is over and scores are announced.
- A panel containing three strike indicators arranged horizontally. The
indicators show a green circle for no-strike, and a red X for a strike like
the following:

    - OOO: No strikes
    - XOO: One strike
    - XXO: Two strikes
    - XXX: Three strikes

A player eliminated from the match (three strikes) keeps their panel in
its usual place in the layout, but the panel is dimmed and tagged
"eliminated", and shows no cards.

In the center of the screen is the pot panel, showing the three cards in
the pot arranged horizontally.

Above South's player panel, is a panel of two buttons arranged horizontally:

- "Take Pot": Clicking on this exchanges all of the players cards with the pot
- "Knock": Clicking on this knocks

These buttons are always visible. They are disabled outside of the
player's turn. "Knock" is additionally disabled on the game's first
turn, since knocking is not a legal move at that point.

To trade a card from a players hand with one from the pot, the player:

- Clicks on the card from the hand to trade; then
- Clicks on the card from the pot to trade

Once both cards are clicked, the trade happens. Cards should be highlighted
when clicked. Cards can be clicked in either order--hand then pot, or
pot then hand. Clicking an already-highlighted card un-highlights it,
cancelling that half of the trade. Clicking a different card in the same
zone (hand or pot) before the trade completes moves the highlight to
that card instead.

# Log Panel

A panel in the bottom-right corner of the screen shows a running,
chronological text log of what has happened: turns taken, end-of-game
recaps, and errors.

Between games, play pauses for three seconds before the next game
starts automatically. The log panel notes the pause. Clicking anywhere
on the screen skips the remainder of the wait.

