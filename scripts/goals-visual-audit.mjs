import { chromium } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
import assert from "node:assert/strict";
const fixture = JSON.parse(readFileSync(".audit-local/fixtures.json", "utf8"));
const user = fixture.users.find((user) => user.role === "learner");
assert(user?.email.startsWith("audit-"));
const baseURL = "http://localhost:3100",
  directory = ".audit-local/goals-redesign";
mkdirSync(directory, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const context = await browser.newContext({ baseURL });
  const response = await context.request.post("/api/auth/sign-in/email", {
    headers: { Origin: baseURL },
    data: { email: user.email, password: fixture.password },
  });
  assert(response.ok());
  const page = await context.newPage();
  await page.goto("/goals");
  await page.locator(".goal-metrics").waitFor();
  for (const theme of ["light", "dark"])
    for (const width of [1440, 1024, 768, 390]) {
      await page.evaluate(
        (theme) =>
          document.documentElement.classList.toggle("dark", theme === "dark"),
        theme,
      );
      await page.setViewportSize({ width, height: 1000 });
      const overflow = await page.evaluate(() => ({
        viewport: innerWidth,
        document: document.documentElement.scrollWidth,
        nodes: [...document.querySelectorAll("main *")]
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            return rect.right > innerWidth + 1 && rect.width > 0;
          })
          .slice(0, 10)
          .map((element) => ({
            tag: element.tagName,
            class: element.className,
            width: Math.round(element.getBoundingClientRect().width),
          })),
      }));
      console.info(JSON.stringify({ theme, width, ...overflow }));
      await page.screenshot({
        path: `${directory}/list-${theme}-${width}.png`,
        fullPage: true,
      });
      assert(overflow.document <= overflow.viewport, `Overflow at ${width}px`);
    }
} finally {
  await browser.close();
}
