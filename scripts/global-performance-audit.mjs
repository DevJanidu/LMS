import { chromium, expect } from "@playwright/test";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import assert from "node:assert/strict";

if (!process.argv.includes("--acknowledge-current-test-database") || process.env.VERCEL_ENV === "production") throw new Error("Test database acknowledgement required; production refused.");
const baseURL = process.env.APP_URL ?? "http://localhost:3100";
const fixtures = JSON.parse(readFileSync(".audit-local/fixtures.json", "utf8"));
const inventory = JSON.parse(readFileSync("docs/PERFORMANCE_INVENTORY.json", "utf8"));
const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [], contexts = [];
const personaPath = ".audit-local/performance-persona.json";
const fresh = existsSync(personaPath) && !process.argv.includes("--fresh-persona") ? JSON.parse(readFileSync(personaPath, "utf8")) : { email: `audit-performance-${crypto.randomUUID()}@example.com`, password: crypto.randomUUID() + "Aa!9", registered: false };
writeFileSync(personaPath, JSON.stringify(fresh));
const learners = [{ ...fresh, label: "new" }, { ...fixtures.users[0], password: fixtures.password, label: "active" }, { ...fixtures.users[1], password: fixtures.password, label: "stress" }];
async function check(label, operation, work) {
  const start = performance.now();
  try { await work(); results.push({ persona: label, operation, status: "PASS", ms: Math.round(performance.now() - start) }); console.info(`${label}: ${operation}: PASS`); }
  catch (error) { results.push({ persona: label, operation, status: "FAIL", error: error.name }); throw error; }
}
async function mutate(context, operations, expected = true) {
  const start = performance.now();
  const response = await context.request.post("/api/workspace", { headers: { Origin: baseURL }, data: { operations } });
  const body = await response.json(); assert.equal(body.ok, expected, `workspace mutation status ${response.status()}`);
  results.push({ operation: "mutation HTTP", kind: operations.map(operation => operation.kind).join(","), ms: Math.round(performance.now() - start), bytes: (await response.body()).length, serverTiming: response.headers()["server-timing"] });
  return body;
}
async function read(context, groups) { const response = await context.request.get(`/api/workspace?groups=${groups}`); const body = await response.json(); assert(body.ok); return body.fields; }
try {
  for (const learner of learners) {
    const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 900 } }); contexts.push(context);
    const page = await context.newPage();
    await check(learner.label, "login/registration and onboarding", async () => {
      if (learner.label === "new" && !fresh.registered) {
        await page.goto("/register");
        await page.getByLabel("Name", { exact: true }).fill("Performance Learner");
        await page.getByLabel("Email", { exact: true }).fill(learner.email);
        await page.getByLabel("Password", { exact: true }).fill(learner.password);
        await page.getByRole("checkbox").check();
        await page.getByRole("button", { name: "Sign up", exact: true }).click();
        await expect(page).toHaveURL(/\/onboarding$/, { timeout: 60000 });
        fresh.registered = true; writeFileSync(personaPath, JSON.stringify(fresh));
        for (let step = 0; step < 5; step++) await page.getByRole("button", { name: "Skip", exact: true }).click();
        await expect(page).toHaveURL(/\/dashboard$/, { timeout: 60000 });
      } else {
        await page.goto("/login");
        await page.getByLabel("Email", { exact: true }).fill(learner.email);
        await page.getByLabel("Password", { exact: true }).fill(learner.password);
        await page.getByRole("button", { name: "Sign in", exact: true }).click();
        await expect(page).toHaveURL(/\/dashboard$/, { timeout: 60000 });
      }
    });
    learner.context = context;
    const subject = { id: crypto.randomUUID(), title: `Performance ${learner.label} ${crypto.randomUUID().slice(0, 6)}`, description: "Audit fixture", color: "brand", status: "active" };
    learner.subject = subject;
    await check(learner.label, "subject/topic/resource/session CRUD persistence", async () => {
      await mutate(context, [{ kind: "subject", value: subject }]);
      const topic = { id: crypto.randomUUID(), subjectId: subject.id, title: "Audit topic", status: "notStarted", sortOrder: 0 };
      await mutate(context, [{ kind: "topic", value: topic }]);
      await mutate(context, [{ kind: "topic", value: { ...topic, status: "completed", title: "Updated topic" } }]);
      assert((await read(context, "subjects")).topics.some(row => row.id === topic.id && row.status === "completed"));
      const resource = { id: crypto.randomUUID(), subjectId: subject.id, topicId: topic.id, type: "note", title: "Audit note", textContent: "Fixture only" };
      await mutate(context, [{ kind: "resource", value: resource }]);
      await mutate(context, [{ kind: "resource", value: { ...resource, title: "Updated note" } }]);
      assert((await read(context, "resources")).resources.some(row => row.id === resource.id && row.title === "Updated note"));
      const session = { id: crypto.randomUUID(), subjectId: subject.id, topicId: topic.id, startedAt: new Date(Date.now() - 3600000).toISOString(), endedAt: new Date(Date.now() - 1800000).toISOString() };
      await mutate(context, [{ kind: "session", value: session }]);
      await mutate(context, [{ kind: "session", value: { ...session, note: "Updated session" } }]);
      assert((await read(context, "sessions")).sessions.some(row => row.id === session.id));
      for (const [entity, id] of [["resource", resource.id], ["session", session.id], ["topic", topic.id]]) await mutate(context, [{ kind: "delete", entity, id }]);
      assert(!(await read(context, "subjects")).topics.some(row => row.id === topic.id));
    });
    await check(learner.label, "timer start/pause/resume/discard", async () => {
      const shell = await read(context, "shell");
      assert(!shell.timer, "Audit persona has an existing timer; refusing to replace it");
      for (const command of ["start", "pause", "resume", "discard"]) await mutate(context, [{ kind: "timer", value: command === "start" ? { command, subjectId: subject.id } : { command } }]);
      assert.equal((await read(context, "shell")).timer, null);
    });
    await check(learner.label, "profile save and restore", async () => {
      const shell = await read(context, "shell");
      await mutate(context, [{ kind: "profile", value: { ...shell.user, weeklyTargetMinutes: shell.user.weeklyTargetMinutes + 1 } }]);
      assert.equal((await read(context, "shell")).user.weeklyTargetMinutes, shell.user.weeklyTargetMinutes + 1);
      await mutate(context, [{ kind: "profile", value: shell.user }]);
    });
    await check(learner.label, "calendar create/move/idempotent replay/delete", async () => {
      const block = { id: crypto.randomUUID(), title: "Performance calendar", subjectId: subject.id, startsAt: new Date(Date.now() + 3600000).toISOString(), endsAt: new Date(Date.now() + 7200000).toISOString(), repeat: "weekly", weekdays: [new Date(Date.now() + 3600000).getUTCDay()], timezone: "UTC", color: "brand", exceptions: [] };
      learner.blockId = block.id;
      const post = async body => { const response = await context.request.post("/api/calendar", { headers: { Origin: baseURL }, data: body }); const result = await response.json(); assert(result.ok, `Calendar status ${response.status()}: ${result.error ?? "unknown"}`); return result; };
      const create = { operationId: crypto.randomUUID(), command: { kind: "create", value: block } };
      const created = await post(create); await post(create);
      const date = block.startsAt.slice(0, 10);
      const moved = await post({ operationId: crypto.randomUUID(), expectedUpdatedAt: created.blocks[0].updatedAt, command: { kind: "move", id: block.id, date, scope: "one", startsAt: new Date(Date.parse(block.startsAt) + 1800000).toISOString(), endsAt: new Date(Date.parse(block.endsAt) + 1800000).toISOString() } });
      await post({ operationId: crypto.randomUUID(), expectedUpdatedAt: moved.blocks[0].updatedAt, command: { kind: "delete", id: block.id, date, scope: "all" } });
      assert.equal((await context.request.get(`/api/calendar?id=${block.id}`)).status(), 404);
    });
    const learnerRoutes = inventory.routes.filter(route => route.kind === "page" && route.file.includes("(learner)")).map(route => route.path.replace("[id]", subject.id));
    for (const route of learnerRoutes) await check(learner.label, `route ${route}`, async () => {
      await page.goto(route); await expect(page.locator("h1").first()).toBeVisible({ timeout: 60000 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    });
    if (learner.label === "stress") {
      await check(learner.label, "concurrent independent writes", async () => {
        const topics = Array.from({ length: 5 }, (_, index) => ({ id: crypto.randomUUID(), subjectId: subject.id, title: `Rapid ${index}`, status: "notStarted", sortOrder: index }));
        await Promise.all(topics.map(value => mutate(context, [{ kind: "topic", value }])));
        const data = await read(context, "subjects"); assert(topics.every(topic => data.topics.some(row => row.id === topic.id)));
      });
      await check(learner.label, "slow save leaves navigation interactive and failure rolls back", async () => {
        await page.goto("/subjects?add=1"); await page.getByLabel("Title", { exact: true }).fill("Failed optimistic fixture");
        let release; const gate = new Promise(resolve => { release = resolve; });
        await page.route("**/api/workspace", async route => { if (route.request().method() !== "POST") return route.continue(); await gate; await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false, error: "saveFailed" }) }); });
        const start = performance.now(); await page.getByRole("button", { name: "Save", exact: true }).click();
        await expect(page.getByRole("dialog")).toBeHidden();
        await expect(page.getByRole("link", { name: "Failed optimistic fixture", exact: true })).toBeVisible();
        results.push({ persona: learner.label, operation: "optimistic subject visible", ms: Math.round(performance.now() - start) });
        assert(await page.getByRole("link", { name: "Study Planner", exact: true }).first().isEnabled());
        await page.getByRole("link", { name: "Study Planner", exact: true }).first().click();
        await expect(page).toHaveURL(/\/calendar$/);
        await page.getByRole("link", { name: "Subjects", exact: true }).first().click();
        await expect(page).toHaveURL(/\/subjects$/);
        await expect(page.getByRole("link", { name: "Failed optimistic fixture", exact: true })).toBeVisible();
        release(); await expect(page.getByRole("link", { name: "Failed optimistic fixture", exact: true })).toHaveCount(0);
        await expect(page.getByRole("alert").first()).toBeVisible(); await page.unroute("**/api/workspace");
      });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    for (const route of learnerRoutes) await check(learner.label, `mobile ${route}`, async () => { await page.goto(route); await expect(page.locator("h1").first()).toBeVisible(); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); });
  }
  await check("cross-user", "foreign subject edit rejected", async () => {
    await mutate(learners[1].context, [{ kind: "subject", value: { ...learners[0].subject, title: "Unauthorized edit" } }], false);
    assert((await read(learners[0].context, "subjects")).subjects.some(row => row.id === learners[0].subject.id && row.title === learners[0].subject.title));
  });
  await check("cross-user", "topic/resource/session/timer ownership and invalid URL", async () => {
    const owner = learners[0], attacker = learners[1];
    const topic = { id: crypto.randomUUID(), subjectId: owner.subject.id, title: "Ownership topic", status: "notStarted", sortOrder: 0 };
    const resource = { id: crypto.randomUUID(), subjectId: owner.subject.id, topicId: topic.id, title: "Ownership note", type: "note", textContent: "Audit-owned content" };
    const session = { id: crypto.randomUUID(), subjectId: owner.subject.id, topicId: topic.id, startedAt: new Date(Date.now() - 3600000).toISOString(), endedAt: new Date(Date.now() - 1800000).toISOString() };
    await mutate(owner.context, [{ kind: "topic", value: topic }, { kind: "resource", value: resource }, { kind: "session", value: session }]);
    for (const [kind, value] of [["topic", topic], ["resource", resource], ["session", session]]) {
      await mutate(attacker.context, [{ kind, value }], false);
      await mutate(attacker.context, [{ kind: "delete", entity: kind, id: value.id }], false);
    }
    await mutate(attacker.context, [{ kind: "timer", value: { command: "start", subjectId: owner.subject.id } }], false);
    await mutate(attacker.context, [{ kind: "resource", value: { ...resource, id: crypto.randomUUID(), type: "link", url: "javascript:alert(1)" } }], false);
    assert((await read(owner.context, "subjects")).topics.some(row => row.id === topic.id));
    assert((await read(owner.context, "resources")).resources.some(row => row.id === resource.id));
    assert((await read(owner.context, "sessions")).sessions.some(row => row.id === session.id));
  });
  const adminContext = await browser.newContext({ baseURL }); contexts.push(adminContext);
  const adminPage = await adminContext.newPage();
  await adminPage.goto("/login"); await adminPage.getByLabel("Email", { exact: true }).fill(fixtures.users[2].email);
  await adminPage.getByLabel("Password", { exact: true }).fill(fixtures.password);
  await adminPage.getByRole("button", { name: "Sign in", exact: true }).click(); await expect(adminPage).toHaveURL(/\/admin$/, { timeout: 60000 });
  await check("admin", "settings save and restore", async () => {
    const shell = await read(adminContext, "shell");
    try {
      await mutate(adminContext, [{ kind: "settings", value: { ...shell.settings, streakMinutes: shell.settings.streakMinutes + 1 } }]);
      assert.equal((await read(adminContext, "shell")).settings.streakMinutes, shell.settings.streakMinutes + 1);
    } finally { await mutate(adminContext, [{ kind: "settings", value: shell.settings }]); }
  });
  await check("admin", "role-boundary read rejected", async () => {
    assert.equal((await adminContext.request.get("/api/workspace?groups=subjects")).status(), 403);
  });
  await check("admin", "deactivate/reactivate audit-only learner", async () => {
    assert(fresh.email.startsWith("audit-performance-"));
    const owner = (await read(learners[0].context, "shell")).user;
    try {
      await mutate(adminContext, [{ kind: "userStatus", id: owner.id, status: "inactive" }]);
      assert.equal((await learners[0].context.request.get("/api/workspace?groups=shell")).status(), 401);
    } finally { await mutate(adminContext, [{ kind: "userStatus", id: owner.id, status: "active" }]); }
    const response = await learners[0].context.request.post("/api/auth/sign-in/email", { headers: { Origin: baseURL }, data: { email: fresh.email, password: fresh.password } });
    assert(response.ok());
  });
} finally {
  // Only subjects whose UUIDs were created by this run are eligible for cleanup.
  for (const learner of learners) if (learner.context && learner.subject) {
    if (learner.blockId) {
      try {
        const response = await learner.context.request.get(`/api/calendar?id=${learner.blockId}`);
        if (response.ok()) {
          const { block } = await response.json();
          await learner.context.request.post("/api/calendar", { headers: { Origin: baseURL }, data: { operationId: crypto.randomUUID(), expectedUpdatedAt: block.updatedAt, command: { kind: "delete", id: learner.blockId, date: block.startsAt.slice(0, 10), scope: "all" } } });
        }
      } catch { results.push({ persona: learner.label, operation: "calendar fixture cleanup", status: "BLOCKED" }); }
    }
    try { await mutate(learner.context, [{ kind: "delete", entity: "subject", id: learner.subject.id }]); } catch { results.push({ persona: learner.label, operation: "fixture cleanup", status: "BLOCKED" }); }
  }
  writeFileSync("docs/GLOBAL_PERFORMANCE_RESULTS.json", JSON.stringify({ generatedAt: new Date().toISOString(), baseURL, freshRegistration: process.argv.includes("--fresh-persona"), results }, null, 2));
  for (const context of contexts) await context.close(); await browser.close();
  console.info(JSON.stringify({ passed: results.filter(result => result.status === "PASS").length, failed: results.filter(result => result.status === "FAIL").length, measuredRequests: results.filter(result => result.operation === "mutation HTTP").length }));
}
