import { expect, test } from "@playwright/test";

test("public pages and unauthenticated route protection", async ({ page }) => {
  await page.goto("/dashboard"); await expect(page).toHaveURL(/\/login\?returnTo=%2Fdashboard$/);
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  await page.goto("/admin"); await expect(page).toHaveURL(/\/login\?returnTo=%2Fadmin$/);
  await page.goto("/register"); await expect(page.getByLabel("Date of birth (optional)")).toBeVisible();
  await page.setViewportSize({ width: 360, height: 780 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.goto("/privacy"); await expect(page.getByText(/Owner policy placeholder:/)).toBeVisible();
});

test("learner registration, topics, server timer refresh and history", async ({ page }) => {
  test.setTimeout(300000);
  test.skip(!process.env.E2E_DATABASE_READY, "Requires a migrated disposable Neon branch and configured app environment.");
  const email = `e2e-${crypto.randomUUID()}@example.com`;
  await page.goto("/register");
  await page.getByLabel("Name", { exact: true }).fill("Integration Learner");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("fixture-password-only");
  await page.locator('input[name="terms"]').check();
  await page.getByRole("button", { name: "Sign up", exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
  for (let step = 0; step < 5; step++) await page.getByRole("button", { name: "Skip", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/subjects?add=1");
  await page.getByLabel("Title", { exact: true }).fill("E2E Subject");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("link", { name: "E2E Subject", exact: true }).click();
  await page.getByRole("tab", { name: "Topics", exact: true }).click();
  await page.getByLabel("New topic").fill("Revision");
  await page.getByRole("button", { name: "Add Topic", exact: true }).click();
  await page.getByRole("checkbox", { name: /Completed: Revision/ }).check();
  await expect(page.getByText(/100%/).first()).toBeVisible();
  await page.goto("/study");
  await page.getByLabel("Subject", { exact: true }).selectOption({ label: "E2E Subject" });
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pause", exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Pause", exact: true }).first().click();
  await expect(page.getByRole("button", { name: "Resume", exact: true }).first()).toBeEnabled();
  await page.reload();
  await expect(page.getByRole("button", { name: "Resume", exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Resume", exact: true }).first().click();
  // Test actual server elapsed time: client counters and supplied durations are ignored.
  await page.waitForTimeout(61000);
  await page.getByRole("button", { name: "Finish", exact: true }).first().click();
  await page.getByRole("button", { name: "Save session", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.goto("/study/history");
  await expect(page.getByRole("cell", { name: "E2E Subject", exact: true }).first()).toBeVisible();
  await page.goto("/admin"); await expect(page).toHaveURL(/\/dashboard$/);
});
