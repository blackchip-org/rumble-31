# strike-ok.svg, strike-hit.svg, strike-second-chance.svg

These are the three strike indicator icons shown in each seat panel's
strikes row (specs/screens/game.md). Each is a filled, bordered
circle on a transparent background:

- strike-ok.svg: no strike. Green.
- strike-hit.svg: a strike. Red, with a red X (same red as the
  border).
- strike-second-chance.svg: an unused second chance (specs/rules.md)
  held at 3 strikes. Yellow, with a yellow slash ("/") (same yellow
  as the border).

## Geometry

All three share a 24x24 `viewBox`. The circle is centered at
`(12, 12)` with radius `10` and a `stroke-width` of `2` -- the border
is drawn bolder than a hairline so it reads clearly at the small
on-screen size these render at.

The X/slash marks are straight lines from border to border along the
circle's diagonals, so their endpoints sit where a diagonal at 45
degrees crosses the circle: `12 ± radius / sqrt(2)`, which is
`12 ± 7.07`, giving the four points `(4.93, 4.93)`, `(19.07, 4.93)`,
`(4.93, 19.07)`, `(19.07, 19.07)`. Marks are drawn `stroke-width="2"`,
`stroke-linecap="round"`, and use the same color as that file's
border (see Colors below) rather than a separate mark color.

- strike-hit.svg draws both diagonals (an X): `(4.93,4.93)` to
  `(19.07,19.07)`, and `(19.07,4.93)` to `(4.93,19.07)`.
- strike-second-chance.svg draws only the second diagonal (a
  bottom-left-to-top-right slash): `(4.93,19.07)` to `(19.07,4.93)`.
- strike-ok.svg draws no mark.

## Colors

Each file's border color is one of the theme's strike colors
(src/web/theme.css: `--good`, `--bad`, `--second-chance`), and its
fill color is that same color at 40% brightness (each RGB channel
multiplied by 0.4 and rounded) -- a bolder border over a muted fill.

| File                      | Border (theme var)            | Fill      |
|---------------------------|--------------------------------|-----------|
| strike-ok.svg             | `#4caf7d` (`--good`)           | `#1e4632` |
| strike-hit.svg            | `#e5484d` (`--bad`)            | `#5c1d1f` |
| strike-second-chance.svg  | `#e0c040` (`--second-chance`)  | `#5a4d1a` |

If `--good`, `--bad`, or `--second-chance` in src/web/theme.css ever
change, recompute the matching fill (border RGB x 0.4, rounded) and
update these SVGs by hand -- they are plain checked-in files, not
generated from the theme at build time.
