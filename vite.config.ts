import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite 7 + React 18 build config for the compensation dashboard.
// Emits to dist/ (gitignored) and uses Lightning CSS for CSS minification
// (Vite 7 default; declared explicitly here for clarity).
export default defineConfig({
  // GitHub Pages serves the app at /compensation-dashboard/, so use a relative
  // base to ensure asset URLs work regardless of the deployment subpath.
  base: "./",
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    cssMinify: "lightningcss",
  },
});
