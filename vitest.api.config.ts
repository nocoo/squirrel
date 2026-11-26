import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    globals: true,
    allowOnly: false,
    passWithNoTests: false,
    include: ["tests/api/**/*.test.ts"],
    testTimeout: 30_000,
    fileParallelism: true,
  },
});
