import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// Builds ONLY the standalone mobile practice app for static hosting.
// Output → dist-web/, with relative asset paths (base "./") so it works at a
// domain root OR a subpath (e.g. GitHub Pages project sites). A postbuild step
// renames practice.html → index.html so the deployed root IS the practice app.
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: "dist-web",
    emptyOutDir: true,
    rollupOptions: {
      input: fileURLToPath(new URL("./practice.html", import.meta.url))
    }
  }
});
