import { defineConfig } from "vite";

// The web client lives under src/web, alongside the CLI's own src/cli —
// Vite's root points there so index.html can import the game engine via
// plain relative paths (e.g. "../game/game.ts"), same as the CLI does.
export default defineConfig({
  root: "src/web",
  build: {
    outDir: "../../dist/web",
    emptyOutDir: true,
  },
});
