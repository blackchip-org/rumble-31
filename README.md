# Rumble-31

A card game engine, playable in a browser.

## Setup

```bash
npm install
```

## Playing in the browser

```bash
npm run web:dev
```

This starts a dev server (Vite) and prints a local URL — open it in your
browser to play. You are seat 0, playing against three bots.

To build a static, deployable copy instead:

```bash
npm run web:build
```

The output goes to `dist/web`, which you can preview locally with:

```bash
npm run web:preview
```

See [CLAUDE.md](CLAUDE.md) for the full toolchain (tests and type
checking).
