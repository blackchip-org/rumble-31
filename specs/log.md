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
number, and Seat shows with seat goes first. A blank line is emitted before
the log message.

    === Round X ===
    Pot is dealt [7h 8c 9d]
    South is dealt [7h 8c 9d]
    Seat goes first

When a player trades a card with the pot use the following where 7h is the
card from the player's hand that is going to the pot and 8d is the card
from the pot that is going to the player's hand.

    Seat trades [7h] for [8d]

When a player exchanges all cards with the pot, use the following where
7h 8s 9d are the cards from the player's hand that is going to the pot and
Th Js Qd are the cards from the pot going to the player's hand.

    Seat exchanges [7h 8s 9d] for [Th Js Qd]

When a player knocks, use:

    Seat knocks

After the player's action, the pot should be announced again:

    Pot is [7h 8c 9d]
