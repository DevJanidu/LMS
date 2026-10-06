import { defineConfig } from "@playwright/test";
const baseURL = process.env.APP_URL ?? "http://localhost:3000";
export default defineConfig({
  testDir: "./tests/e2e", fullyParallel: false, timeout: 120000,
  use: { baseURL, trace: "retain-on-failure", channel: process.env.PLAYWRIGHT_CHANNEL },
  webServer: { command: `npm run dev -- --port ${new URL(baseURL).port || "3000"}`, url: baseURL, reuseExistingServer: !process.env.CI, timeout: 120000, env: { PLAYWRIGHT_ISOLATED_BUILD: "1" } },
});
