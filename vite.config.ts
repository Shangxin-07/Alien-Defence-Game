import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig(({ mode }) => {
  // `npm run build:single` inlines the game into one shareable HTML file.
  const single = mode === "single";
  return {
    // Relative base so the build also works from a GitHub Pages sub-path.
    base: "./",
    plugins: single ? [viteSingleFile()] : [],
    build: {
      outDir: single ? "dist-single" : "dist",
      emptyOutDir: !single,
      // three.js plus the embedded map data make one large chunk; that's expected for now.
      chunkSizeWarningLimit: 2500,
    },
  };
});
