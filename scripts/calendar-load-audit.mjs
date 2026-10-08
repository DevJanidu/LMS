import { chromium, expect } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import assert from "node:assert/strict";
import { environment as env } from "./env-runtime.mjs";

if (!process.argv.includes("--acknowledge-current-test-database") || process.env.VERCEL_ENV === "production") throw new Error("Acknowledged fixture database required.");
const fixture = JSON.parse(readFileSync(".audit-local/fixtures.json", "utf8")), actor = fixture.users[0];
assert(fixture.ready && actor.email.startsWith("audit-"));
const sql = neon(env.DATABASE_URL), prefix = `Calendar load audit ${crypto.randomUUID()} `;
const [owned] = await sql`SELECT id FROM users WHERE id=${actor.id}::uuid AND email=${actor.email}`;
assert(owned);
const baseURL = process.argv.find(arg => arg.startsWith("--url="))?.slice(6) ?? "http://localhost:3100";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } }), page = await context.newPage();
const metrics = [], requests = [];
page.on("request", request => { if (new URL(request.url()).pathname === "/api/calendar") requests.push({ method: request.method() }); });
mkdirSync(".audit-local/calendar", { recursive: true });
try {
  await sql`INSERT INTO schedule_blocks (user_id,title,starts_at,ends_at,timezone)
    SELECT ${actor.id}::uuid,${prefix}||n,
      '2026-10-05T03:30:00Z'::timestamptz + ((n-1)/8)*interval '1 day' + ((n-1)%8)*interval '30 minutes',
      '2026-10-05T03:50:00Z'::timestamptz + ((n-1)/8)*interval '1 day' + ((n-1)%8)*interval '30 minutes',
      'Asia/Colombo' FROM generate_series(1,200) n`;
  await sql`INSERT INTO schedule_blocks (user_id,title,starts_at,ends_at,timezone)
    VALUES (${actor.id}::uuid,${prefix}||'history','2020-01-01T09:00Z','2020-01-01T10:00Z','UTC'),
      (${actor.id}::uuid,${prefix}||'future','2030-01-01T09:00Z','2030-01-01T10:00Z','UTC')`;
  await page.goto("/login"); await page.getByLabel("Email", { exact: true }).fill(actor.email);
  await page.getByLabel("Password", { exact: true }).fill(fixture.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click(); await page.waitForURL(/\/dashboard$/, { timeout: 60000 });
  const initial = performance.now(); await page.goto("/calendar"); await expect(page.locator(".planner-calendar-theme")).toBeVisible();
  metrics.push({ operation: "initial view with 200 total study events", ms: Math.round(performance.now() - initial) });
  for (const [label, range, expected] of [["day", "from=2026-10-08&to=2026-10-09", 8], ["month", "from=2026-10-01&to=2026-11-01", 200]]) {
    const start = performance.now(), response = await context.request.get(`/api/calendar?${range}`), text = await response.text(), body = JSON.parse(text);
    assert(response.ok(), body.error); assert.equal(body.blocks.filter(b => b.title.startsWith(prefix)).length, expected);
    assert(!body.blocks.some(b => b.title.endsWith("history") || b.title.endsWith("future")));
    metrics.push({ operation: `${label} range`, ms: Math.round(performance.now() - start), fixtureRows: expected, bytes: Buffer.byteLength(text), serverTiming: response.headers()["server-timing"] });
  }
  const month = performance.now(); await page.getByRole("button", { name: "Month", exact: true }).click();
  await expect(page.locator('.planner-timetable[aria-busy="false"]')).toBeVisible({ timeout: 30000 });
  metrics.push({ operation: "month view loaded", ms: Math.round(performance.now() - month), renderedEventNodes: await page.locator(".planner-event").count() });
  const before = requests.length, cached = performance.now(); await page.getByRole("button", { name: "Week", exact: true }).click();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  metrics.push({ operation: "cached week with many events", ms: Math.round(performance.now() - cached), extraRangeRequests: requests.length - before });
  assert.equal(requests.length, before);
  await page.screenshot({ path: ".audit-local/calendar/200-events.png" });
  const [row] = await sql.query("EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT id FROM schedule_blocks WHERE user_id=$1::uuid AND starts_at<'2026-10-09T00:00Z'::timestamptz AND ends_at>'2026-10-08T00:00Z'::timestamptz", [actor.id]);
  const plan = row["QUERY PLAN"][0];
  const nodes = node => [{ type: node["Node Type"], index: node["Index Name"], rows: node["Actual Rows"] }, ...(node.Plans ?? []).flatMap(nodes)];
  const report = { conditions: "Local production browser, 200 fixture-only one-time events plus two excluded outliers; SQL plan is the one-time interval branch, not the full recurrence query.", metrics, sqlExecutionMs: plan["Execution Time"], planNodes: nodes(plan.Plan) };
  writeFileSync(".audit-local/calendar/load-production.json", JSON.stringify(report, null, 2)); console.info(JSON.stringify(report));
} finally {
  await sql`DELETE FROM schedule_blocks WHERE user_id=${actor.id}::uuid AND title LIKE ${prefix + "%"}`;
  await browser.close();
}
