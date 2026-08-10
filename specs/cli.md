# Command line interface

A command line interface is implemented in the internal/cli package. A
main file in cmd/rumble-31-cli/main.go is used to invoke the CLI.

The command line interface allows a human player to play against three other
bots. The player is always assigned to seat #0. The game should immediately
start when invoking the command line interface.

When it is the player's turn, prompt them on which action to take depending
on the legal actions for that turn. When a player needs to select a card,
the options should be 1, 2 or 3 for the first, second, or third.

When it is a player's turn, the pot should be shown first, and then the
player's hand. If the player is trading with the pot, the first question
should be which card to select from the pot followed by which card from
the hand.

The program ends when the match is over.

On the game's first turn, the player is offered a trade or an
exchange. On every other turn, the player is offered a trade, an
exchange, or a knock; the exchange option is labeled as also ending
the game (knocking), since it does everywhere but the first turn.

When a bot takes its turn, only publicly known information is shown:
the action it took (exchanged with the pot, or knocked) and the pot
afterward. A bot's hand is never shown, matching the game engine's
rule that a strategy never sees another player's hand.

The CLI plays a full match, per specs/rules.md, not a single game. After each
game the player is still part of, show that game's final hands, scores, ranks,
and the current number of strikes, noting which seats were struck and which
were eliminated, then pause for the player to press enter before the next game
is dealt.

Once the player is eliminated, the rest of the match plays out
silently: no more dealing delays, thinking delays, turn narration,
recaps, or pauses. Only the match's final result — every seat's
strike count and the winner(s) — is shown once it ends.

Delays (via Sleep) should be added to simulate bots thinking and for dealing
cards as follows:

- When showing the initial pot, simulate dealing with a 100ms sleep before
showing each card
- When its a bot's turn, simulate its thinking with a random sleep between
500ms and 2 seconds. Before sleeping print out "seat x is thinking..." where
x is the seat number of the bot

## Command Line Options

A -seed flag accepts an int64 to reproduce a specific deal and turn
order; it defaults to a random seed.

A -strikes flag is used for debugging and set the number of strikes initially
given for each player. This is a sequence of four digits, where the first
digit is the strikes to give to seat 0, the second digit is the strikes to
give to seat 1, the third to seat 2, and the fourth to seat 3. For example,
"-strikes 1121" will give each seat a strike except for seat 2, which gets
two. A seat given 3 or more strikes starts the match already eliminated.
