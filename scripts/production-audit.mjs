import { chromium } from "@playwright/test";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
const phase = process.argv[2] ?? "after";
const baseURL = "http://localhost:3100";
const fixture = JSON.parse(readFileSync(".audit-local/fixtures.json", "utf8"));
const inventory = JSON.parse(readFileSync("docs/PERFORMANCE_INVENTORY.json", "utf8"));
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
    const routes = inventory.routes.filter(route => route.kind === "page" && (user.role === "learner" ? route.file.includes("(learner)") && !route.path.includes("[id]") : route.path.startsWith("/admin")))
      .map(route => route.path.replace("[id]", fixture.users[0].id));
    for (const route of routes) {
      const navigationStarted = performance.now();
      const response = await page.goto(route, { waitUntil: "networkidle" });
      const navigationIdleMs = Math.round(performance.now() - navigationStarted);
      assert.equal(response.status(), 200, route);
      const values = await page.evaluate(() => {
        const nav = performance.getEntriesByType("navigation")[0];
        return { ttfbMs: Math.round(nav.responseStart - nav.requestStart), fcpMs: Math.round(performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? 0), jsTransferBytes: performance.getEntriesByType("resource").filter(r => r.initiatorType === "script").reduce((n, r) => n + r.encodedBodySize, 0), overflow: document.documentElement.scrollWidth > innerWidth, heading: Boolean(document.querySelector("h1")) };
      });
      assert.equal(values.heading, true, route);
      metrics.push({ route, ...values, navigationIdleMs, cacheControl: response.headers()["cache-control"] });
      for (const width of [1920, 390]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 1080 });
        // Allow the responsive sidebar and chart ResizeObserver transition to settle.
        await page.waitForTimeout(400);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        if (!await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)) console.info(JSON.stringify({ route, width, offenders: await page.evaluate(() => [...document.querySelectorAll("main *")].map(element => ({ className: typeof element.className === "string" ? element.className : element.tagName, right: Math.round(element.getBoundingClientRect().right), width: Math.round(element.getBoundingClientRect().width) })).filter(element => element.right > innerWidth + 1).slice(0, 15)) }));
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route} overflow at ${width}`);
      }
      await page.setViewportSize({ width: 1280, height: 900 });
    }
  }
  await context.close();
  writeFileSync(`docs/${phase.toUpperCase()}_METRICS.json`, JSON.stringify({ conditions: "Local production build, Chrome, two fixture learners with 1095 sessions each, unthrottled. Video remains ignored locally. Not Lighthouse/4G results.", metrics }, null, 2));
  console.info(JSON.stringify(metrics));
} finally { await browser.close(); }
