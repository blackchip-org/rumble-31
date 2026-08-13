# Toolchain

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
