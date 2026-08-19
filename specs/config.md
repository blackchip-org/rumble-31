# config

Values that should be available for the developer to tweak easily are
included in a config.ts file. It holds the following constants:

- DIFFICULTY_BOT_STRATEGIES: Maps each Difficulty option of the
Settings Screen (specs/screens/settings.md) to the three bot
strategies (specs/bots.md) seated for that game's three bot seats.
- MIN_BOT_THINK_TIME: The minimum number of milliseconds to pause to
simulate bot thinking.
- MAX_BOT_THINK_TIME: The maximum number of milliseconds to pause to
simulate bot thinking.
- DEAL_ANIMATION_DELAY: The number of milliseconds to pause between
each card dealt during the round-start dealing animation.
- TRADE_ANIMATION_DURATION: The total number of milliseconds for one
card's trade animation (hand to pot, then pot to hand). Exchanging a
whole hand plays this animation once per card, in sequence, not once
for all three.
- ROUND_END_PAUSE: The number of milliseconds the round-end recap is
shown before the next round starts automatically.

