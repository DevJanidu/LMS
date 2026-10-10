import { chromium, expect } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";

if (!process.argv.includes("--acknowledge-current-test-database") || process.env.VERCEL_ENV === "production") throw new Error("Test database acknowledgement required.");
const baseURL = process.env.APP_URL ?? "http://localhost:3100";
const fixture = JSON.parse(readFileSync(".audit-local/fixtures.json", "utf8"));
const persona = process.argv.find(arg => arg.startsWith("--persona="))?.slice(10) ?? "active";
assert(["new", "active", "stress"].includes(persona));
const primary = persona === "new" ? JSON.parse(readFileSync(".audit-local/performance-persona.json", "utf8"))
  : { ...fixture.users[persona === "active" ? 0 : 1], password: fixture.password };
assert(primary.email.startsWith("audit-"));
const accounts = [primary, { ...fixture.users[persona === "active" ? 1 : 0], password: fixture.password }];
assert(fixture.users.slice(0, 2).every(user => user.email.startsWith("audit-")));
const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [], contexts = [];
const subject = { id: crypto.randomUUID(), title: `Upload audit ${crypto.randomUUID()}`, description: "Fixture only", color: "brand", status: "active" };
let created = false;
try {
  for (const user of accounts) {
    const context = await browser.newContext({ baseURL }); contexts.push(context);
    assert((await context.request.post("/api/auth/sign-in/email", { headers: { Origin: baseURL }, data: { email: user.email, password: user.password } })).ok());
  }
  const response = await contexts[0].request.post("/api/workspace", { headers: { Origin: baseURL }, data: { operations: [{ kind: "subject", value: subject }] } });
  assert((await response.json()).ok); created = true;
  const page = await contexts[0].newPage();
  await page.goto("/resources");
  await page.getByRole("button", { name: "Add Resource", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title", { exact: true }).fill(subject.title);
  const choose = async (label, option) => {
    await dialog.getByRole("combobox", { name: label, exact: true }).click();
    await page.getByRole("option", { name: option, exact: true }).click();
  };
  await choose("Subject", subject.title); await choose("Type", "File");
  const buffer = Buffer.from("StudyFlow UUID-scoped browser upload fixture\n");
  await dialog.locator('input[type="file"]').setInputFiles({ name: "audit.txt", mimeType: "text/plain", buffer });
  const start = performance.now();
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 60000 });
  const uploaded = (await (await contexts[0].request.get("/api/workspace?groups=resources")).json()).fields.resources.find(row => row.title === subject.title);
  assert(uploaded?.type === "file" && uploaded.sizeBytes === buffer.length);
  const download = await contexts[0].request.get(`/api/files/${uploaded.id}`, { maxRedirects: 0 });
  assert.equal(download.status(), 302);
  const data = await contexts[0].request.get(download.headers().location);
  assert(data.ok()); assert.deepEqual(await data.body(), buffer);
  assert.equal((await contexts[1].request.get(`/api/files/${uploaded.id}`, { maxRedirects: 0 })).status(), 404);
  results.push({ operation: "browser signed upload, confirmation, exact download, foreign-account denial", status: "PASS", ms: Math.round(performance.now() - start) });
} catch (error) {
  results.push({ operation: "browser file lifecycle", status: "FAIL", error: error.name }); process.exitCode = 1;
} finally {
  if (created) {
    try {
      const removed = await contexts[0].request.post("/api/workspace", { headers: { Origin: baseURL }, data: { operations: [{ kind: "delete", entity: "subject", id: subject.id }] } });
      assert((await removed.json()).ok);
      results.push({ operation: "UUID fixture removed; object deletion uses the application storage queue", status: "PASS" });
    } catch { results.push({ operation: "UUID fixture cleanup", status: "BLOCKED" }); process.exitCode = 1; }
  }
  for (const context of contexts) await context.close();
  await browser.close();
  writeFileSync(`docs/UPLOAD_${persona.toUpperCase()}_PERFORMANCE_RESULTS.json`, JSON.stringify({ generatedAt: new Date().toISOString(), persona, results }, null, 2));
}
console.info(JSON.stringify(results));
