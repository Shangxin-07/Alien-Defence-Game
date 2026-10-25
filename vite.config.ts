import { defineConfig } from "vite";

export default defineConfig({
  // Relative base so the build also works from a GitHub Pages sub-path.
  base: "./",
  // three.js plus the embedded coastline data make one large chunk; that's expected for now.
  build: { chunkSizeWarningLimit: 1500 },
});
