# log

The game writes to a log as events happen. This documents what gets logged
when, and what the messages are.

In the examples below, references to "Seat" should be replaced with the
appropriate seat name for that player (e.g., North, South, East, West). Any
card references (such as 7h, 8c, 9d) should be replaced with the actual
cards for that event.

When the game starts, it should write out the following by substituting
0.0 with the actual version number, and X with the random number generator
seed being used.

    Welcome to Rumble-31, v0.0
    Starting game with seed X

The log for the start of each round looks like the following. X is the round
number. A blank line is emitted before the log message.

    === Round X ===
    Pot is dealt [7h 8c 9d]
    South is dealt [7h 8c 9d]

The pot is private to everyone except the round's first player to act
(specs/rules.md). If South is not that player, the pot's cards are not
yet known, so the "Pot is dealt" line omits them instead:

    Pot is dealt

The pot's actual cards are then logged for the first time by the
existing "Pot is [...]" line below, once the first player has taken
their turn.

For the first player to act in a round, their choices are to keep their hand
or to keep the pot. The log messages for those are:

    Seat keeps their hand
    Seat exchanges their hand for the pot

When a player trades a card with the pot, use the following where 7h is the
card from the player's hand that is going to the pot and 8d is the card
from the pot that is going to the player's hand.

    Seat trades [7h] for [8d]

When a player exchanges all cards with the pot, use the following where
7h 8s 9d are the cards from the player's hand that are going to the pot and
Th Js Qd are the cards from the pot going to the player's hand.

    Seat exchanges [7h 8s 9d] for [Th Js Qd]

When a player knocks, use:

    Seat knocks

After the player's action, the pot should be announced again:

    Pot is [7h 8c 9d]

A knock doesn't otherwise touch the pot, so this second line is
skipped for it -- except on the round's first turn (Keep), which is
the only way the pot's cards ever get logged for the first time when
the first player to act doesn't take it.

At the start of a player's turn (and before bots start "thinking"), use:

    Seat's turn

If that seat is the first to act that round, instead use:

    Seat goes first

At the end of the round, announce the hands first for each player using
this format:

    South has [7h 8c 9d]

When listing all seats like this, list all players still in the game starting
with South and working clockwise.

Then announce those receiving strikes using formats below. If more than one
are receiving strikes, use the same order as above.

    North receives a strike
    North receives a strike and is eliminated

Then announce the scores for each player:

    Seat has 9.0 points with 1 strike

If the human player wins, write:

    South wins the game

When the game ends, write:

    Game over

Any other logging that currently exists in the code should be removed.


