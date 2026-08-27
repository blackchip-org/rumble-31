import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// The web client lives under src/web, alongside the CLI's own src/cli —
// Vite's root points there so index.html can import the game engine via
// plain relative paths (e.g. "../game/game.ts"), same as the CLI does.
export default defineConfig({
  root: "src/web",
  // Deployed under a subpath that moves around (e.g. /rumble31/,
  // /v3/ during WIP), not the domain root, so asset URLs are built
  // relative to index.html rather than pinned to one absolute prefix.
  base: "./",
  build: {
    outDir: "../../dist/web",
    emptyOutDir: true,
  },
  plugins: [
    VitePWA({
      // The app ships its own manifest (src/web/public/manifest.webmanifest)
      // and <link> in index.html -- see specs/icons.md. Let the plugin
      // manage only the service worker, not the manifest.
      manifest: false,
      // A new service worker activates and reloads open tabs as soon as
      // it is ready, so players always run the latest build with no
      // update prompt. See specs/offline.md.
      registerType: "autoUpdate",
      injectRegister: "inline",
      workbox: {
        // Precache the whole bundle: code, styles, fonts, images,
        // sounds, icons, and the manifest.
        globPatterns: ["**/*.{js,css,html,ttf,png,svg,wav,webmanifest}"],
        // Single page: serve index.html for any navigation while offline.
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true,
      },
      // No service worker during `vite dev` (the default) -- it only
      // gets in the way there.
      devOptions: { enabled: false },
    }),
  ],
});
