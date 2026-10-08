import { defineConfig } from "@playwright/test";
const baseURL = process.env.APP_URL ?? "http://localhost:3000";
export default defineConfig({
  testDir: "./tests/e2e", fullyParallel: false, timeout: 120000,
  expect: { timeout: 30000 },
  use: { baseURL, trace: "retain-on-failure", channel: process.env.PLAYWRIGHT_CHANNEL },
  webServer: process.env.PLAYWRIGHT_EXTERNAL_SERVER === "1" ? undefined : { command: `npm run build && npm run start -- --port ${new URL(baseURL).port || "3000"}`, url: baseURL, reuseExistingServer: false, timeout: 240000 },
});
