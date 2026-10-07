import { chromium } from "@playwright/test";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
const phase = process.argv[2] ?? "after";
const baseURL = "http://localhost:3100";
const fixture = JSON.parse(readFileSync(".audit-local/fixtures.json", "utf8"));
mkdirSync(`.audit-local/${phase}`, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const metrics = [];
try {
  const context = await browser.newContext({ baseURL, recordVideo: { dir: `.audit-local/${phase}/video` } });
  const page = await context.newPage();
  for (const user of [fixture.users[0], fixture.users[2]]) {
    await context.clearCookies();
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill(fixture.password);
    const hops = [];
    const handler = request => { if (request.isNavigationRequest() || request.headers()["next-action"]) hops.push({ method: request.method(), path: new URL(request.url()).pathname }); };
    page.on("request", handler);
    const start = performance.now();
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    try { await page.waitForURL(user.role === "learner" ? /\/dashboard$/ : /\/admin$/, { timeout: 30000 }); }
    catch { console.info(JSON.stringify({ role: user.role, alert: await page.getByRole("alert").allTextContents(), hops })); throw new Error("Production sign-in did not reach the role destination."); }
    await page.locator("h1").first().waitFor({ timeout: 60000 });
    metrics.push({ route: user.role === "learner" ? "/dashboard" : "/admin", loginHeadingMs: Math.round(performance.now() - start), hops });
    page.off("request", handler);
    const routes = user.role === "learner" ? ["/dashboard", "/subjects", "/study", "/study/history", "/calendar", "/analytics", "/resources", "/settings"] : ["/admin", "/admin/users", "/admin/analytics", "/admin/storage", "/admin/settings"];
    for (const route of routes) {
      const response = await page.goto(route, { waitUntil: "networkidle" });
      assert.equal(response.status(), 200, route);
      const values = await page.evaluate(() => {
        const nav = performance.getEntriesByType("navigation")[0];
        return { ttfbMs: Math.round(nav.responseStart - nav.requestStart), fcpMs: Math.round(performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? 0), jsTransferBytes: performance.getEntriesByType("resource").filter(r => r.initiatorType === "script").reduce((n, r) => n + r.encodedBodySize, 0), overflow: document.documentElement.scrollWidth > innerWidth, heading: Boolean(document.querySelector("h1")) };
      });
      assert.equal(values.heading, true, route);
      metrics.push({ route, ...values, cacheControl: response.headers()["cache-control"] });
    }
  }
  await context.close();
  writeFileSync(`docs/${phase.toUpperCase()}_METRICS.json`, JSON.stringify({ conditions: "Local production build, Chrome, two fixture learners with 1095 sessions each, unthrottled. Video remains ignored locally. Not Lighthouse/4G results.", metrics }, null, 2));
  console.info(JSON.stringify(metrics));
} finally { await browser.close(); }
