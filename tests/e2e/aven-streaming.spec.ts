import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { loadAppEnv } from "../../scripts/lib/env-file.mjs";
import { neon } from "@neondatabase/serverless";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import messages from "../../src/messages/en.json";

loadAppEnv();
/**
 * Real stack, mocked model: the dev server runs with AVEN_PROVIDER_URL pointing at
 * scripts/mock-openai-provider.mjs, so routing, after(), durable snapshots, status polling,
 * persistence and usage accounting are all real while model output is deterministic.
 * Requires AVEN_E2E_PROVIDER (the mock's base URL) and a non-production database.
 */
const provider = process.env.AVEN_E2E_PROVIDER;
const sql = neon(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "postgres://unset@localhost/unset");
test.describe.configure({ mode: "serial" });
test.skip(!provider, "Set AVEN_E2E_PROVIDER to the mock provider and run the dev server against it.");
let userId = "";
async function signIn(context: BrowserContext, baseURL: string) {
  const secret = process.env.AUTH_SECRET ?? process.env.BETTER_AUTH_SECRET!;
  const token = randomBytes(24).toString("base64url");
  if (!userId) {
    userId = randomUUID();
    await sql.transaction([
      sql`INSERT INTO users (id, name, email, email_verified, role, status, accepted_terms_at, onboarding_completed_at)
          VALUES (${userId}, 'Aven Streaming Fixture', ${`e2e-aven-${userId}@example.com`}, true, 'learner', 'active', now(), now())`,
      sql`INSERT INTO accounts (id, user_id, account_id, provider_id) VALUES (${randomUUID()}, ${userId}, ${`google-${userId}`}, 'google')`,
    ]);
  }
  await sql`INSERT INTO sessions (id, user_id, token, expires_at) VALUES (${randomUUID()}, ${userId}, ${token}, ${new Date(Date.now() + 864e5)})`;
  const signature = createHmac("sha256", secret).update(token).digest("base64");
  await context.addCookies([{ name: "better-auth.session_token", value: encodeURIComponent(`${token}.${signature}`), url: baseURL, httpOnly: true, sameSite: "Lax" }]);
}
const stats = async () => (await fetch(`${provider}/stats`)).json() as Promise<Record<string, number>>;
const resetStats = () => fetch(`${provider}/stats/reset`, { method: "POST" });
const composer = (page: Page) => page.getByPlaceholder(messages.aven.messagePlaceholder);
const assistant = (page: Page) => page.locator('.aven-message[data-role="assistant"]');
async function send(page: Page, text: string) {
  await composer(page).fill(text);
  await composer(page).press("Enter");
}
/** Text of the newest reply as rendered. */
const replyText = (page: Page) => assistant(page).last().locator(".aven-prose").innerText().catch(() => "");
const stopButton = (page: Page) => page.getByRole("button", { name: messages.aven.stopGeneration });
async function expectSettled(page: Page) {
  await expect(stopButton(page)).toHaveCount(0, { timeout: 45000 });
  await expect(assistant(page).last()).not.toHaveAttribute("data-streaming", /.*/);
  const text = await replyText(page);
  // The reply ends exactly once: no duplicated fragments from reconnecting.
  expect(text.split("I will adjust it.").length - 1).toBe(1);
  expect(text.split("Your Advanced Java week").length - 1).toBe(1);
}
async function hide(page: Page, hidden: boolean) {
  await page.evaluate((value) => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (value ? "hidden" : "visible") });
    Object.defineProperty(document, "hidden", { configurable: true, get: () => value });
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);
}
test.beforeAll(async ({ browser, baseURL }) => {
  const context = await browser.newContext();
  await signIn(context, baseURL!);
  // Consent through the product's own API, as the onboarding card does.
  const enabled = await context.request.post("/api/aven", {
    data: { kind: "enableAven" },
    headers: { Origin: new URL(baseURL!).origin },
  });
  expect(enabled.ok(), await enabled.text()).toBe(true);
  await context.close();
});
test.afterAll(async () => {
  if (!userId) return;
  await sql`DELETE FROM ai_usage_records WHERE user_id = ${userId}`;
  await sql`DELETE FROM users WHERE id = ${userId}`;
});
test.beforeEach(async ({ context, baseURL }) => {
  await resetStats();
  await signIn(context, baseURL!);
});

test("streams a reply progressively, renders Markdown and restores it instantly after reload", async ({ page }) => {
  await page.goto("/aven?new=1");
  await send(page, "[slow] Schedule Advanced Java next week after 7 PM");
  // The message appears immediately and the composer resets.
  await expect(page.locator('.aven-message[data-role="user"]').last()).toContainText("Schedule Advanced Java");
  await expect(composer(page)).toHaveValue("");
  await expect(stopButton(page)).toBeVisible();
  // Genuine incremental delivery: the visible text grows while the reply is still streaming.
  await expect.poll(async () => (await replyText(page)).length, { timeout: 15000 }).toBeGreaterThan(20);
  const early = (await replyText(page)).length;
  await expect(assistant(page).last()).toHaveAttribute("data-streaming", "true");
  await expect.poll(async () => (await replyText(page)).length, { timeout: 15000 }).toBeGreaterThan(early + 40);
  await expectSettled(page);
  const reply = assistant(page).last();
  await expect(reply.locator("table")).toBeVisible();
  await expect(reply.locator("ul ul li")).toHaveCount(2);
  await expect(reply.locator('input[type="checkbox"]')).toHaveCount(2);
  await expect(reply.locator("pre code")).toContainText("stream()");
  expect((await stats()).slow).toBe(1);
  // Reload: the completed reply renders at once, with no typing replay or streaming state.
  await page.reload();
  await expect(assistant(page).last().locator("table")).toBeVisible();
  await expect(assistant(page).last()).not.toHaveAttribute("data-streaming", /.*/);
  await expect(assistant(page).last()).not.toHaveAttribute("data-enter", /.*/);
  expect((await stats()).slow).toBe(1);
});

