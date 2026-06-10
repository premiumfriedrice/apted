import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    // Only match server-side tests, not the extension's.
    include: ["src/__tests__/**/*.test.ts"],
    exclude: ["extension/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});