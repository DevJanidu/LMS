import { chromium, expect } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import assert from "node:assert/strict";

// Uses only previously created, isolated audit learners. Never registers or deletes owner accounts.
if (!process.argv.includes("--acknowledge-current-test-database") || process.env.VERCEL_ENV === "production") throw new Error("Explicit test-database acknowledgement required.");
const fixture = JSON.parse(readFileSync(".audit-local/fixtures.json", "utf8"));
assert(fixture.ready && fixture.users[0].email.startsWith("audit-"));
const baseURL = process.argv.find(arg => arg.startsWith("--url="))?.slice(6) ?? process.env.APP_URL ?? "http://localhost:3100";
const label = process.argv.find(arg => arg.startsWith("--label="))?.slice(8) ?? "production";
const run = `Calendar audit ${crypto.randomUUID().slice(0, 8)}`;
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } });
await context.addInitScript(() => {
  window.calendarAuditFrames = [];
  let gesture;
  document.addEventListener("pointerdown", event => {
    const block = event.target.closest?.(".planner-event"), button = event.target.closest?.("button");
    const text = button?.textContent?.trim();
    const operation = block ? "drag" : text?.includes("Schedule Study") ? "modal" : text === "Save" ? "create"
      : ["Previous", "Next"].includes(button?.getAttribute("aria-label")) ? "navigation" : undefined;
    if (!operation) { gesture = undefined; return; }
    const title = block?.querySelector(".planner-event-title")?.textContent ?? document.querySelector('dialog[open] input[name="title"]')?.value;
    gesture = { operation, x: event.clientX, y: event.clientY, title, box: block?.getBoundingClientRect() };
  }, true);
  document.addEventListener("pointerup", event => {
    const value = gesture; gesture = undefined;
    if (!value || (value.operation === "drag" && Math.hypot(event.clientX - value.x, event.clientY - value.y) < 6)) return;
    const start = performance.now();
    requestAnimationFrame(() => {
      const node = [...document.querySelectorAll(".planner-event")].find(el => el.querySelector(".planner-event-title")?.textContent === value.title);
      const box = node?.getBoundingClientRect();
      const observed = value.operation === "modal" ? Boolean(document.querySelector("dialog[open]"))
        : value.operation === "create" ? Boolean(node && !document.querySelector("dialog[open]"))
        : value.operation === "drag" ? Boolean(box && (Math.abs(box.x-value.box.x) > 1 || Math.abs(box.y-value.box.y) > 1 || Math.abs(box.height-value.box.height) > 1)) : true;
      window.calendarAuditFrames.push({ operation: value.operation, ms: Math.round(performance.now() - start), observed });
    });
  }, true);
});
const page = await context.newPage();
const requests = [], metrics = [], errors = [], frames = [], ownedIds = new Set();
let phase = "initial", gate, failures = 0;
mkdirSync(".audit-local/calendar", { recursive: true });
page.on("pageerror", error => errors.push(error.message));
const started = new Map();
page.on("request", request => {
  const path = new URL(request.url()).pathname;
  let command;
  if (path === "/api/calendar" && request.method() === "POST") {
    const value = request.postDataJSON()?.command;
    command = { kind: value?.kind, startsAt: value?.startsAt, endsAt: value?.endsAt };
  }
  if (path === "/api/calendar" || path === "/calendar") started.set(request, { at: performance.now(), phase, path, command });
});
page.on("requestfinished", async request => {
  const record = started.get(request); if (!record) return;
  const response = await request.response();
  requests.push({ phase: record.phase, path: record.path, method: request.method(), action: Boolean(request.headers()["next-action"]), command: record.command, ms: Math.round(performance.now() - record.at), status: response?.status(), serverTiming: response?.headers()["server-timing"] });
});
const dialog = () => page.locator("dialog[open]").last();
const event = title => page.locator(".planner-event").filter({ hasText: title }).first();
const contentY = title => event(title).evaluate(node => {
  const grid = node.closest(".planner-timetable");
  // The failure alert moves the whole calendar down; compare within its grid.
  let y = node.getBoundingClientRect().y - grid.getBoundingClientRect().y;
  for (let parent = node.parentElement; parent && parent !== grid; parent = parent.parentElement) y += parent.scrollTop;
  return y;
});
const bodyOf = async response => { const body = await response.json(); assert(response.ok(), JSON.stringify({ status: response.status(), error: body.error })); return body; };
const read = async id => (await bodyOf(await context.request.get(`/api/calendar?id=${id}`))).block;
const saved = () => {
  const promise = page.waitForResponse(response => new URL(response.url()).pathname === "/api/calendar" && response.request().method() === "POST" && response.status() === 200, { timeout: 45000 });
  void promise.catch(() => undefined); // Cleanup may close the page after a preceding assertion fails.
  return promise;
};
async function select(label, option, root = dialog()) {
  await root.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}
