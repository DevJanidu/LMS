import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import messages from "../../src/messages/en.json";
import { assertEnvironmentIsolation } from "../../src/lib/deployment-policy.mjs";
/**
 * Model and reasoning controls on the real stack. The mock model (scripts/mock-openai-
 * provider.mjs) records each request's model, effort, verbosity and tools, so these tests
 * verify what the backend actually sends, not just the label on screen.
 */
const provider = process.env.AVEN_E2E_PROVIDER;
const file = (() => {
  try {
    return parse(readFileSync(".env.develop", "utf8"));
  } catch {
    return {} as Record<string, string>;
  }
})();
test.describe.configure({ mode: "serial" });
test.skip(!provider || !file.DATABASE_URL_UNPOOLED, "Set AVEN_E2E_PROVIDER and provide .env.develop with a development database.");
if (file.DATABASE_URL_UNPOOLED)
  assertEnvironmentIsolation({ APP_ENV: "development", ENVIRONMENT_ISOLATED: "true", DATABASE_URL: file.DATABASE_URL, DATABASE_URL_UNPOOLED: file.DATABASE_URL_UNPOOLED });
const sql = neon(file.DATABASE_URL_UNPOOLED || "postgres://unset@localhost/unset");
const m = messages.aven.models;
let userId = "";
async function signIn(context: BrowserContext, baseURL: string) {
  const token = randomBytes(24).toString("base64url");
  if (!userId) {
    userId = randomUUID();
    await sql.transaction([
      sql`INSERT INTO users (id, name, email, email_verified, role, status, accepted_terms_at, onboarding_completed_at)
          VALUES (${userId}, 'Model Controls Fixture', ${`e2e-models-${userId}@example.com`}, true, 'learner', 'active', now(), now())`,
      sql`INSERT INTO accounts (id, user_id, account_id, provider_id) VALUES (${randomUUID()}, ${userId}, ${`google-${userId}`}, 'google')`,
    ]);
  }
  await sql`INSERT INTO sessions (id, user_id, token, expires_at) VALUES (${randomUUID()}, ${userId}, ${token}, ${new Date(Date.now() + 864e5)})`;
  const signature = createHmac("sha256", file.AUTH_SECRET).update(token).digest("base64");
  await context.addCookies([{ name: "better-auth.session_token", value: encodeURIComponent(`${token}.${signature}`), url: baseURL, httpOnly: true, sameSite: "Lax" }]);
  const enabled = await context.request.post("/api/aven", { data: { kind: "enableAven" }, headers: { Origin: new URL(baseURL).origin } });
  expect(enabled.ok()).toBe(true);
}
const lastRequest = async () => ((await (await fetch(`${provider}/requests`)).json()) as Record<string, unknown>[]).at(-1)!;
const composer = (page: Page) => page.getByPlaceholder(messages.aven.messagePlaceholder);
async function ask(page: Page, text: string) {
  await composer(page).fill(text);
  await composer(page).press("Enter");
  await expect(page.getByRole("button", { name: messages.aven.stopGeneration })).toHaveCount(0, { timeout: 45000 });
}
const trigger = (page: Page) => page.getByRole("button", { name: /^Model: / });
const menu = (page: Page) => page.getByRole("dialog", { name: m.menuLabel });
/** Clicks an option the way a person does: on its label (the radio itself is visually hidden). */
const choose = (page: Page, name: string | RegExp) => menu(page).getByRole("radio", { name }).locator("xpath=ancestor::label[1]").click();

test.afterAll(async () => {
  if (!userId) return;
  await sql`DELETE FROM ai_usage_records WHERE user_id = ${userId}`;
  await sql`DELETE FROM users WHERE id = ${userId}`;
});
test.beforeEach(async ({ context, baseURL }) => {
  await fetch(`${provider}/stats/reset`, { method: "POST" });
  await signIn(context, baseURL!);
});

test("defaults to GPT-6.1 Sol with Auto reasoning, and the backend really calls Sol", async ({ page }) => {
  await page.goto("/aven?new=1");
  await expect(trigger(page)).toContainText("GPT-6.1 Sol");
  await trigger(page).click();
  await expect(menu(page).getByRole("radio", { name: /GPT-6.1 Sol/ })).toBeChecked();
  await expect(menu(page).getByText(m.recommended)).toBeVisible();
  await expect(menu(page).getByRole("radio", { name: /Auto/ })).toBeChecked();
  await page.keyboard.press("Escape");
  await ask(page, "Hello there");
  const request = await lastRequest();
  expect(request).toMatchObject({ model: "gpt-6.1-sol", verbosity: "medium" });
  // Auto chose the lightest effort Sol supports for a greeting ("none" is not supported by Sol).
  expect(request.effort).toBe("low");
  await expect(page.locator(".aven-message-model").last()).toHaveText("GPT-6.1 Sol");
});

test("switching to GPT-6 Luna, Deep and Concise changes the real request and keeps history", async ({ page }) => {
  await page.goto("/aven?new=1");
  await ask(page, "Hello there");
  await trigger(page).click();
  // Keyboard: the choices are native radios.
  await choose(page, /GPT-6 Luna/);
  await menu(page).getByRole("radio", { name: /^Deep/ }).focus();
  await page.keyboard.press("Space");
  await choose(page, m.details.concise);
  await page.keyboard.press("Escape");
  await expect(trigger(page)).toContainText("GPT-6 Luna");
  await expect(trigger(page)).toContainText(m.modes.deep.label);
  await ask(page, "Explain recursion");
  expect(await lastRequest()).toMatchObject({ model: "gpt-6-luna", effort: "high", verbosity: "low" });
  // Earlier messages stay; each reply is labelled with the model that answered it.
  await expect(page.locator(".aven-message[data-role='user']")).toHaveCount(2);
  await expect(page.locator(".aven-message-model").first()).toHaveText("GPT-6.1 Sol");
  await expect(page.locator(".aven-message-model").last()).toHaveText(`GPT-6 Luna · ${m.modes.deep.label}`);
});

