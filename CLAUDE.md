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

Always ask for my permission before executing sudo. Approval to run a
command as non-root does not imply approval to run that command as root. If
you get a permission denied error, ask before running sudo.
