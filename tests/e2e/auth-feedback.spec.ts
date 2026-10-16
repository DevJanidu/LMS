import { expect, test } from "@playwright/test";
import messages from "../../src/messages/en.json";

const t = messages.studyflow;

for (const theme of ["light", "dark"] as const) {
test(`sign-in offers only Google and keeps the legal footer (${theme})`, async ({ page, context }, testInfo) => {
  await context.addCookies([{ name: "sf-theme", value: theme, url: testInfo.project.use.baseURL! }]);
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto("/login");
  await expect(page.getByRole("button", { name: t.continueWithGoogle, exact: true })).toBeVisible();
  await expect(page.locator('input[type="email"], input[type="password"]')).toHaveCount(0);
  await expect(page.getByRole("link", { name: t.terms, exact: true })).toHaveAttribute("href", "/terms");
  await expect(page.getByRole("link", { name: t.privacy, exact: true })).toHaveAttribute("href", "/privacy");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`google-sign-in-${theme}.png`) });
});
}

test("Google redirect errors show fixed copy without echoing provider text", async ({ page }) => {
  await page.goto("/login?error=ACCOUNT_INACTIVE");
  await expect(page.locator(".sf-auth-form").getByRole("alert")).toHaveText(t.accountInactive);
  await page.goto(`/login?error=${encodeURIComponent("<b>provider text</b>")}`);
  await expect(page.locator(".sf-auth-form").getByRole("alert")).toHaveText(t.googleSignInFailed);
});

test("retired password pages and endpoints are unavailable", async ({ page, request }) => {
  await page.goto("/register");
  await expect(page).toHaveURL(/\/login$/);
  for (const path of ["/forgot-password", "/reset-password", "/verify-email"]) expect((await request.get(path)).status(), path).toBe(404);
  const origin = new URL(page.url()).origin;
  for (const path of ["sign-in/email", "sign-up/email", "request-password-reset"]) {
    const response = await request.post(`/api/auth/${path}`, { headers: { Origin: origin }, data: { email: "fixture@example.com", password: "fixture-password-only" } });
    expect(response.ok(), path).toBe(false);
  }
});

test("starting Google sign-in carries a validated returnTo through the callback URL", async ({ page }) => {
  let body: { provider?: string; callbackURL?: string } | undefined;
  await page.route("**/api/auth/sign-in/social", async route => {
    body = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ url: "about:blank", redirect: false }) });
  });
  await page.goto("/login?returnTo=%2Fsubjects%2Fabc");
  await page.getByRole("button", { name: t.continueWithGoogle, exact: true }).click();
  await expect.poll(() => body?.provider).toBe("google");
  expect(body!.callbackURL).toBe("/login?returnTo=%2Fsubjects%2Fabc");
  body = undefined;
  await page.goto("/login?returnTo=https%3A%2F%2Fattacker.example.com");
  await page.getByRole("button", { name: t.continueWithGoogle, exact: true }).click();
  await expect.poll(() => body?.callbackURL).toBe("/login");
});