test("the choice is saved: it survives a refresh and applies to new conversations", async ({ page }) => {
  await page.goto("/aven?new=1");
  await expect(trigger(page)).toContainText("GPT-6 Luna");
  await trigger(page).click();
  await expect(menu(page).getByRole("radio", { name: /^Deep/ })).toBeChecked();
  await expect(menu(page).getByRole("radio", { name: m.details.concise })).toBeChecked();
  // Extended maps to the model's real top tier.
  await choose(page, /^Extended/);
  await page.keyboard.press("Escape");
  await ask(page, "Prove that the square root of two is irrational");
  expect(await lastRequest()).toMatchObject({ model: "gpt-6-luna", effort: "xhigh" });
  const [row] = await sql`SELECT value FROM ai_user_preferences WHERE user_id = ${userId}`;
  expect(row.value).toMatchObject({ model: "luna", reasoning: "extended", detail: "concise" });
});

test("the server rejects model ids and settings the registry does not allow", async ({ context, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  const post = (body: Record<string, unknown>) =>
    context.request.post("/api/aven/chat", {
      headers: { Origin: origin },
      data: { conversationId: null, goalId: null, requestId: randomUUID(), message: "Hi", planning: false, references: [], ...body },
    });
  expect((await post({ model: "gpt-4o" })).status()).toBe(400);
  expect((await post({ reasoning: "maximum" })).status()).toBe(400);
  const settings = await context.request.post("/api/aven", { headers: { Origin: origin }, data: { kind: "modelSettings", model: "gpt-6.1-sol", reasoning: "auto", detail: "balanced", interactive: true } });
  expect(settings.status()).toBe(400);
});

test("turning interactive responses off removes the block tools from the request", async ({ page }) => {
  await page.goto("/aven?new=1");
  await trigger(page).click();
  await menu(page).getByRole("switch", { name: m.interactive }).click();
  await page.keyboard.press("Escape");
  await ask(page, "[checklist] Create a checklist to prepare for studying Java");
  const request = await lastRequest();
  expect((request.tools as string[]).some((name) => name.startsWith("show"))).toBe(false);
  await trigger(page).click();
  await menu(page).getByRole("switch", { name: m.interactive }).click();
  await page.keyboard.press("Escape");
  await ask(page, "[checklist] Create a checklist to prepare for studying Java");
  expect(((await lastRequest()).tools as string[]).includes("showChecklist")).toBe(true);
});

test("AI usage limits are enforced on the server", async ({ page }) => {
  // Simulate this month's spend at the configured per-account cap.
  await sql`INSERT INTO ai_usage_records (user_id, request_id, model, day, reserved_tokens, input_tokens, output_tokens, cost_micros, status)
            VALUES (${userId}, ${randomUUID()}, 'gpt-6.1-sol', current_date, 0, 0, 0, 100000000, 'complete')`;
  const before = (await (await fetch(`${provider}/requests`)).json()).length;
  await page.goto("/aven?new=1");
  await composer(page).fill("Hello again");
  await composer(page).press("Enter");
  // The account cap and the shared workspace cap are both $5 in this environment; the
  // workspace check runs first, so either refusal is a correct enforcement.
  const refusal = new RegExp(`${messages.aven.errors.usageLimit}|${messages.aven.errors.workspaceUsageLimit.slice(0, 40)}`);
  await expect(page.getByRole("alert").filter({ hasText: refusal })).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(messages.aven.notSent)).toBeVisible();
  // Refused before any model request was made.
  expect((await (await fetch(`${provider}/requests`)).json()).length).toBe(before);
  await sql`DELETE FROM ai_usage_records WHERE user_id = ${userId} AND cost_micros = 100000000`;
});

test("the menu works on a phone and in dark mode, without console errors", async ({ page }) => {
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    const text = message.text();
    // Known, pre-existing and outside Aven: the sidebar theme switcher (SidebarAccount)
    // renders aria-checked from a browser-only theme value, causing a hydration warning.
    if (message.type() === "error" && !(text.includes("aria-checked") && text.includes("Use system setting")))
      problems.push(`console: ${text.slice(0, 300)}`);
  });
  await page.setViewportSize({ width: 375, height: 780 });
  await page.goto("/aven?new=1");
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await trigger(page).click();
  await expect(menu(page)).toBeVisible();
  // The menu must be an opaque surface once its short open animation has finished.
  await menu(page).evaluate((node) => Promise.all(node.getAnimations({ subtree: true }).map((animation) => animation.finished)));
  const surface = await menu(page).evaluate((node) => {
    const style = getComputedStyle(node);
    return { background: style.backgroundColor, opacity: style.opacity, classes: node.className };
  });
  console.log(JSON.stringify(surface));
  expect(surface.opacity).toBe("1");
  expect(surface.background).not.toMatch(/rgba\(.*,\s*0(\.\d+)?\)|transparent/);
  const box = await menu(page).boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/aven-model-menu-mobile-dark.png" });
  await menu(page).getByRole("switch", { name: m.interactive }).focus();
  await page.keyboard.press("Escape");
  expect(problems).toEqual([]);
});
