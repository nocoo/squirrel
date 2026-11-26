import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/bdd",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["html", { open: "never" }]],
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  use: {
    baseURL: "http://127.0.0.1:27067",
    trace: "on-first-retry",
    headless: true,
  },
  webServer: {
    command: "bun scripts/test-server.ts",
    url: "http://127.0.0.1:27067/api/live",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
