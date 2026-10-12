import { chromium, expect } from "@playwright/test";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
if (
  !process.argv.includes("--acknowledge-current-test-database") ||
  process.env.VERCEL_ENV === "production"
)
  throw new Error("Fixture-only database acknowledgement required.");
const fixture = JSON.parse(readFileSync(".audit-local/fixtures.json", "utf8"));
const user = fixture.users.find((user) => user.role === "learner");
assert(user?.email.startsWith("audit-"));
const baseURL = "http://localhost:3100",
  goalId = crypto.randomUUID(),
  title = `Goals design audit ${goalId}`;
const directory = ".audit-local/goals-redesign";
mkdirSync(directory, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ baseURL });
context.setDefaultTimeout(30000);
const report = [],
  errors = [];
let created = false;
let setup = true,
  setupDetail;
const check = (name, values = {}) => {
  report.push({ check: name, passed: true, ...values });
  console.info(`PASS: ${name}`);
};
const detail = async () => {
  const response = await context.request.get(`/api/goals?id=${goalId}`);
  const result = await response.json();
  assert(result.ok, result.error);
  return result.detail;
};
const mutation = async (action, initial = false) => {
  const current = initial ? null : setup ? setupDetail : await detail();
  const response = await context.request.post("/api/goals", {
    headers: { Origin: baseURL },
    data: {
      operationId: crypto.randomUUID(),
      goalId,
      expectedVersion: current?.goal.version ?? 0,
      action,
    },
  });
  const result = await response.json();
  assert(result.ok, `Goal mutation: ${result.error}`);
  setupDetail = result.detail;
  return result;
};
try {
  const login = await context.request.post("/api/auth/sign-in/email", {
    headers: { Origin: baseURL },
    data: { email: user.email, password: fixture.password },
  });
  assert(login.ok(), `Fixture sign-in: ${login.status()}`);
  const today = new Date().toISOString().slice(0, 10),
    targetDate = new Date(Date.now() + 45 * 86400000)
      .toISOString()
      .slice(0, 10);
  await mutation(
    {
      kind: "goal",
      value: {
        title,
        description: "A focused learning journey with small, achievable steps.",
        category: "career",
        startDate: today,
        targetDate,
        progressMode: "tasks",
      },
    },
    true,
  );
  created = true;
  const references = await (
    await context.request.get("/api/goals?references=1")
  ).json();
  const subject = references.references.subjects[0];
  const milestones = [crypto.randomUUID(), crypto.randomUUID()];
  for (const [index, id] of milestones.entries())
    await mutation({
      kind: "milestone",
      id,
      value: {
        title: index ? "Build confidence" : "Core foundations",
        dueDate: targetDate,
        sortOrder: index,
      },
    });
  const tasks = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
  for (const [index, id] of tasks.entries())
    await mutation({
      kind: "task",
      id,
      value: {
        title: [
          "Read foundations",
          "Practice with examples",
          "Build a small project",
        ][index],
        milestoneId: milestones[index === 2 ? 1 : 0],
        subjectId: subject?.id ?? null,
        dueDate: targetDate,
        estimatedMinutes: 30,
        description: "Helpful detail that stays collapsed until requested.",
      },
    });
  setup = false;
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    // The rollback check deliberately returns one 409 response.
    if (
      message.type() === "error" &&
      !message.text().includes("409 (Conflict)")
    )
      errors.push(message.text());
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/goals?search=${encodeURIComponent(title)}`);
  const card = page.locator(".goal-card").filter({ hasText: title });
  await expect(card).toBeVisible();
  const stats = await (await context.request.get("/api/goals")).json();
  const metrics = await page.locator(".goal-metrics dd").allTextContents();
  assert.deepEqual(
    metrics.map((value) => Number(value.replaceAll(",", ""))),
    [
      stats.statistics.active,
      stats.statistics.completed,
      stats.statistics.tasksCompleted,
      stats.statistics.upcoming,
    ].map(Number),
  );
  check("account-wide KPI values match the API");
  await card
    .getByRole("button", { name: `Edit: ${title}`, exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  assert(new URL(page.url()).pathname === "/goals");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await card
    .getByRole("button", { name: `Delete: ${title}`, exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  assert(new URL(page.url()).pathname === "/goals");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  check("card edit and delete controls do not navigate");
  const cardSurface = await card.locator(".goal-card-next").boundingBox();
  assert(cardSurface);
  await page.mouse.click(
    cardSurface.x + cardSurface.width / 2,
    cardSurface.y + cardSurface.height / 2,
  );
  await expect(page).toHaveURL(new RegExp(`/goals/${goalId}$`));
  await expect(
    page.getByRole("checkbox", {
      name: "Complete: Read foundations",
      exact: true,
    }),
  ).toBeVisible();
  assert.equal(await page.locator("h1").count(), 1);
  assert.equal(await page.locator("details.goal-milestone[open]").count(), 0);
  check("whole card opens detail with tasks visible and milestones collapsed");
  await page.screenshot({
    path: `${directory}/detail-initial.png`,
    fullPage: true,
  });
  if (process.argv.includes("--visual-only")) {
    for (const theme of ["light", "dark"])
      for (const width of [1440, 1024, 768, 390]) {
        await page.evaluate(
          (theme) =>
            document.documentElement.classList.toggle("dark", theme === "dark"),
          theme,
        );
        await page.setViewportSize({ width, height: 1000 });
        await page.waitForFunction(
          () => document.documentElement.scrollWidth <= innerWidth,
          undefined,
          { timeout: 5000 },
        );
        if (width === 390) {
          const tops = await page
            .getByRole("tab")
            .evaluateAll((tabs) =>
              tabs.map((tab) => Math.round(tab.getBoundingClientRect().top)),
            );
          assert.equal(
            new Set(tops).size,
            1,
            "All four sections fit one mobile row",
          );
        }
        await page.screenshot({
          path: `${directory}/detail-${theme}-${width}.png`,
          fullPage: true,
        });
      }
    check(
      "final detail visuals: both themes, four viewport sizes and compact mobile tabs",
    );
    assert.deepEqual(errors, []);
  } else {
    const completion = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/goals") &&
        response.request().method() === "POST",
    );
    await page
      .getByRole("checkbox", {
        name: "Complete: Read foundations",
        exact: true,
      })
      .click();
    assert((await (await completion).json()).ok);
    await expect(page.locator(".goal-progress-summary")).toContainText(
      "25% complete",
    );
    await page.reload();
    await expect(page.locator(".goal-progress-summary")).toContainText(
      "25% complete",
    );
    assert.equal(
      (await detail()).tasks.find((task) => task.id === tasks[0]).status,
      "completed",
    );
    check("task completion and goal progress persist after refresh");
    await page.getByRole("tab", { name: "Tasks", exact: true }).click();
    await page.getByRole("button", { name: "Completed", exact: true }).click();
    const reopening = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/goals") &&
        response.request().method() === "POST",
    );
    await page
      .getByRole("checkbox", {
        name: "Mark incomplete: Read foundations",
        exact: true,
      })
      .click();
    assert((await (await reopening).json()).ok);
    await expect(page.locator(".goal-progress-summary")).toContainText(
      "0% complete",
    );
    await page.getByRole("button", { name: "Pending", exact: true }).click();
    await page.route("**/api/goals", async (route) => {
      if (route.request().method() === "POST")
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({ ok: false, error: "conflict" }),
        });
      else await route.continue();
    });
    await page
      .getByRole("checkbox", {
        name: "Complete: Read foundations",
        exact: true,
      })
      .click();
    await expect(page.getByRole("alert").first()).toBeVisible();
    await expect(
      page.getByRole("checkbox", {
        name: "Complete: Read foundations",
        exact: true,
      }),
    ).not.toBeChecked();
    await expect(page.locator(".goal-progress-summary")).toContainText(
      "0% complete",
    );
    await page.unroute("**/api/goals");
    check(
      "failed task mutations roll back optimistic completion and announce errors",
    );
    await page.getByRole("button", { name: "Add task", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByLabel("Title", { exact: true })
      .fill("New audit task");
    const createTask = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/goals") &&
        response.request().method() === "POST",
    );
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Save", exact: true })
      .click();
    assert((await (await createTask).json()).ok);
    const newRow = page
      .locator(".goal-task-row")
      .filter({ hasText: "New audit task" });
    await newRow.locator(".goal-menu > summary").click();
    await newRow
      .getByRole("button", { name: "Edit task", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByLabel("Title", { exact: true })
      .fill("Edited audit task");
    const editTask = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/goals") &&
        response.request().method() === "POST",
    );
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Save", exact: true })
      .click();
    assert((await (await editTask).json()).ok);
    const editedRow = page
      .locator(".goal-task-row")
      .filter({ hasText: "Edited audit task" });
    await editedRow.locator(".goal-menu > summary").click();
    await editedRow
      .getByRole("button", { name: "Delete: Edited audit task", exact: true })
      .click();
    const deleteTask = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/goals") &&
        response.request().method() === "POST",
    );
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Confirm", exact: true })
      .click();
    assert((await (await deleteTask).json()).ok);
    await expect(editedRow).toHaveCount(0);
    await page.reload();
    await expect(
      page.getByRole("tab", { name: "Tasks", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    assert(
      !(await detail()).tasks.some(
        (task) => task.title === "Edited audit task",
      ),
    );
    check(
      "task creation, editing, deletion and reopening persist; selected section survives refresh",
    );
    await page.getByRole("tab", { name: "Milestones", exact: true }).click();
    const milestone = page.locator(".goal-milestone").first();
    await milestone.locator("summary").click();
    await expect(milestone).toHaveAttribute("open", "");
    await milestone.locator("summary").click();
    await expect(milestone).not.toHaveAttribute("open", "");
    await page.getByRole("tab", { name: "Study Plan", exact: true }).click();
    await expect(
      page.getByText("No study sessions scheduled for this goal yet."),
    ).toBeVisible();
    assert(
      (
        await page
          .getByRole("link", { name: "Plan with Aven", exact: true })
          .getAttribute("href")
      ).includes(`goal=${goalId}`),
    );
    check(
      "milestones expand; study-plan empty state carries secure goal context to Aven",
    );
    await page.goBack();
    await expect(
      page.getByRole("tab", { name: "Milestones", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await page.getByRole("tab", { name: "Overview", exact: true }).click();
    for (const theme of ["light", "dark"]) {
      await page.evaluate(
        (theme) =>
          document.documentElement.classList.toggle("dark", theme === "dark"),
        theme,
      );
      for (const width of [1440, 1024, 768, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.waitForFunction(
          () => document.documentElement.scrollWidth <= innerWidth,
          undefined,
          { timeout: 5000 },
        );
        assert(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `${theme} at ${width}px overflows`,
        );
        await page.screenshot({
          path: `${directory}/detail-${theme}-${width}.png`,
          fullPage: true,
        });
      }
    }
    check("light/dark detail layouts fit desktop, laptop, tablet and mobile");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(
      `/goals?search=${encodeURIComponent(title)}&sort=progress&status=active`,
    );
    await expect(
      page.locator(".goal-card").filter({ hasText: title }),
    ).toBeVisible();
    await page
      .getByLabel("Search goals", { exact: true })
      .fill("No matching audit goal");
    await expect(page.getByText("No goals match your filters.")).toBeVisible();
    await page
      .getByRole("button", { name: "Clear filters", exact: true })
      .click();
    await expect(page.locator(".goal-card").first()).toBeVisible();
    check("combined search/status/sort and filtered empty state work");
    for (const theme of ["light", "dark"]) {
      await page.evaluate(
        (theme) =>
          document.documentElement.classList.toggle("dark", theme === "dark"),
        theme,
      );
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.waitForFunction(
          () => document.documentElement.scrollWidth <= innerWidth,
          undefined,
          { timeout: 5000 },
        );
        if (
          !(await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ))
        ) {
          console.info(
            await page.evaluate(() =>
              [...document.querySelectorAll("body *")]
                .filter((element) => {
                  const rect = element.getBoundingClientRect();
                  return rect.right > innerWidth + 1 && rect.width > 0;
                })
                .slice(0, 12)
                .map((element) => ({
                  tag: element.tagName,
                  class: element.className,
                  width: Math.round(element.getBoundingClientRect().width),
                })),
            ),
          );
          await page.screenshot({
            path: `${directory}/overflow-${theme}-${width}.png`,
            fullPage: true,
          });
          throw new Error(
            `Goals list overflows at ${width}px in ${theme} mode`,
          );
        }
        await page.screenshot({
          path: `${directory}/goals-${theme}-${width}.png`,
          fullPage: true,
        });
      }
    }
    check("goals list fits mobile and desktop in both themes");
    assert.deepEqual(errors, []);
    check("no browser console or runtime errors");
  }
} finally {
  if (created) await mutation({ kind: "deleteGoal" });
  writeFileSync(
    `${directory}/${process.argv.includes("--visual-only") ? "visual-report" : "report"}.json`,
    JSON.stringify({ checks: report, errors }, null, 2),
  );
  await browser.close();
}
