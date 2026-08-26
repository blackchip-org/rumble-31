---
name: audit-gui-layout
description: Run specs/gui.md's Layout checklist against one or more of the web GUI's screens using the Browser pane, sweeping window sizes and measuring actual scrollHeight/clientHeight overflow rather than eyeballing screenshots. Takes an optional argument naming one or more screen identifiers from specs/gui.md (e.g. "/audit-gui-layout main" or "/audit-gui-layout stats settings") to scope the audit to just those screens; with no argument it covers every screen. Use when the user asks to audit, review, or check the GUI's layout/responsiveness, wants to know if resizing breaks a screen, or after any change to style.css/theme.css to check for regressions on screens that share the edited rule. Not for a single quick visual check of a specific known-good screen -- this is for a deliberate sweep looking for overflow/scrollbar/padding bugs.
---

# Audit GUI Layout

Mechanically applies the checklist in `specs/gui.md`'s Layout section
to one, several, or all of the screens listed in that file's Screens
section. The checklist says *what* to check; this skill is the
concrete procedure -- which sizes to try and how to measure overflow
precisely enough to catch a 1px scrollbar a screenshot would miss.

Read `specs/gui.md`'s Layout section first if it's not already in
context -- this skill assumes its rules (shrink-to-fit is the design,
page scrolling is a last resort, etc.) rather than restating them.

## Step 1: Start the dev server

```bash
npm run web:dev
```

Use `preview_start` with the `rumble-31-web` launch config (or
`rumble-31-web-preview` on port 6173 if 5173 is already occupied by
another session's server) rather than running this in the background
yourself -- the Browser pane tools need a `tabId` from it.

## Step 2: Pick which screens to audit

Every screen identifier is listed in `specs/gui.md`'s Screens section
(the parenthesized id after each screen's name, e.g. `(main)`,
`(stats)`). Reach any of them directly without navigating the app by
hand:

```
http://localhost:6173/?screen=<id>&clear=true
```

`clear=true` avoids resuming a saved game or leftover state from a
previous check interfering with this one.

Scope which screens to audit, in this order of precedence:

1. **An argument was passed to the skill** (e.g.
   `/audit-gui-layout main` or `/audit-gui-layout stats settings`) --
   treat each word as a screen identifier and audit exactly those. If
   a given identifier isn't in `specs/gui.md`'s Screens list, say so
   and stop rather than guessing which screen was meant.
2. **No argument, but the user named a screen in conversation** (or a
   screen whose CSS was just edited) -- audit that one, plus any other
   screen that shares the edited rule (see Step 6).
3. **Neither of the above** -- audit every screen. This is the
   default, since a fix or regression on one screen doesn't say
   anything about the others.

**The `game` screen** needs seeded state, or you'll be auditing a
mid-deal animation instead of a stable layout. Use the `north`,
`south`, `east`, `west`, and `pot` debug params (specs/params.md) to
pin all four hands and the pot, which skips the dealing animation
entirely. Cards must be drawn only from this game's deck (specs/rules.md):
**ranks 7-9, T, J, Q, K, A only** -- 2 through 6 will throw a "params:
invalid rank" error and land you on the Error screen instead. Fifteen
distinct cards across the five groups, e.g.:

```
&north=7s8h9c&south=TsJhQc&east=KdAc7h&west=8d9hTd&pot=JdQhKs
```

## Step 3: Find this screen's breakpoints before choosing sizes

Don't just sweep round numbers -- the bugs this skill exists to catch
live at breakpoint boundaries, not in the middle of a size range.
Grep the two stylesheets for what actually governs this screen's
layout:

```bash
grep -n "vw\|vh\|@media" src/web/style.css src/web/theme.css
```

For every `@media (min-width: Npx)`, `(max-width: Npx)`,
`(min-height: Npx)`, or `(max-height: Npx)` that touches this screen
(directly, or via a shared custom property like
`--font-size-title`/`--card-w`), note N -- you'll test N-1, N, and N+1
on the relevant dimension in Step 4. A rule gated on **two**
dimensions at once (e.g. `min-width: 901px` *and* `min-height: 700px`)
is the highest-risk shape: the space where one condition holds but the
other doesn't is exactly where a term meant to be bounded by both
`vw` and `vh` often turns out to only be bounded by one -- check that
gap specifically, not just each threshold in isolation.

## Step 4: Sweep sizes and measure, don't eyeball

For each screen, resize through this baseline matrix, adding any
boundary values found in Step 3. Use `browser_batch` to chain
resize + measure pairs in one round trip instead of one call per size:

- Baseline desktop: 1440x900, 1024x768, 1920x1080 (ceiling check)
- Wide-but-short: 1800x600, 1200x620
- Narrow-but-tall (a squarish desktop window, not a phone):
  900x900 -- this caught a real bug once (a `max-width: 900px` rule
  with no height gate, meant for phones, firing on an ordinary desktop
  window that was merely 1px narrower than its neighbor breakpoint)
- Mobile portrait: 375x812
- Mobile landscape (real phones, triggers `max-height: 500px`
  breakpoints if present): 812x375, 667x375

The measurement, run via `javascript_tool` after each resize:

```js
(() => {
  const se = document.scrollingElement;
  return JSON.stringify({
    oX: se.scrollWidth - se.clientWidth,
    oY: se.scrollHeight - se.clientHeight,
  });
})()
```

Non-zero `oY` at a size the checklist expects to fit is page-level
scroll -- a checklist violation on its own (specs/gui.md: "Relying on
this ... is a sign the layout needs another look"). Non-zero `oX` is
always worth flagging; nothing in this app's design calls for
horizontal scrolling. A screen with its own internal scrollable panel
(e.g. Stats' tab content) is expected to show overflow *inside that
panel*, not at the page level -- if you need to tell the two apart,
compare the panel's own `scrollHeight`/`clientHeight` instead of (or
in addition to) `document.scrollingElement`'s.

## Step 5: Diagnose, don't just report a number

When a size overflows, find the mechanism before writing it up:

- Read the relevant `clamp()`/`calc()`/`@media` rule in `style.css` or
  `theme.css` and check which of `vw` or `vh` (or which breakpoint
  dimension) is missing.
- Use `javascript_tool` with `getBoundingClientRect()` on the
  suspect containers (e.g. `#table`, `#log-panel`, `.main-panel`) to
  see which one is actually contributing the extra height, rather
  than guessing from the screenshot.
- Check whether the same overflow reproduces at a neighboring size one
  or two pixels on either side of a breakpoint -- a sudden jump from 0
  to a large number right at the threshold confirms it's that rule,
  not a broader problem.

## Step 6: Check shared custom properties across every screen that reads them

If a fix touches a custom property defined once in `theme.css` (e.g.
`--font-size-title`, `--card-w`), re-run Step 4's matrix on every
other screen that reads it, not just the one you were asked about --
grep for the property name across `style.css` to find them all.

## Step 7: Report

For each screen: clean, or a short list of findings. Each finding
needs the reproducing size, the measured overflow in px, and the
specific rule/file/line responsible -- enough for the fix to start
from the diagnosis instead of re-deriving it. Don't propose or make
code changes as part of this skill unless the user separately asks
for the fix; this is an audit.

Reset the emulated viewport back to the `desktop` preset when done.
