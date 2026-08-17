import { defineConfig } from "vite";

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
});
