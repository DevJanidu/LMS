import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { expect, test, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";
import messages from "../../src/messages/en.json";
import { assertEnvironmentIsolation } from "../../src/lib/deployment-policy.mjs";
/**
 * Generative UI acceptance scenarios on the real stack with a deterministic mock model
 * (scripts/mock-openai-provider.mjs). Uses the development database from .env.develop,
 * refuses a registered production database, and deletes its three fixture learners.
 */
const provider = process.env.AVEN_E2E_PROVIDER;
const file = (() => {
  try {
    return parse(readFileSync(".env.develop", "utf8"));
  } catch {
    return {} as Record<string, string>;
  }
})();
const dbUrl = file.DATABASE_URL_UNPOOLED ?? "";
test.describe.configure({ mode: "serial" });
test.skip(!provider || !dbUrl, "Set AVEN_E2E_PROVIDER and provide .env.develop with a development database.");
// Only the database is checked here: refuse to run against the registered production host.
if (dbUrl)
  assertEnvironmentIsolation({
    APP_ENV: "development",
    ENVIRONMENT_ISOLATED: "true",
    DATABASE_URL: file.DATABASE_URL,
    DATABASE_URL_UNPOOLED: dbUrl,
  });
const sql = neon(dbUrl || "postgres://unset@localhost/unset");
const users: Record<"a" | "b" | "c", string> = { a: "", b: "", c: "" };
const t = messages.aven;
async function signIn(context: BrowserContext, baseURL: string, key: keyof typeof users) {
  const token = randomBytes(24).toString("base64url");
  if (!users[key]) {
    users[key] = randomUUID();
    await sql.transaction([
      sql`INSERT INTO users (id, name, email, email_verified, role, status, accepted_terms_at, onboarding_completed_at)
          VALUES (${users[key]}, ${`Generative UI ${key.toUpperCase()}`}, ${`e2e-genui-${users[key]}@example.com`}, true, 'learner', 'active', now(), now())`,
      sql`INSERT INTO accounts (id, user_id, account_id, provider_id) VALUES (${randomUUID()}, ${users[key]}, ${`google-${users[key]}`}, 'google')`,
    ]);
  }
  await sql`INSERT INTO sessions (id, user_id, token, expires_at) VALUES (${randomUUID()}, ${users[key]}, ${token}, ${new Date(Date.now() + 864e5)})`;
  const signature = createHmac("sha256", file.AUTH_SECRET).update(token).digest("base64");
  await context.addCookies([{ name: "better-auth.session_token", value: encodeURIComponent(`${token}.${signature}`), url: baseURL, httpOnly: true, sameSite: "Lax" }]);
  const origin = new URL(baseURL).origin;
  const enabled = await context.request.post("/api/aven", { data: { kind: "enableAven" }, headers: { Origin: origin } });
  expect(enabled.ok(), await enabled.text()).toBe(true);
}
const stats = async () => (await fetch(`${provider}/stats`)).json() as Promise<Record<string, number>>;
const composer = (page: Page) => page.getByPlaceholder(t.messagePlaceholder);
const stop = (page: Page) => page.getByRole("button", { name: t.stopGeneration });
async function ask(page: Page, text: string) {
  await composer(page).fill(text);
  await composer(page).press("Enter");
  await expect(stop(page)).toHaveCount(0, { timeout: 45000 });
}
const card = (page: Page, eyebrow: string) => page.locator(".aven-card").filter({ has: page.locator(".aven-card-eyebrow", { hasText: eyebrow }) }).last();
const ids = (page: Page) => {
  const url = new URL(page.url());
  return { conversationId: url.searchParams.get("conversation")! };
};
async function replyRequestId(conversationId: string) {
  const [row] = await sql`SELECT request_id FROM ai_messages WHERE conversation_id = ${conversationId} AND role = 'assistant' ORDER BY created_at DESC LIMIT 1`;
  return row.request_id as string;
}
/** The stored id of the newest block of a type in a conversation, as the server saved it. */
async function blockId(conversationId: string, type: string) {
  const [row] = await sql`SELECT context->>'components' AS components FROM ai_messages WHERE conversation_id = ${conversationId} AND role = 'assistant' ORDER BY created_at DESC LIMIT 1`;
  return (JSON.parse(row.components) as { id: string; type: string }[]).find((item) => item.type === type)!.id;
}
const post = (request: APIRequestContext, baseURL: string, data: unknown) =>
  request.post("/api/aven/components", { data, headers: { Origin: new URL(baseURL).origin } });

test.afterAll(async () => {
  for (const id of Object.values(users).filter(Boolean)) {
    await sql`DELETE FROM ai_usage_records WHERE user_id = ${id}`;
    await sql`DELETE FROM users WHERE id = ${id}`;
  }
});
test.beforeEach(async () => {
  await fetch(`${provider}/stats/reset`, { method: "POST" });
});

test("checklist: real checkboxes, live progress, saved state, no model calls, save as goal", async ({ page, context, baseURL }) => {
  await signIn(context, baseURL!, "a");
  await page.goto("/aven?new=1");
  await ask(page, "[checklist] Create a checklist to prepare for studying Java");
  await expect(page.locator(".aven-message[data-role='assistant']").last()).toContainText("Here is a checklist");
  const list = card(page, t.blocks.checklist);
  await expect(list.locator("input[type=checkbox]")).toHaveCount(5);
  // The block was shown without a second model request.
  expect((await stats()).checklist).toBe(1);
  await list.getByLabel("Install the latest JDK").check();
  await list.getByLabel("Write down what you want to build").check();
  await expect(list.locator(".aven-pill")).toHaveText("2 of 5 done");
  await expect(list.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "40");
  await expect(list.getByText(t.blocks.save.saved)).toBeVisible();
  await list.getByRole("button", { name: /Plan your learning/ }).click();
  await expect(list.getByRole("button", { name: /Plan your learning/ })).toHaveAttribute("aria-expanded", "false");
  // Ticking and collapsing never call the model.
  expect((await stats()).checklist).toBe(1);
  await page.reload();
  const restored = card(page, t.blocks.checklist);
  await expect(restored.locator(".aven-pill")).toHaveText("2 of 5 done");
  await expect(restored.getByLabel("Install the latest JDK")).toBeChecked();
  await expect(restored.getByRole("button", { name: /Plan your learning/ })).toHaveAttribute("aria-expanded", "false");
  // Save to the workspace through the normal approval flow.
  await restored.getByRole("button", { name: t.blocks.saveAsGoal }).click();
  const due = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
  await restored.getByLabel(t.blocks.goalDate).fill(due);
  await restored.getByRole("button", { name: t.blocks.prepareGoal }).click();
  const proposal = page.locator(".aven-card").filter({ hasText: "Prepare to study Java" }).filter({ has: page.getByRole("button", { name: t.cards.createGoal }) });
  await expect(proposal).toBeVisible();
  await proposal.getByRole("button", { name: t.cards.createGoal }).click();
  await expect(page.getByRole("link", { name: t.openGoal }).last()).toBeVisible({ timeout: 20000 });
  const [goal] = await sql`SELECT id FROM goals WHERE user_id = ${users.a} AND title = 'Prepare to study Java'`;
  const tasks = await sql`SELECT status FROM goal_tasks WHERE goal_id = ${goal.id}`;
  expect(tasks).toHaveLength(5);
  // Existing rule: approved AI proposals create tasks as to-do, never as completed work.
  expect(tasks.every((task) => task.status === "todo")).toBe(true);
});

test("quiz: graded on the server, answers hidden until answered, first answer counts", async ({ page, context, baseURL }) => {
  await signIn(context, baseURL!, "a");
  await page.goto("/aven?new=1");
  await ask(page, "[quiz] Quiz me on Java basics");
  const quiz = card(page, t.blocks.quiz);
  await expect(quiz.locator("input[type=radio]")).toHaveCount(5);
  expect(await page.content()).not.toContain("allocates memory");
  await quiz.getByLabel("make").check();
  await quiz.getByRole("button", { name: t.blocks.checkAnswer }).first().click();
  await expect(quiz.getByText(t.blocks.incorrect)).toBeVisible();
  await expect(quiz.getByText("new allocates memory and calls a constructor.")).toBeVisible();
  await expect(quiz.locator(".aven-option[data-state='correct']")).toContainText("new");
  // A second submission with another choice cannot change the recorded answer.
  const { conversationId } = ids(page);
  const requestId = await replyRequestId(conversationId);
  const componentId = await blockId(conversationId, "quiz");
  const again = await post(context.request, baseURL!, { kind: "quizAnswer", conversationId, requestId, componentId, questionId: "q1", choice: 0 });
  expect((await again.json()).result).toMatchObject({ correct: false, correctIndex: 0 });
  await page.reload();
  const restored = card(page, t.blocks.quiz);
  await expect(restored.locator(".aven-pill")).toHaveText("0/2 correct");
  await expect(restored.getByText(t.blocks.incorrect)).toBeVisible();
  expect((await stats()).quiz).toBe(1);
});

test("diagram: readable nodes, connections and details in light and dark themes", async ({ page, context, baseURL }) => {
  await signIn(context, baseURL!, "a");
  await page.goto("/aven?new=1");
  await ask(page, "[diagram] Explain the architecture of AI agents");
  const diagram = card(page, t.blocks.diagramKinds.architecture);
  await expect(diagram.locator("[data-node]")).toHaveCount(5);
  await expect(diagram.locator("path.aven-diagram-edge")).toHaveCount(5);
  await diagram.getByRole("button", { name: "Planner (LLM)" }).click();
  await expect(diagram.getByText("Decides the next step from the goal and memory.")).toBeVisible();
  await diagram.locator("summary").click();
  await expect(diagram.getByText("User goal → Planner (LLM): task")).toBeVisible();
  await diagram.screenshot({ path: "test-results/aven-diagram-light.png" });
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await diagram.screenshot({ path: "test-results/aven-diagram-dark.png" });
  expect((await stats()).diagram).toBe(1);
});

test("planner: adjust locally, re-plan without the model, approve into the real calendar", async ({ page, context, baseURL }) => {
  await signIn(context, baseURL!, "a");
  await sql`INSERT INTO subjects (id, user_id, title) VALUES (${randomUUID()}, ${users.a}, 'Java')`;
  await page.goto("/aven?new=1");
  await ask(page, "[plan] Plan 3 hours of Java next week after 7 PM");
  const planner = card(page, t.blocks.planner.eyebrow);
  await expect(planner).toBeVisible();
  const before = (await stats()).plan;
  // Session length via keyboard: 60 → 45 minutes, totals update locally.
  const length = planner.getByRole("slider", { name: new RegExp(t.blocks.planner.sessionLength) });
  await length.focus();
  for (let step = 0; step < 3; step++) await length.press("ArrowLeft");
  await expect(planner.locator(".aven-slider-value").first()).toHaveText("45 min");
  await expect(planner.locator(".aven-fact").filter({ hasText: t.blocks.planner.total })).toContainText("2 h 15 min");
  await planner.getByLabel(t.blocks.planner.windows.evening).check();
  await planner.getByRole("button", { name: t.blocks.planner.update }).click();
  await expect(planner.getByText(t.blocks.planner.updated)).toBeVisible({ timeout: 20000 });
  // Re-planning is deterministic: no extra model request.
  expect((await stats()).plan).toBe(before);
  const pending = page.locator(".aven-card").filter({ has: page.getByRole("button", { name: t.cards.approveSchedule }) });
  await expect(pending).toHaveCount(1);
  await pending.getByRole("button", { name: t.cards.approveSchedule }).click();
  await expect(page.getByRole("link", { name: t.openPlanner }).last()).toBeVisible({ timeout: 20000 });
  // Saved through the calendar service, as real schedule blocks for this student only.
  const blocks = await sql`SELECT id FROM schedule_blocks WHERE user_id = ${users.a}`;
  expect(blocks.length).toBeGreaterThan(0);
});

test("study targets: sliders, radios and select with live arithmetic and saved values", async ({ page, context, baseURL }) => {
  await signIn(context, baseURL!, "a");
  await page.goto("/aven?new=1");
  await ask(page, "[targets] Help me set study targets");
  const targets = card(page, t.blocks.targets.eyebrow);
  const hours = targets.getByRole("slider", { name: new RegExp(t.blocks.targets.weeklyHours) });
  await hours.focus();
  await hours.press("ArrowRight");
  await hours.press("ArrowRight");
  await expect(targets.locator(".aven-slider-value").first()).toHaveText("12 hours");
  await expect(targets.locator(".aven-fact").filter({ hasText: t.blocks.targets.sessionsPerWeek })).toContainText("15");
  await targets.getByLabel(t.blocks.targets.techniques.activeRecall).check();
  await targets.getByLabel(t.blocks.targets.timeOfDay).selectOption("morning");
  await expect(targets.getByText(t.blocks.save.saved)).toBeVisible();
  expect((await stats()).targets).toBe(1);
  await page.reload();
  const restored = card(page, t.blocks.targets.eyebrow);
  await expect(restored.locator(".aven-slider-value").first()).toHaveText("12 hours");
  await expect(restored.getByLabel(t.blocks.targets.techniques.activeRecall)).toBeChecked();
  await expect(restored.getByLabel(t.blocks.targets.timeOfDay)).toHaveValue("morning");
});

test("security: another student cannot read or change a block; tampered state is rejected", async ({ page, context, baseURL, browser }) => {
  await signIn(context, baseURL!, "a");
  await page.goto("/aven?new=1");
  await ask(page, "[flashcards] Make flashcards for Java keywords");
  const deck = card(page, t.blocks.flashcards);
  await deck.locator(".aven-flashcard").click();
  await deck.getByRole("button", { name: t.blocks.knewIt }).click();
  await expect(deck.locator(".aven-pill")).toHaveText("1 of 3 known");
  const { conversationId } = ids(page);
  const requestId = await replyRequestId(conversationId);
  const componentId = await blockId(conversationId, "flashcards");
  // Unknown card ids are rejected by the server.
  const tampered = await post(context.request, baseURL!, { kind: "state", conversationId, requestId, componentId, base: 99, state: { index: 0, known: ["not-a-card"], reviewing: [] } });
  expect(tampered.status()).toBe(400);
  const other = await browser.newContext();
  await signIn(other, baseURL!, "b");
  const foreign = await post(other.request, baseURL!, { kind: "state", conversationId, requestId, componentId, base: 1, state: { index: 0, known: [], reviewing: [] } });
  expect(foreign.status()).toBe(404);
  const peek = await other.request.get(`/api/aven?conversation=${conversationId}`);
  expect(peek.status()).toBe(404);
  await other.close();
});

test("duplicate submissions: concurrent re-plans leave exactly one approvable draft", async ({ page, context, baseURL }) => {
  await signIn(context, baseURL!, "a");
  await page.goto("/aven?new=1");
  await ask(page, "[plan] Plan Java next week");
  await expect(card(page, t.blocks.planner.eyebrow)).toBeVisible();
  const { conversationId } = ids(page);
  const requestId = await replyRequestId(conversationId);
  const [subject] = await sql`SELECT id FROM subjects WHERE user_id = ${users.a} AND title = 'Java'`;
  const body = { kind: "replan", conversationId, requestId, componentId: "study_planner", minutes: 30, window: "requested", subjects: [{ subjectId: subject.id, sessions: 2 }] };
  const results = await Promise.all([post(context.request, baseURL!, body), post(context.request, baseURL!, body)]);
  expect(results.map((result) => result.status()).sort()).toEqual([200, 409]);
  const pending = await sql`SELECT count(*)::int AS n FROM ai_plan_proposals WHERE conversation_id = ${conversationId} AND status = 'pending'`;
  expect(pending[0].n).toBe(1);
});

test("mobile and keyboard: blocks fit a phone and work without a mouse", async ({ page, context, baseURL }) => {
  await signIn(context, baseURL!, "c");
  await page.setViewportSize({ width: 375, height: 780 });
  await page.goto("/aven?new=1");
  await ask(page, "[checklist] Create a checklist for Java");
  const list = card(page, t.blocks.checklist);
  const first = list.getByLabel("Install the latest JDK");
  await first.focus();
  await page.keyboard.press("Space");
  await expect(first).toBeChecked();
  await expect(list.locator(".aven-pill")).toHaveText("1 of 5 done");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/aven-checklist-mobile.png", fullPage: false });
});

test("usage: one usage record per message, none for block interactions", async () => {
  const rows = await sql`SELECT user_id, count(*)::int AS n FROM ai_usage_records WHERE user_id = ANY(${[users.a, users.c]}::uuid[]) GROUP BY user_id`;
  const byUser = Object.fromEntries(rows.map((row) => [row.user_id, row.n]));
  expect(byUser[users.a]).toBe(7);
  expect(byUser[users.c]).toBe(1);
});
