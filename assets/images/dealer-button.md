# dealer-button.svg, dealer-button-empty.svg

These are the two dealer-button icons shown inline with the score box
and strike indicators in each seat panel (specs/screens/game.md):

- dealer-button.svg: the seat holding the button. White fill, black
  border, with a black 'D' in the middle.
- dealer-button-empty.svg: every other seat, marking where the button
  would go. Dark gray fill, black border, no letter.

## Geometry

Both share a 24x24 `viewBox`. The circle is centered at `(12, 12)`
with radius `10` and a `stroke-width` of `2`, matching the strike
indicators (strike-indicators.md) so the two sit the same size in the
seat panel row.

dealer-button.svg's 'D' is a `<text>` element at `(12, 13)`,
`text-anchor="middle"`, `dominant-baseline="central"`,
`font-family="sans-serif"`, `font-weight="bold"`, `font-size="11"`.

## Colors

Unlike the strike indicators, these colors are literal per
specs/screens/game.md, not theme variables -- the dealer button's
look doesn't change with theme.

| File                     | Border | Fill    | Letter |
|--------------------------|--------|---------|--------|
| dealer-button.svg        | `#000` | `#fff`  | `#000` |
| dealer-button-empty.svg  | `#000` | `#555`  | none   |
