import { defineConfig } from "@playwright/test";
const baseURL = process.env.APP_URL ?? "http://localhost:3000";
const startCommand = `npm run start -- --port ${new URL(baseURL).port || "3000"}`;
export default defineConfig({
  testDir: "./tests/e2e", fullyParallel: false, timeout: 120000,
  forbidOnly: Boolean(process.env.CI),
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "list",
  expect: { timeout: 30000 },
  use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure", channel: process.env.PLAYWRIGHT_CHANNEL },
  webServer: process.env.PLAYWRIGHT_EXTERNAL_SERVER === "1" ? undefined : { command: process.env.PLAYWRIGHT_SKIP_BUILD === "1" ? startCommand : `npm run build && ${startCommand}`, url: baseURL, reuseExistingServer: false, timeout: 240000 },
});
