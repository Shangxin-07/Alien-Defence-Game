import { resolve } from "node:path";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig(({ mode }) => {
  // `npm run build:single` and `build:single:base` inline one page into a shareable HTML file.
  const single = mode.startsWith("single");
  const pages = { index: resolve(__dirname, "index.html"), base: resolve(__dirname, "base.html") };
  return {
    // Relative base so the build also works from a GitHub Pages sub-path.
    base: "./",
    plugins: single ? [viteSingleFile()] : [],
    build: {
      outDir: single ? "dist-single" : "dist",
      emptyOutDir: !single,
      rollupOptions: { input: mode === "single-base" ? pages.base : single ? pages.index : pages },
      // three.js plus the embedded map data make one large chunk; that's expected for now.
      chunkSizeWarningLimit: 2500,
    },
  };
});
