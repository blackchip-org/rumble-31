# Rumble 31

Card game engine with a browser-based GUI. TypeScript, run directly by
Node (no build step — `.ts` files execute via Node's native TypeScript
support).

## Toolchain

npm scripts handle installing dependencies, type-checking, running
tests, playing in the browser, and running headless bot-vs-bot
simulations. See [toolchain.md](toolchain.md) for the full list of
commands and related notes.

## Specifications

Specifications can be found in the markdown files in the specs directory.
See [specs/index.md](specs/index.md) for a list of spec files and what
each one covers.

## General Guidance

When updating documentation in markdown files, keep line length limited to
80 characters.

When writing tests, prefer writing table driven tests when possible.

If the specification is unclear and you need to ask me questions,
incorporate my responses into the plan and also propose any necessary changes
to the specification to fix the ambiguity.

When writing commit messages, keep them concise and only list the
highlights of the work that has been performed. Say what was done, not how
it was done nor why it was done.

Try to avoid doing manual tests by invoking command line binaries with
a shell. Design the core logic to accept Readers and Writers, have
main supply standard in and standard out, and rely on standard unit
tests.

Always ask for permission before executing sudo. Approval to run a
command as non-root does not imply approval to run that command as root. If
you get a permission denied error, ask before running sudo.

When asked to commit, first generate a commit message for review. Do the
actual commit once that message is approved.

Use nvm to install and use node.

When a spec describes a value that's actually a config.ts constant
(specs/config.md), reference the constant by name (e.g. "pauses for
ROUND_END_PAUSE milliseconds") instead of hardcoding its current
value in prose -- the value can change without the spec going stale.


