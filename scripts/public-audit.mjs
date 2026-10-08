import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
const phase = process.argv[2] ?? "after";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [];
mkdirSync(`.audit-local/${phase}`, { recursive: true });
try {
  for (const theme of ["light", "dark"]) {
    const context = await browser.newContext({ baseURL: "http://localhost:3100" });
    await context.addInitScript(theme => localStorage.setItem("theme-mode", theme), theme);
    const page = await context.newPage();
    for (const width of [360, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of ["/login", "/register", "/forgot-password", "/privacy", "/terms", "/error-404", "/error-500"]) {
        const response = await page.goto(route, { waitUntil: "networkidle" });
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
        const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
        results.push({ route, width, theme, status: response.status(), overflow, violations: axe.violations.map(v => ({ id: v.id, impact: v.impact, selectors: v.nodes.map(n => n.target) })) });
        assert.equal(overflow, false, `${route} ${width} ${theme} overflow`);
      }
    }
    await context.close();
  }
  writeFileSync(`docs/${phase.toUpperCase()}_PUBLIC_A11Y.json`, JSON.stringify(results, null, 2));
  console.info(JSON.stringify({ checks: results.length, failures: results.filter(r => r.violations.length).length, violations: [...new Set(results.flatMap(r => r.violations.map(v => v.id)))] }));
} finally { await browser.close(); }
