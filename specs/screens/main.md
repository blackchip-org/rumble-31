# Main Screen (main)

When a user visits the web application without any URL parameters, the
main screen should be shown. The background color should be a green color
that resembles the same green you would see on a felt table.

If the URL includes any of the debug parameters described in
specs/params.md, the main screen is skipped entirely and the Game
Screen starts immediately, as it does today.

The entire contents of the screen are in a panel that should be centered
horizontally and vertically. This
panel contains:

- The title of the game "Rumble 31" in a large font size. Rumble and 31 should
be on different lines. Use New Rocker regular for this font and render it
in white.
- The following buttons. The background color of the button should be a dark
blue and the text is white:
    - New Game
    - How to Play
    - Stats
    - Settings
    - About

Clicking on the "New Game" button navigates to the Game Screen.
Clicking on the "How to Play" button navigates to the How to Play screen.
Clicking on the "Stats" button navigates to the Stats Screen.
Clicking on the "Settings" button navigates to the Settings Screen.
Clicking on the "About" button navigates to the About Screen.
