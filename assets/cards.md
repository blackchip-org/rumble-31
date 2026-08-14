# cards.png

This is a tile sheet containing images of playing cards. The dimensions
are as follows:

- Sheet size: 1911 x 1859
- Tile size: 147 x 169
- Columns: 13
- Rows: 11

The first row contains special cards. These are described below indexed by
their column number (1-based):

- 1: Unknown (used when there is unclear which card to display)
- 2: Joker filled, light
- 3: Joker outlined, light
- 4: Joker filled, dark
- 5: Joker outlined, dark
- 6: Card back - light blue
- 7: Card back - dark blue
- 8: Card back - light red
- 9: Card back - dark red
- 10: Card back - light yellow
- 11: Card back - dark yellow
- 12: Card back - white
- 13: Card back - gray

All other rows contain cards of every rank for a particular suit. The order
of the cards from left to right is:

    A 2 3 4 5 6 7 8 9 T J Q K

The rows have the following suits (1 - based):

- 2: Spades, black
- 3: Hearts, red
- 4: Diamonds, red
- 5: Clubs, black
- 6: Diamonds, blue
- 7: Clubs, green
- 8: Spades, purple
- 9: Hearts, purple
- 10: Diamonds, purple
- 11: Clubs, purple

Rows 2, 3, 4, 5 are used in a standard 2-color deck.
Rows 2, 3, 6, 7 are used in a standard 4-color deck.
