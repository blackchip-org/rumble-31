# assets

Assets are stored in the assets directory, grouped into subdirectories
by type: images, sounds, and fonts.

## Images (assets/images/)

- cards.png: A tile sheet containing card images. The file, cards.md,
describes the layout of the tile sheet.
- cards-highlight.png: A tile sheet of highlighted/selected-card
variants of the same cards, sharing cards.png's exact layout and tile
size (see cards.md).

## Sounds (assets/sounds/)

- 31.wav: Round ends with a player winning with a 31
- 32.wav: Round ends with a player winning with a 32
- deal.wav: Card dealt
- end-of-round.wav: Round ends with a player winning with a score that is 
not 31 or 32
- lose.wav: Over screen reached (a game ending, or the screen=over
debug param) with the human losing. Not played when a saved Over
screen is restored from state on load (see state.md).
- knock.wav: Player knocks
- slide.wav: When a card slide animation starts
- turn.wav: Human player's turn 
- win.wav: Same as lose.wav, but with the human winning

## Fonts (assets/fonts/)

- ComicNeue-Bold.ttf (from Google Fonts)
- Inconsolata-Regular.ttf (from Google Fonts)
- NewRocker-Regular.ttf (from Google Fonts)
