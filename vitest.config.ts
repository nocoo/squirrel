import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    allowOnly: false,
    passWithNoTests: false,
    setupFiles: ["./src/test/setup-dom-globals.ts", "./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: [
        "src/models/**/*.ts",
        "src/viewmodels/**/*.ts",
        "src/lib/**/*.ts",
        "src/hooks/**/*.ts",
        "src/data/**/*.ts",
      ],
      exclude: [
        "src/components/**",
        "src/pages/**",
        "src/App.tsx",
        "src/main.tsx",
        "src/test/**",
        "src/**/*.test.{ts,tsx}",
        "src/**/*.spec.{ts,tsx}",
        "src/**/index.ts",
        "src/models/types.ts",
        "src/data/api.ts",
      ],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