test("navigating to Subjects mid-reply and back restores the reply without a second model request", async ({ page }) => {
  await page.goto("/aven?new=1");
  await send(page, "[slow] Plan my evenings");
  await expect.poll(async () => (await replyText(page)).length, { timeout: 15000 }).toBeGreaterThan(10);
  const conversation = await page.waitForURL(/conversation=/).then(() => new URL(page.url()).searchParams.get("conversation"));
  await page.goto("/subjects");
  await page.waitForTimeout(1500);
  await page.goto(`/aven?conversation=${conversation}`);
  // Still running on the server: the view follows it to completion instead of getting stuck.
  await expectSettled(page);
  expect((await stats()).slow).toBe(1);
});

test("refreshing during streaming resumes from the durable snapshot and completes once", async ({ page }) => {
  await page.goto("/aven?new=1");
  await send(page, "[slow] Refresh scenario");
  await page.waitForURL(/conversation=/);
  await expect.poll(async () => (await replyText(page)).length, { timeout: 15000 }).toBeGreaterThan(30);
  await page.reload();
  // The partial reply is shown from the snapshot and keeps growing.
  await expect(stopButton(page)).toBeVisible({ timeout: 15000 });
  await expectSettled(page);
  expect((await stats()).slow).toBe(1);
});

test("a hidden tab and a dropped connection recover without duplicates or a stuck state", async ({ page, context }) => {
  await page.goto("/aven?new=1");
  await send(page, "[slow] Hidden tab scenario");
  await page.waitForURL(/conversation=/);
  await expect.poll(async () => (await replyText(page)).length, { timeout: 15000 }).toBeGreaterThan(10);
  await hide(page, true);
  await context.setOffline(true);
  await page.waitForTimeout(3000);
  await context.setOffline(false);
  await page.waitForTimeout(500);
  await hide(page, false);
  await expectSettled(page);
  expect((await stats()).slow).toBe(1);
});

test("two tabs on one conversation stay consistent and a stop in one ends it in both", async ({ page, context }) => {
  await page.goto("/aven?new=1");
  await send(page, "[slow] Two tab scenario");
  await page.waitForURL(/conversation=/);
  const url = page.url();
  const second = await context.newPage();
  await second.goto(url);
  // The second tab follows the running reply from the server.
  await expect(stopButton(second)).toBeVisible({ timeout: 15000 });
  await expect.poll(async () => (await replyText(second)).length, { timeout: 15000 }).toBeGreaterThan(10);
  await stopButton(second).click();
  await expect(stopButton(second)).toHaveCount(0, { timeout: 15000 });
  await expect(stopButton(page)).toHaveCount(0, { timeout: 15000 });
  await expect(assistant(page).last()).toContainText(messages.aven.errors.generationStopped);
  const stopped = await replyText(page);
  await page.waitForTimeout(2500);
  // Nothing keeps writing after the stop.
  expect(await replyText(page)).toBe(stopped);
  expect((await stats()).slow).toBe(1);
  await second.close();
});

test("tool activity is shown from real events and the verified card survives a refresh", async ({ page }) => {
  await page.goto("/aven?new=1");
  await send(page, "[tool] How much did I study this week?");
  await expect(page.locator(".aven-activity")).toContainText(messages.aven.activity.history, { timeout: 15000 });
  const card = assistant(page).last().locator(".aven-card").filter({ hasText: messages.aven.cards.studyAnalytics });
  await expect(card).toBeVisible({ timeout: 20000 });
  await expect(stopButton(page)).toHaveCount(0, { timeout: 20000 });
  await page.reload();
  await expect(assistant(page).last().locator(".aven-card").filter({ hasText: messages.aven.cards.studyAnalytics })).toBeVisible();
});

test("closing the chat and returning after more than a minute shows the finished reply at once", async ({ page }) => {
  test.setTimeout(180000);
  await page.goto("/aven?new=1");
  await send(page, "[slow] Long absence scenario");
  await page.waitForURL(/conversation=/);
  const conversation = new URL(page.url()).searchParams.get("conversation");
  await expect.poll(async () => (await replyText(page)).length, { timeout: 15000 }).toBeGreaterThan(10);
  await page.goto("about:blank");
  await page.waitForTimeout(65000);
  await page.goto(`/aven?conversation=${conversation}`);
  await expect(assistant(page).last().locator("table")).toBeVisible();
  // Finished while away: no generating state, no replayed typing.
  await expect(stopButton(page)).toHaveCount(0);
  await expect(assistant(page).last()).not.toHaveAttribute("data-enter", /.*/);
  await expectSettled(page);
  expect((await stats()).slow).toBe(1);
});

test("every turn reserved and settled usage exactly once", async () => {
  const rows = await sql`SELECT request_id, status FROM ai_usage_records WHERE user_id = ${userId}`;
  const ids = rows.map((row) => row.request_id);
  // One usage record per turn: tab switches, navigation, refreshes and a second tab never
  // charged again.
  expect(new Set(ids).size).toBe(ids.length);
  expect(rows.length).toBe(7);
  // Only the turn stopped mid-stream has unknown provider usage, so only it keeps its
  // conservative reservation (existing billing policy); every other turn settled.
  expect(rows.filter((row) => row.status === "reserved")).toHaveLength(1);
});

test("mobile layout in dark mode streams without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 780 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto("/aven?new=1");
  await send(page, "Hello");
  await expect(stopButton(page)).toHaveCount(0, { timeout: 20000 });
  await expect(assistant(page).last()).toContainText("ready to help");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/aven-mobile-dark.png" });
});
