import { defineConfig } from "vite";
import path from "node:path";

export default defineConfig({
  server: {
    port: 5173,
    open: false,
  },
  resolve: {
    alias: {
      "@puck-off/shared": path.resolve(__dirname, "../../packages/shared/src"),
      "@puck-off/game-engine": path.resolve(
        __dirname,
        "../../packages/game-engine/src",
      ),
    },
  },
  optimizeDeps: {
    include: ["matter-js"],
  },
});
