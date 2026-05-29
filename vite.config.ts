import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    strictPort: true,
    port: 5199
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    rollupOptions: {
      input: {
        // Desktop (Tauri) app entry + the standalone mobile "practice only" web app.
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        practice: fileURLToPath(new URL("./practice.html", import.meta.url))
      }
    }
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["src/test/setup.ts"]
  }
});
