# offline

The web client works offline after its first successful load. It is a
fully static bundle — the game runs entirely in the browser, with bot
opponents and all state kept locally (see [state.md](state.md) and
[stats.md](stats.md)) — so a service worker that precaches the build is
all that is needed.

## How it works

`vite-plugin-pwa` (configured in `vite.config.ts`) runs Workbox in
`generateSW` mode during `npm run web:build`. It emits `dist/web/sw.js`
plus a `workbox-*.js` runtime, and injects a small registration script
into `index.html`.

- **Precache.** Every file the build emits — HTML, JS, CSS, the fonts,
  the card sheets, the sound effects, the icons, and the manifest — is
  precached on install (about 2.6 MB). Hashed asset URLs are treated as
  immutable; `index.html` and the icons are revisioned by content hash.
- **Serving.** Precached responses are served cache-first, so once
  installed the app opens with no network. Navigation requests fall back
  to `index.html`.
- **Updates.** `registerType: "autoUpdate"`. When a new build is
  deployed, the new service worker installs in the background, then
  activates and reloads open tabs on its own. There is no "update
  available" prompt; players always get the latest build on their next
  launch, one reload behind at worst.

The manifest itself is still the hand-written
`src/web/public/manifest.webmanifest` (`manifest: false` in the plugin
config); the plugin only manages the service worker.

## Development

The service worker is disabled under `npm run web:dev` — it would only
serve stale files while iterating. Offline behavior can only be
exercised against a production build:

```
npm run web:build
npm run web:preview
```

Then, in the browser's dev tools: confirm the service worker is
**activated** (Application > Service Workers) and the cache is populated
(Application > Cache Storage), then set the network to **Offline** and
reload — the app should start normally.

## Not cached

Nothing in the app makes network requests at runtime, so there is
nothing else to cache. The external links on the About screen open in a
new tab and need a connection like any other link.
