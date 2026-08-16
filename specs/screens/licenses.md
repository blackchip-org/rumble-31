# Licenses (licenses)

The licenses screen should start with a centered header that reads
"Licenses".

Next, side-by-side, is a list box containing all the items that have a
license, and a text area containing the contents of the license. These
should be populated using the licenses.json file found in the root directory
of the repository. This part should expand to fill the screen vertically.

The list box is sorted alphabetically by item name. The "Rumble 31"
entry is selected by default, with its license text already shown in
the text area. Clicking a different item in the list box shows that
item's license text instead.

At the bottom is a button, "Main Menu" that navigates the user back to the
Main Menu when clicked.

## Mobile

On a narrow phone-portrait viewport (see gui.md), the list box and
text area stack top to bottom instead of side by side -- the list on
top, the license text below -- so the list doesn't crowd the text into
a sliver. This uses the same phone-sized portrait breakpoint as the
Game Screen's mobile layout (specs/screens/game.md).
