import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const projectRoot = resolve(import.meta.dirname, "../..");

export default defineConfig({
  root: import.meta.dirname,
  publicDir: resolve(projectRoot, "assets/generated"),
  plugins: [react()],
  resolve: {
    alias: {
      "@blackwater/game-core": resolve(
        projectRoot,
        "packages/game-core/src/index.ts",
      ),
      "@blackwater/protocol": resolve(
        projectRoot,
        "packages/protocol/src/index.ts",
      ),
    },
  },
  build: {
    outDir: resolve(projectRoot, "dist/web"),
    emptyOutDir: true,
    target: ["chrome111", "edge111", "firefox114", "safari16.4"],
    sourcemap: false,
    rolldownOptions: {
      input: {
        index: resolve(import.meta.dirname, "index.html"),
        display: resolve(import.meta.dirname, "display.html"),
        play: resolve(import.meta.dirname, "play.html"),
        host: resolve(import.meta.dirname, "host.html"),
      },
      output: {
        codeSplitting: true,
      },
    },
  },
  server: {
    port: 5175,
    strictPort: true,
    proxy: {
      "/api": "http://127.0.0.1:8787",
      "/socket.io": {
        target: "ws://127.0.0.1:8787",
        ws: true,
      },
    },
  },
});
