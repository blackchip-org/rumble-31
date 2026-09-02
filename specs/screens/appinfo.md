# Application Info (appinfo) 

When visiting this web site from a mobile device and not visiting it
through an installed app, this page is shown first. 

In a large heading, it has "Rumble 31" just like it does in the Main Screen.
Below that is the text:

    This game works best when installed as an application on your mobile
    device. If your device did not prompt you to install this, use the
    instructions below.

This should be followed by instructions on how to install it on Android
or iOS depending on their device. 

Below that is a "Proceed Anyway" button that when clicked, navigates to the
Main Menu.

This screen is never itself saved as part of the state described in
specs/state.md, and it is only ever shown when no saved state exists at
all -- once the player proceeds, the Main Menu's own transition saves
the `main` marker (specs/state.md), so the screen is not shown again on
a later visit. It is also skipped whenever the URL includes any of the
debug parameters described in specs/params.md, the same way the Main
Screen is (specs/screens/main.md) -- use `screen=appinfo` to reach it
directly for debugging.
