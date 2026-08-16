# icons

The app's home-screen/PWA icons (favicon, Android home-screen icon,
Android adaptive icon, iOS home-screen icon) are rasterized PNGs
checked into `src/web/public/`. Their source of truth is a pair of
reference SVGs in `assets/`.

## Source files

- `assets/icon-source.svg` — the "any purpose" icon: a rounded
  square with a border inset from the edge.
- `assets/icon-source-maskable.svg` — the maskable variant for
  Android adaptive icons. The background fills the full 512x512
  canvas edge-to-edge, and the border/wordmark are kept inside the
  safe zone (an 80%-diameter circle centered on the icon) so
  Android's mask never clips them.

Both are 512x512 `viewBox` SVGs with the same design:

- Background: `#1b5e3a` (the felt-green theme background).
- Border: a rounded-rect stroke in `#d9a441` (the gold accent color).
- Wordmark: "31" set in New Rocker (`assets/NewRocker-Regular.ttf`),
  the same display font used for headings in the app.
- Drop shadow: a `feDropShadow` filter on the text matching the
  `--heading-text-shadow` custom property in `src/web/theme.css`
  (`0 2px 4px rgba(0, 0, 0, 0.5)`), so the wordmark reads consistently
  with headings elsewhere in the app.

Both files are marked "Reference only" — they aren't loaded by the
app at runtime. They exist so the design can be edited and
re-rasterized; the app only ever serves the generated PNGs below.

## Generated PNGs

All live in `src/web/public/`:

| File                     | Size    | Source     | Used for            |
|--------------------------|---------|------------|----------------------|
| `icon-512.png`           | 512x512 | any        | favicon, manifest   |
| `icon-192.png`           | 192x192 | any        | manifest            |
| `icon-512-maskable.png`  | 512x512 | maskable   | manifest            |
| `icon-192-maskable.png`  | 192x192 | maskable   | manifest            |
| `apple-touch-icon.png`   | 180x180 | any        | iOS home screen     |

"Source" is which reference SVG generates the file: `any` means
`icon-source.svg`, `maskable` means `icon-source-maskable.svg`.

These sizes and purposes are registered in
`src/web/public/manifest.webmanifest` (the maskable/any pair) and
`src/web/index.html` (the favicon `<link>` and
`apple-touch-icon` `<link>`). If a new size is ever added, register
it in both places.

These PNGs are ordinary checked-in files, not build output — nothing
regenerates them automatically. Edit them by editing the source SVG
and re-rasterizing by hand (below), the same way `cards.png` or the
other files in `assets/` are maintained.

## Regenerating the PNGs

Neither `rsvg-convert` nor ImageMagick reliably handles this SVG:
`rsvg-convert` can't pick up an unregistered font (New Rocker isn't
installed as a system font), and `feDropShadow` support is
inconsistent across their SVG rasterizers. The reliable path is to
rasterize with an actual browser, which loads the font via
`@font-face` and renders the filter natively:

1. Take the SVG text (`icon-source.svg` or `icon-source-maskable.svg`)
   and inject a `<style>` block into its `<defs>` that `@font-face`
   registers New Rocker from a base64 data URI (read
   `assets/NewRocker-Regular.ttf`, base64-encode it, and embed it —
   this keeps the SVG self-contained so it can be loaded from a
   `Blob` URL without a network fetch).
2. In a real browser tab, load that self-contained SVG as an
   `Image` (`new Image(); img.src = URL.createObjectURL(blob)`).
3. Once the image loads, draw it onto a `<canvas>` sized to the
   target output (512, 192, or 180 px square) with
   `ctx.drawImage(img, 0, 0, size, size)` — drawing at a smaller
   canvas size than the 512-unit source scales the border stroke,
   font size, and shadow down together, which is what keeps every
   generated size looking consistent.
4. Call `canvas.toDataURL("image/png")` to get the rasterized PNG as
   a base64 data URL, then write those bytes to the corresponding
   file in `src/web/public/`.

When doing this interactively (e.g. via Claude Code's browser
preview tool), get the base64 bytes out of the browser and onto disk
by POSTing them from the page to a small local HTTP server that
writes the file — copying large base64 strings through a chat
transcript by hand is error-prone and can silently corrupt the PNG.

After regenerating, reload the app and visually confirm the border,
wordmark, and shadow look right at both 512 and 192 — nothing
currently automates that check.
