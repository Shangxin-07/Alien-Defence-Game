import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig(({ mode }) => ({
  // Relative base so the build also works from a GitHub Pages sub-path.
  base: "./",
  // `npm run build:single` inlines everything into one shareable HTML file.
  plugins: mode === "single" ? [viteSingleFile()] : [],
  build: {
    outDir: mode === "single" ? "dist-single" : "dist",
    // three.js plus the embedded map data make one large chunk; that's expected for now.
    chunkSizeWarningLimit: 2500,
  },
}));
