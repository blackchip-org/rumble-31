# Bots

A player in Rumble 31 can be assigned to a bot.

There are three different bot skill levels; these are:

- Novice
- Advanced
- Expert

Each skill level follows its own strategy: the checklist of rules,
described below, that the bot works through top to bottom to decide
its action each turn.

## Bot version

The three skill levels share one bot version number, tracked in
src/bot/version.ts. It only changes when a strategy file changes --
src/bot/novice.ts, advanced.ts, expert.ts, helpers.ts, or factory.ts.
The app version (specs/version.md) can bump on its own without moving
this number, since not every app change touches bot behavior. This
lets future stats tracking tell which games were played under which
bot strategies.

The current bot version is 2.

At the start of the game, the three bots' skill levels are chosen
according to the Settings Screen's Difficulty setting (specs/screens/
settings.md: "Easy", "Moderate", or "Hard"), each of which maps to a
tuple of three of the skill levels above, configured in config.ts.
These three bots are then randomly assigned to the remaining seats
(the human is always South), so which skill level ends up in which
seat varies from game to game.

In the descriptions below, the following applies:

If a number is given such as [18-20], that means to generate a random number at
the beginning of the turn between those numbers inclusive and use that number.
This is to prevent the player picking up on exact numbers when the bot will do
something.

To "improve the hand" is to increase the score value of the hand.

The "upstream" is the seat that acts before the bot. The "downstream"
is the seat that acts after the bot.

An "unnecessary" card is a card in a player's hand that is not contributing
to the score value.

When computing the score of an incomplete hand (fewer than 3 known
cards), unknown cards count as zero value and match no suit.

The strategies in the bulleted lists should be followed from top to
bottom.

## Novice

The Novice strategy mimics a new player to the game. They have familiarity
with playing card games in general, but this one is new to them. As they
play, they keep an eye on how their own hand is trending across the
round, but are still too new to read the table the way Advanced and
Expert do.

This bot tracks:
- Best score and turn. At the start of each round, reset both to 0.
After the bot acts on its own turn, if its hand's score is greater
than or equal to the best score, set the best score to that score and
the best turn to the bot's own turn number

Strategy:
- Take pot or keep: the pot is unseen at this point, so take the
  blind gamble if the hand's own score is below [13-16]; otherwise keep
- If another player has already knocked this round (this is the bot's
  last turn before the round ends), compare the hand's own score, the
  score from exchanging for the whole pot, and the best score reachable
  by trading a single pot card for a hand card; take whichever of the
  three scores highest, preferring to knock on a tie, then to exchange
- Knock if it is the bot's own [25-30]th turn or later
- Exchange all cards with the pot when its score is >= [27-29] and
  higher than the hand's own score (exchanging is itself a knock from
  the round's second turn on, so it needs the same bar as knocking
  with the hand directly, not just "better than what I have"). This
  and the next [27-29] bullet share the same number generated for the
  turn, not two independent rolls
- If the hand score equals the best score and it has been more than
5 of the bot's own turns since the best turn, knock
- Trade to improve the hand
- If the hand is >= [27-29], knock
- Trade a random card

## Advanced

The Advanced strategy mimics a player that has experience playing this game
and has developed a solid personal strategy. They keep an eye on how their
own hand is trending across the round, but don't yet read the table.

This bot tracks:
- Best score and turn. At the start of each round, reset both to 0.
After the bot acts on its own turn, if its hand's score is greater
than or equal to the best score, set the best score to that score and
the best turn to the bot's own turn number

Strategy:
- Take pot or keep: the pot is unseen at this point, so take it only
  when the hand's three cards are three different suits -- the weakest
  possible hand shape, since no two cards can share a suit to sum
  together; otherwise keep
- If another player has already knocked this round (this is the bot's
  last turn before the round ends), compare the hand's own score, the
  score from exchanging for the whole pot, and the best score reachable
  by trading a single pot card for a hand card; take whichever of the
  three scores highest, preferring to knock on a tie, then to exchange
- Knock if it is the bot's own [25-30]th turn or later
- Exchange all cards with the pot when its score is >= 26 and higher
  than the hand's own score (exchanging is itself a knock from the
  round's second turn on, so it needs the same bar as knocking with
  the hand directly, not just "better than what I have")
- If the hand score equals the best score and it has been more than
[3-5] of the bot's own turns since the best turn, knock
- Trade to improve the hand
- If the hand is >= 26, knock
- Trade an unnecessary card for one that makes a pair, but only half
  the time -- on the other half, continue to the next rule as if no
  pairing card was found (unlike Expert, which always takes one it
  finds)
- Trade a random card

## Expert

The Expert strategy mimics a player that is deeply familiar with this
game and has developed an analytical strategy. They track precise details
of the upstream and downstream players using public information. They keep a
memory map of those opponents' hands as that slowly becomes known.

This bot tracks:
- Best score and turn. At the start of each round, reset both to 0.
After the bot acts on its own turn, if its hand's score is greater
than or equal to the best score, set the best score to that score and
the best turn to the bot's own turn number
- Hand of the upstream player by adding cards that player has collected
and removing cards that player has discarded
- Hand of the downstream player by adding cards that player has collected
and removing cards that player has discarded

A card that does not improve the upstream's hand is a "favorable" card.
A card that does not improve the downstream's hand is a "safe" card.
A card that would improve the upstream's hand is a "denying" card to
take instead, even when it doesn't help the bot's own hand, purely to
keep it out of their hand.

Strategy:
- Take pot or keep: the pot is unseen at this point, so take it only
  when the hand's three cards are three different suits -- the weakest
  possible hand shape, since no two cards can share a suit to sum
  together; otherwise keep
- If another player has already knocked this round (this is the bot's
  last turn before the round ends), compare the hand's own score, the
  score from exchanging for the whole pot, and the best score reachable
  by trading a single pot card for a hand card; take whichever of the
  three scores highest, preferring to knock on a tie, then to exchange
- Knock if it is the bot's own [25-30]th turn or later
- Exchange all cards with the pot when its score is >= 24 and higher
  than the hand's own score (exchanging is itself a knock from the
  round's second turn on, so it needs the same bar as knocking with
  the hand directly, not just "better than what I have")
- If the hand score equals the best score and it has been more than
[3-5] of the bot's own turns since the best turn, knock
- Knock if the upstream or downstream player's hand is fully known (all
  3 cards) and the hand's own score beats that known hand's score by at
  least 5, without waiting out the turn gap above (that gap is for a
  score merely guessed to still be ahead; a fully-known hand's score
  needs no guessing)
- Trade to improve the hand, preferring a denying card among any pot
  cards tied for the best improving trade
- If the hand is >= 24, knock. Lower this bar by 3 once the downstream
  player's known hand scores within 4 of it -- they're already
  dangerous regardless of how much longer the hand is developed, so
  locking in a lower score sooner beats risking them knocking first
- Trade an unnecessary card for a denying one
- Trade an unnecessary card for a favorable one
- Trade an unnecessary card for one that makes a pair
- Trade a safe card for a random card
- Trade a random card




