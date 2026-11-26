import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  resolve: {
    alias: {
      "cloudflare:workers": fileURLToPath(
        new URL("./test/cloudflare-workers-stub.ts", import.meta.url),
      ),
    },
  },
  test: {
    globals: true,
    environment: "node",
    server: {
      deps: {
        inline: ["@cloudflare/workers-oauth-provider"],
      },
    },
    allowOnly: false,
    passWithNoTests: false,
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/types.ts", "src/**/index.ts"],
      reporter: ["text", "lcov", "json-summary"],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
    testTimeout: 20_000,
  },
});