async function hourMinute(id, value) {
  const before = performance.now(); await dialog().locator(`#${id}`).click();
  const menu = page.getByRole("listbox"); await expect(menu).toBeVisible();
  const box = await menu.boundingBox(); assert(box.width >= 95 && box.height <= 252);
  const rowHeight = await menu.getByRole("option").first().evaluate(el => el.getBoundingClientRect().height);
  assert(rowHeight >= 32 && rowHeight <= 36);
  metrics.push({ operation: `${id} open`, ms: Math.round(performance.now() - before), width: Math.round(box.width), height: Math.round(box.height), rowHeight });
  await page.getByRole("option", { name: value, exact: true }).click();
  await expect(menu).toBeHidden();
}
async function create(title, recurring = false) {
  phase = recurring ? "createRecurring" : "createOnce";
  const openAt = performance.now();
  await page.getByRole("button", { name: "Schedule Study", exact: true }).click();
  await expect(dialog()).toBeVisible(); metrics.push({ operation: "modal open", ms: Math.round(performance.now() - openAt) });
  await dialog().locator('input[name="title"]').fill(title);
  await hourMinute("start-time-hour", recurring ? "11" : "13");
  await hourMinute("start-time-minute", recurring ? "00" : "15");
  await hourMinute("end-time-hour", recurring ? "12" : "14");
  await hourMinute("end-time-minute", recurring ? "00" : "45");
  if (recurring) {
    await select("Repeat", "Daily");
    await expect(dialog().getByRole("checkbox")).toHaveCount(7);
    for (const checkbox of await dialog().getByRole("checkbox").all()) await expect(checkbox).toBeChecked();
    await dialog().getByRole("checkbox").nth(1).uncheck(); await dialog().getByRole("checkbox").nth(1).check();
  } else {
    await dialog().getByRole("button", { name: "60 min", exact: true }).click();
    assert((await dialog().locator('input[name="end"]').inputValue()).endsWith("14:15"));
  }
  const response = saved(), submitAt = performance.now();
  await dialog().getByRole("button", { name: "Save", exact: true }).click();
  const overlap = page.getByRole("dialog", { name: "These plans overlap", exact: true });
  if (await overlap.isVisible()) await overlap.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(dialog()).toHaveCount(0); await expect(event(title)).toBeVisible();
  metrics.push({ operation: recurring ? "recurring optimistic create" : "optimistic create", ms: Math.round(performance.now() - submitAt) });
  const result = await bodyOf(await response), block = result.blocks.find(b => b.title === title);
  assert(block); ownedIds.add(block.id); return block;
}
async function drag(title, dx, dy) {
  const el = event(title); await centerEvent(el); const box = await el.boundingBox();
  const gridY = await contentY(title);
  const x = box.x + box.width / 2, y = box.y + Math.min(12, box.height / 2);
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + dx, y + dy, { steps: 15 }); await page.mouse.up();
  return { ...box, gridY };
}
async function centerEvent(el) {
  await el.scrollIntoViewIfNeeded();
  await el.evaluate(node => {
    for (let parent = node.parentElement; parent; parent = parent.parentElement) {
      if (parent.scrollHeight > parent.clientHeight && /auto|scroll/.test(getComputedStyle(parent).overflowY)) {
        parent.scrollTop += node.getBoundingClientRect().top - parent.getBoundingClientRect().top - parent.clientHeight / 3;
        break;
      }
    }
  });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
}
async function deleteThroughDetails(title, scope = "one") {
  await event(title).click(); await dialog().getByRole("button", { name: "Delete", exact: true }).click();
  if (scope !== "one") await select("Change which blocks?", scope === "all" ? "All events in the series" : "All future");
  const response = saved(); await dialog().getByRole("button", { name: "Confirm", exact: true }).click(); await bodyOf(await response);
}
async function trash(title, confirm) {
  const el = event(title); await centerEvent(el); const box = await el.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + 12); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 10, box.y + 15, { steps: 4 });
  const target = page.locator('[data-active="true"][data-hovered]'); await expect(target).toBeVisible(); const targetBox = await target.boundingBox();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 20 });
  await expect(target).toHaveAttribute("data-hovered", "true"); await page.mouse.up(); await expect(dialog()).toBeVisible();
  await dialog().getByRole("button", { name: confirm ? "Confirm" : "Cancel", exact: true }).click();
}
try {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(fixture.users[0].email);
  await page.getByLabel("Password", { exact: true }).fill(fixture.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click(); await page.waitForURL(/\/dashboard$/, { timeout: 60000 });
  const loadAt = performance.now(); await page.goto("/calendar"); await expect(page.locator(".planner-calendar-theme")).toBeVisible();
  metrics.push({ operation: "calendar load", ms: Math.round(performance.now() - loadAt) });
  let once = await create(`${run} once`);
  assert.equal(Date.parse(once.endsAt) - Date.parse(once.startsAt), 3600000);
  let recurring = await create(`${run} recurring`, true); assert.equal(recurring.weekdays.length, 7);
  frames.push(...await page.evaluate(() => window.calendarAuditFrames));
  await page.reload(); await expect(event(once.title)).toBeVisible(); await expect(event(recurring.title)).toBeVisible();
  await page.screenshot({ path: ".audit-local/calendar/light-desktop.png" });
  await page.route("**/api/calendar", async route => {
    if (route.request().method() !== "POST") return route.continue();
    if (failures > 0) { failures--; return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false, error: "saveFailed" }) }); }
    if (gate) { const wait = gate; const response = await route.fetch(); await wait; return route.fulfill({ response }); }
    return route.continue();
  });
  phase = "rapidMoves"; let release; gate = new Promise(resolve => { release = resolve; });
  const width = (await page.locator(".planner-day-header").last().boundingBox()).width;
  const first = await drag(once.title, width, 38);
  const optimisticAt = performance.now(); await expect(event(once.title)).toBeVisible();
  assert((await event(once.title).boundingBox()).x > first.x + width / 2);
  metrics.push({ operation: "optimistic drop after pointer release", ms: Math.round(performance.now() - optimisticAt) });
  await drag(once.title, -width, 38);
  // A drag can replace the event node on the next React paint. Capture the
  // optimistic destination after that paint, before releasing the response.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(event(once.title)).toBeVisible();
  const finalPosition = await event(once.title).boundingBox();
  assert(finalPosition);
  gate = undefined; release();
  await expect(event(once.title)).not.toHaveClass(/opacity-70/, { timeout: 45000 });
  await expect(event(once.title)).toBeVisible();
  const persisted = await read(once.id); assert.notEqual(persisted.startsAt, once.startsAt);
  assert.equal(Date.parse(persisted.endsAt) - Date.parse(persisted.startsAt), 3600000);
  assert(Math.abs((await event(once.title).boundingBox()).x - finalPosition.x) < 2);
  once = persisted;
  phase = "failedMove"; failures = 2;
  // drag() centers the event first; compare against the resulting viewport position.
  const original = await drag(once.title, 0, -38);
  await expect(page.getByRole("alert").filter({ hasText: "Your changes could not be saved" })).toBeVisible();
  await expect.poll(async () => Math.abs(await contentY(once.title) - original.gridY)).toBeLessThan(3);
  const retry = saved(); await page.getByRole("button", { name: "Retry", exact: true }).click(); await bodyOf(await retry);
  once = await read(once.id); assert.notEqual(once.startsAt, persisted.startsAt);
  await expect(event(once.title)).not.toHaveClass(/opacity-70/, { timeout: 45000 });
  phase = "resize"; await centerEvent(event(once.title)); await event(once.title).hover();
  // FullCalendar v7's installed internal resizer selector, not an application CSS override.
  const endHandle = event(once.title).locator(".fc-oN:visible").first(); const handleBox = await endHandle.boundingBox(); assert(handleBox);
  metrics.push({ operation: "resize pointer target", box: handleBox, hit: await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.className, { x: handleBox.x + handleBox.width / 2, y: handleBox.y + handleBox.height / 2 }) });
  const resizeResponse = saved();
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2); await page.mouse.down();
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2 + 38, { steps: 12 }); await page.mouse.up();
  await bodyOf(await resizeResponse); once = await read(once.id);
  assert.equal(Date.parse(once.endsAt) - Date.parse(once.startsAt), 5400000);
  phase = "monthMoveAcrossWeeks"; await page.getByRole("button", { name: "Month", exact: true }).click();
  await expect(page.locator('.planner-timetable[aria-busy="false"]')).toBeVisible({ timeout: 30000 });
  const sourceDay = await event(once.title).evaluate(el => el.closest('[role="gridcell"][data-date]').getAttribute("data-date"));
  const destinationDay = new Date(Date.parse(`${sourceDay}T12:00:00Z`) + 7 * 86400000).toISOString().slice(0, 10);
  const acrossWeek = async day => {
    const sourceBox = await event(once.title).boundingBox();
    const destination = await page.locator(`[role="gridcell"][data-date="${day}"]`).first().boundingBox(); assert(destination);
    const response = saved();
    await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2); await page.mouse.down();
    await page.mouse.move(destination.x + destination.width / 2, destination.y + 40, { steps: 20 }); await page.mouse.up();
    await bodyOf(await response); return read(once.id);
  };
  const across = await acrossWeek(destinationDay);
  assert.equal(Date.parse(across.startsAt) - Date.parse(once.startsAt), 7 * 86400000);
  assert.equal(Date.parse(across.endsAt) - Date.parse(across.startsAt), 5400000);
  once = await acrossWeek(sourceDay);
  await page.getByRole("button", { name: "Week", exact: true }).click();
  phase = "recurringMove"; const response = saved();
  await drag(recurring.title, 0, 114); await expect(dialog()).toBeVisible();
  await dialog().getByRole("button", { name: "Confirm", exact: true }).click(); await bodyOf(await response);
  recurring = await read(recurring.id); assert.equal(recurring.exceptions.length, 1);
  phase = "recurringDeleteOne"; await deleteThroughDetails(recurring.title);
  recurring = await read(recurring.id); assert(recurring.exceptions.some(e => e.cancelled));
  phase = "navigate"; await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.locator('.planner-timetable[aria-busy="false"]')).toBeVisible({ timeout: 30000 });
  await expect(event(recurring.title)).toBeVisible();
  phase = "recurringEditFuture"; await event(recurring.title).click(); await dialog().getByRole("button", { name: "Edit study block", exact: true }).click();
  await select("Change which blocks?", "All future"); await dialog().locator('input[name="title"]').fill(`${run} future`);
  const splitResponse = saved(); await dialog().getByRole("button", { name: "Save", exact: true }).click();
  const split = await bodyOf(await splitResponse); const future = split.blocks.find(b => b.title === `${run} future`); assert(future); ownedIds.add(future.id);
  await expect(event(future.title)).toBeVisible();
  phase = "recurringDeleteAll"; await deleteThroughDetails(future.title, "all");
  assert.equal((await context.request.get(`/api/calendar?id=${future.id}`)).status(), 404);
  phase = "cachedNavigation"; const beforeRequests = requests.filter(r => r.path === "/api/calendar" && r.method === "GET").length;
  const cachedAt = performance.now(); await page.getByRole("button", { name: "Previous", exact: true }).click(); await expect(event(once.title)).toBeVisible();
  metrics.push({ operation: "cached week navigation", ms: Math.round(performance.now() - cachedAt) });
  assert.equal(requests.filter(r => r.path === "/api/calendar" && r.method === "GET").length, beforeRequests);
  phase = "trashCancel"; await trash(once.title, false); await expect(event(once.title)).toBeVisible(); assert(await read(once.id));
  phase = "failedTrashDelete"; failures = 2; await trash(once.title, true); await expect(page.locator("main").getByRole("alert").first()).toBeVisible(); await expect(event(once.title)).toBeVisible();
  phase = "deleteRetry"; const deleteResponse = saved(); await page.getByRole("button", { name: "Retry", exact: true }).click(); await bodyOf(await deleteResponse);
  assert.equal((await context.request.get(`/api/calendar?id=${once.id}`)).status(), 404);
  frames.push(...await page.evaluate(() => window.calendarAuditFrames));
  phase = "mobile"; await context.addCookies([{ name: "sf-theme", value: "dark", url: baseURL }]); await page.reload();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".planner-calendar-theme")).toBeVisible();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.getByRole("button", { name: "Schedule Study", exact: true }).click();
  await expect(dialog()).toBeVisible(); await hourMinute("start-time-hour", "20");
  assert(await dialog().evaluate(el => el.scrollWidth <= el.clientWidth));
  await page.screenshot({ path: ".audit-local/calendar/dark-mobile.png" });
  await dialog().getByRole("button", { name: "Close", exact: true }).click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(errors.length, 0, JSON.stringify(errors));
  frames.push(...await page.evaluate(() => window.calendarAuditFrames));
  console.info(JSON.stringify({ result: "passed", metrics, frames, requests }));
  writeFileSync(`.audit-local/calendar/browser-${label}.json`, JSON.stringify({ baseURL, metrics, frames, requests, errors }, null, 2));
} catch (error) {
  await page.screenshot({ path: ".audit-local/calendar/failure.png" }).catch(() => undefined);
  writeFileSync(".audit-local/calendar/browser-failure.json", JSON.stringify({ phase, metrics, requests, errors, message: String(error) }, null, 2));
  throw error;
} finally {
  // Deletes only IDs returned by this run and checks the unique title prefix before each write.
  for (const id of ownedIds) {
    try {
      const response = await context.request.get(`/api/calendar?id=${id}`);
      if (!response.ok()) continue;
      const { block } = await response.json();
      if (block.userId !== fixture.users[0].id || !block.title.startsWith(run)) throw new Error("Fixture cleanup scope mismatch");
      await context.request.post("/api/calendar", { headers: { Origin: baseURL }, data: { operationId: crypto.randomUUID(), expectedUpdatedAt: block.updatedAt,
        command: { kind: "delete", id, date: block.startsAt.slice(0, 10), scope: "all" } } });
    } catch { console.error("A calendar fixture may remain; only tracked audit IDs were attempted."); }
  }
  await browser.close();
}
