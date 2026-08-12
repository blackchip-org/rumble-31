# Rumble-31

Card game engine with a browser-based GUI. TypeScript, run directly by
Node (no build step — `.ts` files execute via Node's native TypeScript
support).

## Toolchain

Install dependencies:

```bash
npm install
```

Type-check the whole project:

```bash
npm run typecheck
```

Run the test suite:

```bash
npm test
```

Run a single test file directly:

```bash
node --test src/card/score.test.ts
```

Play in the browser (starts a Vite dev server):

```bash
npm run web:dev
```

Run headless bot-vs-bot games to compare strategies:

```bash
npm run simulate -- --games=1000 --strat=erdr
```

Omit `--strat` to run every distinct 4-bot combo and report them as a
table:

```bash
npm run simulate -- --games=1000
```

## Notes

- `npm install` regenerates `buildstamp.json` via the `prepare` script
  (`scripts/gen-buildtime.mjs`).
- Tests live alongside the code they cover (`*.test.ts`) and run with
  Node's built-in test runner — no separate test framework.

## Specifications

Specifications can be found in the markdown files in the specs directory.

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

Use nvm to install use and install node. 

When using a web server for testing, first check to see if there is 
an existing instance on port 5173. If so, use that before trying to start
a web server yourself. 
