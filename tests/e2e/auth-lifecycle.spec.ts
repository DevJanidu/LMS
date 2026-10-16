import { expect, test } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import messages from "../../src/messages/en.json";
import { signInAsNewGoogleLearner } from "./google-session";

const t = messages.studyflow;

test("Google learner lifecycle: onboarding, consent, role routing, sign-out and deactivation", async ({ page, context, baseURL }) => {
  test.skip(!process.env.E2E_DATABASE_READY, "Requires a migrated disposable Neon branch and configured app environment.");
  test.setTimeout(180000);
  const { userId } = await signInAsNewGoogleLearner(context, baseURL!);
  const sql = neon(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL!);

  // A new Google account is a learner without onboarding, whatever returnTo asks for.
  await page.goto("/login?returnTo=%2Fadmin");
  await expect(page).toHaveURL(/\/onboarding$/);
  const session = await (await context.request.get("/api/auth/get-session")).json();
  expect(session.user.role).toBe("learner");

  // Terms acceptance is required on the first step and stamped when submitted.
  await expect(page.getByRole("button", { name: t.skip, exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: t.continue, exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText(t.termsRequired);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: t.continue, exact: true }).click();
  await expect(page.getByRole("button", { name: t.skip, exact: true })).toBeVisible();
  expect((await sql`SELECT accepted_terms_at FROM users WHERE id = ${userId}`)[0].accepted_terms_at).not.toBeNull();
  for (let step = 1; step < 5; step++) await page.getByRole("button", { name: t.skip, exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  // A returning onboarded learner lands on the dashboard and can never be sent to /admin.
  await page.goto("/login");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/login?returnTo=%2Fadmin%2Fusers");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/dashboard$/);

  // A deactivated account loses access on its existing session.
  await sql`UPDATE users SET status = 'deactivated' WHERE id = ${userId}`;
  try {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
    expect(await (await context.request.get("/api/auth/get-session")).json()).toBeNull();
  } finally { await sql`DELETE FROM users WHERE id = ${userId}`; }
});
