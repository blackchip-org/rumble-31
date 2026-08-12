# Bots

A player in Rumble 31 can be assigned to a bot.

There are three different bot strategies depending on a difficulty level
these are:

- Easy
- Regular
- Difficult

## Easy

The easy strategy mimics a new player to the game. They have familiarity
with playing card games in general, but this one is new to them. As they play,
they are focused on improving their hand but not really watching the
other players.

- On the round's first turn only, exchange the entire hand with the pot
if all three pot cards are of the same suit and that point value is
greater than the point value in hand.
- Otherwise, trade a card from the pot when it improves the score of
the hand
- If no card from the pot improves the score of the hand, trade for
the card that will give the hand with the highest score
- If the hand score is over 25, knock
- If the hand score does not improve for more than three consecutive turns
  of the bot's own (i.e. no improvement on the 4th such turn in a row),
  knock
- Knock if it is the bot's own 20th turn or later


## Regular

The regular strategy mimics a player that has experience playing this game
and has developed a basic strategy. They are aware that the actions of other
players are worth observing and knowing who is collecting what can help
decide on card trades and exchanges.

- On the round's first turn only, exchange the entire hand with the pot
  if all three pot cards are of the same suit and that point value is
  greater than the point value in hand.
- For each opponent, track a running tally of the suits of the cards
  they are currently holding that they took from the pot (i.e. cards
  known, from public trade/exchange history, to be in their hand right
  now). This is the opponent's apparent target suit: whichever suit
  appears most among their known-held cards.
- On each turn, first find every pot/hand swap that gives the
  highest-scoring hand, as the easy strategy does.
- Among the swaps tied for the highest score, prefer the one whose
  discarded card's suit matches the fewest opponents' apparent target
  suits, so the bot avoids feeding a card back into the pot that helps
  an opponent it believes is collecting that suit. Break any remaining
  tie the way the easy strategy would (lowest-index match).
- If the hand score is already 31 or 32, knock immediately, since no
  higher score is possible.
- If the hand score is over 25, knock.
- If the hand score does not improve for more than three consecutive
  turns of the bot's own (i.e. no improvement on the 4th such turn in
  a row), knock.
- Knock if it is the bot's own 20th turn or later.

## Difficult

The difficult strategy mimics a player that is deeply familiar with this
game and has developed an analytical strategy. They keep track of which
cards have been played and can deduce what each player has according
to public information.

- On the round's first turn only, exchange the entire hand with the pot
  if all three pot cards are of the same suit and that point value is
  greater than the point value in hand.
- For each opponent, maintain the exact set of cards known to be in
  their hand right now, derived from public trade/exchange history:
  a card they took from the pot is known-held until they later trade
  or exchange it away. An opponent's entire hand is known exactly once
  that set reaches all 3 cards -- immediately on an exchange, or once
  three distinct hand slots of theirs have each been traded away at
  least once. (Trading three or more times is not enough by itself:
  an opponent who keeps re-trading the same slot never reveals the
  other two.) Only then can the bot compute their current score
  exactly rather than estimate it.
- On each turn, evaluate every pot/hand swap. For a swap tied for the
  highest resulting score, prefer, in order:
  1. The swap that avoids discarding a card into the pot that would
     complete or improve an opponent's known-held cards into a
     higher score than the bot's own resulting hand. If every tied
     swap would feed some opponent this way, this preference is
     dropped and all of them stay in play for the next preference,
     rather than leaving the bot with no legal choice.
  2. The swap whose discarded card's suit matches the fewest
     opponents' known-held suits, as in the regular strategy, using
     exact known-held cards instead of an apparent-suit tally.
- If the hand score is already 31 or 32, knock immediately.
- If the hand score is over 25 and no opponent with a fully-known hand
  currently has a higher score, knock.
- If the hand score does not improve for more than three consecutive
  turns of the bot's own, knock, unless a fully-known opponent's hand
  currently scores lower than the bot's own, in which case wait one
  further turn before knocking.
- Knock if it is the bot's own 20th turn or later.

