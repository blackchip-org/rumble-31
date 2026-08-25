# Difficulty Screen (difficulty)

Reached from the Main Screen's "New Game" button. The entire contents
of the screen are in a panel centered horizontally and vertically.

Main header shows "Choose Difficulty".

Below the header are the following buttons:

- Random
- Easy
- Moderate
- Hard
- Main Menu

Clicking "Easy", "Moderate", or "Hard" starts a new game immediately
at that difficulty. Each difficulty determines the odds of which
three bot skill levels (specs/bots_v3.md) are seated for the game's
three bot seats, per the mapping configured in config.ts.

Clicking "Random" starts a new game immediately at one of Easy,
Moderate, or Hard, chosen with equal probability.

Clicking "Main Menu" returns to the Main Screen without starting a
game.

The difficulty chosen here is saved to local storage, and is what
"Play Again" (specs/screens/over.md) reuses when starting another
game without returning to this screen -- except that choosing
"Random" is also remembered, so each "Play Again" re-rolls a fresh
random difficulty instead of reusing the one just played.
