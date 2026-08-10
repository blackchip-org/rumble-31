# Bots

A player in Rumble 31 can be assigned to a bot. 

The basic strategy of the bot is this:

- On the game's first turn only, exchange the entire hand with the pot
if all three pot cards are of the same suit and that point value is
greater than the point value in hand. The bot never exchanges on any
other turn, since doing so would also knock, ending the game.
- Otherwise, trade a card from the pot when it improves the score of
the hand
- If no card from the pot improves the score of the hand, trade for
the card that will give the hand with the highest score
- If the hand score is over 25, knock
- If the hand score does not improve for more than three consecutive turns
  of the bot's own (i.e. no improvement on the 4th such turn in a row),
  knock
- Knock if it is the bot's own 20th turn or later

