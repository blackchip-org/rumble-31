# params

For debugging the game, the web GUI accepts URL parameters to adjust
settings or to pre-populate state. Those parameters are as follows:

## strikes

Set the number of strikes initially given for each player. This is a sequence
of four digits, where the first digit is the strikes to give to seat 0, the
second digit is the strikes to give to seat 1, the third to seat 2, and the
fourth to seat 3. For example, "strikes=1121" will give each seat a strike
except for seat 2, which gets two. A seat given 3 or more strikes starts the
game already eliminated. If that seat is seat 0, the game is over before it
starts: no rounds are played at all.

## north, south, east, west, pot

Used to immediately start a new game and pre-populate a player's hand
or the pot. This should use card notation and always contain three cards.
For example:

    north=7s8h9c

Populates North's starting hand with a seven of spades, an eight of hearts,
and the nine of clubs. When this happens, the rules are as follows:

- An initial deck is constructed
- Assigned cards are given out first to the specified players and/or pot
- Deck is then shuffled with the remaining cards
- Dealing happens like normal, but those who already have cards are skipped

Note that is this specific case, the dealing is not animated. The game
should immediately start.

## turn

The player that should start first. Value should be a seat name (north,
south, etc)



