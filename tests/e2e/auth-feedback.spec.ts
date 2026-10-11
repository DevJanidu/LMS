import { expect, test } from "@playwright/test";

test("login explains invalid emails and missing passwords next to the field", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("not-an-email");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toHaveText(/valid email address/);
  await expect(page.getByLabel("Email", { exact: true })).toBeFocused();
  await expect(page.getByLabel("Email", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await page.getByLabel("Email", { exact: true }).fill("fixture@example.com");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toHaveText("Please enter your password.");
  await expect(page.getByLabel("Password", { exact: true })).toBeFocused();
});

test("invalid reset links offer recovery and valid-shaped links validate new passwords", async ({ page, request }) => {
  const resetPage = await page.goto("/reset-password?error=INVALID_TOKEN");
  expect(resetPage?.headers()["referrer-policy"]).toBe("no-referrer");
  await expect(page.locator("form").getByRole("alert")).toHaveText(/missing, invalid, or has expired/);
  await expect(page.getByRole("link", { name: "Send me a new reset link" })).toHaveAttribute("href", "/forgot-password");
  await expect(page.getByRole("button", { name: "Reset password", exact: true })).toHaveCount(0);
  const response = await request.get("/api/auth/reset-password/fixture-token?callbackURL=https://attacker.example.com", { maxRedirects: 0 });
  expect(response.status()).toBe(303);
  expect(response.headers().location).toContain("/reset-password?token=fixture-token");
  expect(response.headers().location).not.toContain("attacker.example.com");
  await page.goto("/reset-password?token=fixture-token");
  await page.getByLabel("Password", { exact: true }).fill("short");
  await page.getByRole("button", { name: "Reset password", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toHaveText(/at least 8 characters/);
  await page.getByLabel("Password", { exact: true }).fill("fixture-password-only");
  await page.getByLabel("Confirm password", { exact: true }).fill("different-password");
  await page.getByRole("button", { name: "Reset password", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toHaveText("Those passwords don't match. Try again.");
  await expect(page.getByLabel("Confirm password", { exact: true })).toBeFocused();
});

test("password-reset service failures show recovery advice instead of claiming delivery", async ({ page }) => {
  test.skip(Boolean(process.env.RESEND_API_KEY), "Requires the public CI fixture with email delivery disabled.");
  await page.goto("/forgot-password");
  await page.getByLabel("Email", { exact: true }).fill("fixture@example.com");
  await page.getByRole("button", { name: "Send reset link", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toHaveText(/temporarily unavailable/);
  await expect(page.locator("form").getByRole("status")).toHaveCount(0);
});
