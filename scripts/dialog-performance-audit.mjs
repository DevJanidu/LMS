import { chromium, expect } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";

// Stubbed write confirmations test UI ordering without modifying fixture data.
const baseURL = process.env.APP_URL ?? "http://localhost:3100";
const fixture = JSON.parse(readFileSync(".audit-local/fixtures.json", "utf8"));
const messages = JSON.parse(readFileSync("src/messages/en.json", "utf8")).studyflow;
assert(fixture.users[0].email.startsWith("audit-"));
const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [];
let stage = "login";
try {
  const context = await browser.newContext({ baseURL });
  const login = await context.request.post("/api/auth/sign-in/email", { headers: { Origin: baseURL }, data: { email: fixture.users[0].email, password: fixture.password } });
  assert(login.ok());
  const page = await context.newPage();
  const details = await (await context.request.get("/api/workspace?groups=subjects")).json();
  const subject = details.fields.subjects.find(row => row.status === "active");
  assert(subject);
  const confirmations = [];
  await page.route("**/api/workspace", async route => {
    if (route.request().method() !== "POST") return route.continue();
    let release;
    const done = new Promise(resolve => { release = resolve; });
    confirmations.push({ release, kind: route.request().postDataJSON().operations[0].kind });
    const ok = await done;
    await route.fulfill({ status: ok ? 200 : 503, contentType: "application/json", body: JSON.stringify({ ok, ...(ok ? {} : { error: "saveFailed" }) }) });
  });
  const choose = async (label, option) => {
    await page.getByRole("dialog").getByRole("combobox", { name: label, exact: true }).click();
    await page.getByRole("option", { name: option, exact: true }).click();
  };
  for (const feature of ["subjects", "resources", "sessions"]) {
    stage = `${feature}: load`;
    await page.goto(feature === "sessions" ? "/study/history" : `/${feature}`);
    const open = async () => {
      if (feature === "sessions") await page.getByRole("button", { name: "Edit", exact: true }).first().click();
      else await page.getByRole("button", { name: feature === "subjects" ? "Add Subject" : "Add Resource", exact: true }).first().click();
      await expect(page.getByRole("dialog")).toBeVisible();
    };
    await open();
    stage = `${feature}: fill`;
    if (feature !== "sessions") await page.getByLabel("Title", { exact: true }).fill(`Dialog audit ${crypto.randomUUID()}`);
    if (feature === "resources") {
      await choose("Subject", subject.title);
      await choose("Type", "Note");
      await page.getByLabel(messages.noteText, { exact: true }).fill("Stubbed UI confirmation fixture");
    }
    const observed = confirmations.length;
    stage = `${feature}: save`;
    const started = performance.now();
    await page.getByRole("dialog").getByRole("button", { name: feature === "sessions" ? "Save session" : "Save", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect.poll(() => confirmations.length).toBe(observed + 1);
    await open();
    stage = `${feature}: newer dialog`;
    if (feature === "resources") await choose("Subject", subject.title);
    await expect(page.getByRole("dialog").getByRole("button", { name: feature === "sessions" ? "Save session" : "Save", exact: true })).toBeEnabled();
    const marker = feature === "sessions" ? "Note (optional)" : "Title";
    await page.getByLabel(marker, { exact: true }).fill("Second dialog stays open");
    const response = page.waitForResponse(response => response.url().endsWith("/api/workspace") && response.request().method() === "POST");
    confirmations[observed].release(true);
    // Wait for the confirmation and the next paint, then inspect the newer form.
    await response;
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByLabel(marker, { exact: true })).toHaveValue("Second dialog stays open");
    results.push({ module: feature, operation: "pending save permits another dialog; old confirmation preserves newer draft", status: "PASS", ms: Math.round(performance.now() - started) });
  }
  stage = "settings: theme rollback";
  const shell = await (await context.request.get("/api/workspace?groups=shell")).json();
  const theme = shell.fields.user.theme;
  await page.goto("/settings");
  const observed = confirmations.length;
  await page.getByRole("combobox", { name: "Theme", exact: true }).click();
  await page.getByRole("option", { name: messages[theme === "dark" ? "light" : "dark"], exact: true }).click();
  await expect.poll(() => confirmations.length).toBe(observed + 1);
  const response = page.waitForResponse(response => response.url().endsWith("/api/workspace") && response.request().method() === "POST");
  confirmations[observed].release(false); await response;
  await expect.poll(async () => (await context.cookies()).find(cookie => cookie.name === "sf-theme")?.value).toBe(theme);
  results.push({ module: "settings", operation: "failed theme persistence restores the latest workspace preference", status: "PASS" });
  await context.close();
} catch (error) {
  results.push({ operation: "dialog concurrency audit", status: "FAIL", stage, error: error.name, message: error.message.slice(0, 500) });
  process.exitCode = 1;
} finally {
  await browser.close();
  writeFileSync("docs/DIALOG_PERFORMANCE_RESULTS.json", JSON.stringify({ generatedAt: new Date().toISOString(), conditions: "Chrome against the local production build. Write responses are stubbed; this checks UI ordering, not persistence.", results }, null, 2));
}
console.info(JSON.stringify(results));
