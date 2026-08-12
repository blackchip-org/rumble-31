# Bots

A player in Rumble 31 can be assigned to a bot.

There are three different bot strategies depending on a difficulty level
these are:

- Easy
- Regular
- Difficult

In the descriptions below, the following applies:

If a number is given such as [18-20], that means to generate a random number at
the beginning of the turn between those numbers inclusive and use that number.
This is to prevent the player picking up on exact numbers when the bot will do
something.

To "improve the hand" is to increase the score value of the hand.

The "upstream" is the seat that acts before the bot. The "downstream"
is the seat that acts after the bot.

An "unnecessary" card is a card in a players hand that is not contributing
to the score value.

When computing the score of an incomplete hand (fewer than 3 known
cards), unknown cards count as zero value and match no suit.

The strategies in the bulleted lists should be followed from top to
bottom.

## Easy

The easy strategy mimics a new player to the game. They have familiarity
with playing card games in general, but this one is new to them. As they play,
they are focused on improving their hand but not really watching the
other players.

Strategy:
- Take pot or keep: Take pot if it improves the hand
- Knock if it is the bot's own [18-22]th turn or later
- Exchange all cards with the pot when its score is >= 30
- Trade to improve the hand
- If the hand is >= [28-30], knock
- Trade a random unnecessary card for a random card
- Trade randomly

## Regular

The regular strategy mimics a player that has experience playing this game
and has developed a basic strategy. They are aware that the actions of other
players are worth observing and knowing who is collecting what can help
decide on card trades and exchanges.

This bot tracks:
- Best score and round. After the bot takes an action, if its score is
greater than or equal to the best score, update the best score and set
the best round to the current round
- Last suit of card upstream took
- Last suit of card upstream discarded
- Last suit of card downstream took

A card that is not of the suit that the upstream is collecting is a
"favorable" card. A card in the suit that the upstream is discarding
is more favorable than one that is not.

A card that does not help the downstream player is a "safe" card. A card
is safe if it is not in the suit it is collecting.

Strategy:
- Take pot or keep: Take pot if it improves the hand
- Knock if it is the bot's own [25-30]th turn or later
- Exchange all cards with the pot when its score is >= 30
- If the hand score equals the best score and the best round was over [3-5]
rounds ago, knock
- Trade to improve the hand
- Trade an unnecessary card for a favorable one
- Trade an unnecessary card for one that makes a pair
- Trade a safe card for a random card
- Trade a random card

## Difficult

The difficult strategy mimics a player that is deeply familiar with this
game and has developed an analytical strategy. They track precise details
of the upstream and downstream players using public information. They keep a
memory map of those opponents' hands as that slowly becomes known.

This bot tracks:
- Best score and round. After the bot takes an action, if its score is
greater than or equal to the best score, update the best score and set
the best round to the current round
- Hand of the upstream player by adding cards that player has collected
and removing cards that player has discarded
- Hand of the downstream player by adding cards that player has collected
and removing cards that player has discarded

A card that does not improve the upstream's hand is a "favorable" card.
A card that does not improve the downstream's hand is a "safe" card.

Strategy:
- Take pot or keep: Take pot if it improves the hand
- Knock if it is the bot's own [25-30]th turn or later
- Exchange all cards with the pot when its score is >= 30
- If the hand score equals the best score and the best round was over
[3-5] rounds ago, knock
- Trade to improve the hand
- Trade an unnecessary card for a favorable one
- Trade an unnecessary card for one that makes a pair
- Trade a safe card for a random card
- Trade a random card




