import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite 7 + React 18 build config for the compensation dashboard.
// Emits to dist/ (gitignored) and uses Lightning CSS for CSS minification
// (Vite 7 default; declared explicitly here for clarity).
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    cssMinify: "lightningcss",
  },
});
