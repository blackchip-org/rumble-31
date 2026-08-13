# GUI

The GUI is organized into different "screens".

At typical desktop window sizes, the game screen fits entirely within
the browser viewport; it does not scroll. Elements (cards in
particular) shrink as needed to fit a shorter or narrower window,
down to a minimum legible size. Below that minimum, on a viewport too
small to fit the whole screen, the page falls back to scrolling so
every panel stays reachable.

# Game Screen (game)

There is a bar at the very top of the screen. On the left hand side, it
has the title of the game "Rumble-31". On the right hand side is a
button labeled "Menu". Clicking on Menu, or pressing the Escape key,
navigates to the Game Menu screen.

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
are shown, clearing at the same time those highlights do.

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

- "Take Pot": Clicking on this exchanges all of the players cards with the pot
- "Knock": Clicking on this knocks

These buttons are always visible. They are disabled outside of the
player's turn.

On the round's first turn, the pot is private (see "Dealing" below),
and whichever seat acts first (South or a bot) has its panel tagged
"First" instead of "turn", with its own distinct highlight color,
separate from the ordinary yellowish turn highlight. When it is
South's first turn, the two buttons read "Keep Pot" and "Keep Hand"
instead of "Take Pot" and "Knock" -- same position and style, but
clicking either leaves South's hand untouched instead of knocking (see
specs/rules.md: neither Take Pot nor Keep counts as a knock on this
turn). Clicking a hand or pot card has no effect on this turn --
trading a single card isn't available until the round's second turn.
All of South's hand cards highlight on South's first turn, to signal
that "all" of South's cards are being considered rather than one. The
buttons revert to reading "Take Pot" and "Knock", and card-clicking to
trade resumes working, from South's second turn on.

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

The pot is private to everyone except the round's first player to act
(specs/rules.md). If South is not that player, the pot's three cards
are dealt showing the light red card back tile too, the same as a
private bot hand. If South is the first player to act, the pot's
cards show their real face as dealt, same as today. Either way, once
the first player has taken their turn (Take Pot or Keep), the pot's
cards turn face-up and stay public for the rest of the round.

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

The game ends immediately the moment South is eliminated — the rest of
the bots' contest is never played out.

# Main Screen (main)

When a user visits the web application without any URL parameters, the
main screen should be shown. The background color should be a green color
that resembles the same green you would see on a felt table.

If the URL includes any of the debug parameters described in
specs/params.md, the main screen is skipped entirely and the Game
Screen starts immediately, as it does today.

The entire contents of the screen are in a panel that should be centered
horizontally and vertically. This
panel contains:

- The title of the game "Rumble 31" in a large font size. Rumble and 31 should
be on different lines. Use New Rocker regular for this font and render it
in white.
- The following buttons. The background color of the button should be a dark
blue and the text is white:
    - New Game
    - How to Play
    - Settings
    - About

Clicking on the "New Game" button navigates to the Game Screen.
Clicking on the "How to Play" button navigates to the How to Play screen.
Clicking on the "Settings" button navigates to the Settings Screen.
Clicking on the "About" button navigates to the About Screen.s

# Game Over Screen (over)

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

# Error Screen (error)

When there is an unhandled exception, the error screen should be shown.
The background is full black. It starts with a large heading in Comic Neue Bold
with "Whoops-a-daisy!" in a pastel red color.

Following that is a message in Inconsolata Regular (with a foreground
color of white) stating "We are sorry, but the error you encountered was not
expected. Please reload your browser and try again. If you continue to
experience this problem, contact your local service technician for assistance."

A stack trace should then be shown in a scrollable text area using Inconsolata
Regular but in a smaller font. The text is rendered with a gray color.

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

# Game Menu Screen (menu)

The game menu screen has a heading "Game Menu" followed by the following
buttons:

- Resume
- Settings
- Abandon

The "Abandon" button should using a reddish fill color to distinguish it
from the other buttons.

Clicking on Resume navigates to the Game Screen.
Clicking on Settings navigates to the Settings Screen.

Clicking on Abandon should first show a dialog box centered on the screen
asking "Are you sure you want to abandon the game?" with "Yes" and "No"
buttons below it. Clicking on "Yes" clears all game state and navigates
back to the Main Menu. Clicking on "No" dismisses the dialog box.


# About Screen (about)

Contents should be in a panel centered horizontally and vertically.

The header for this panel is:

    Rumble-31
    Version <VERSION>
    Built on <BUILD DATE>

    By
    Mike McGann
    Terri McGann

    Featuring
    Claude Code

The Rumble-31 text uses the New Rocker font. The remaining text is bold.
<VERSION> is the version number of the game, and <BUILD DATE> is the
build date for the game. This text is centered horizontally.

The body should be:

    This classic card game of 31 is based on one of Mike's favorite
    MegaTouch games that has a similar name. I've always wanted
    one of those machines, but the next best thing is to vibe
    code the game yourself.

This text appears in a text area and the width is set to a comfortable
reading size. The text area itself is centered horizontally, the text
is not.

Two buttons should then be listed:

- Licenses
- Main Menu

Clicking on Main Menu navigates back to the Main screen. Clicking on
Licenses navigates to the Licenses screen.

# Licenses (licenses)

The licenses screen should start with a centered header that reads
"Licenses".

Next, side-by-side, is a list box containing all the items that have a
license, and a text area containing the contents of the license. These
should be populated using the licenses.json file found in the root directory
of the repository. This part should expand to fill the screen vertically.

The list box is sorted alphabetically by item name. The "Rumble-31"
entry is selected by default, with its license text already shown in
the text area. Clicking a different item in the list box shows that
item's license text instead.

At the bottom is a button, "Main Menu" that navigates the user back to the
Main Menu when clicked.

# How to Play (htp)

The how to play screen starts with a centered header that reads
"How to Play"

Next is a text area with the contents of how-to-play.md found in the root
directory of this repository. This content should be scrollable and take
up most of the screen.

At the bottom is a "Main Menu" button that returns to the main menu when
clicked.
