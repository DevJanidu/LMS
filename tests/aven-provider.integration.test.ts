import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { chromium, expect as playwrightExpect } from "@playwright/test";
const browserExpect = playwrightExpect.configure({ timeout: 120000 });
import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { aiPreferenceSchema } from "@/lib/aven/validation";
import { notificationPreferenceSchema } from "@/lib/aven/validation";
import { localDay, shiftDay, wallTime, zonedToUtc } from "@/lib/analytics";
import { createTranslator } from "next-intl";
import en from "@/messages/en.json";
import { goalSchema } from "@/lib/goals/validation";
vi.mock("next-intl/server", () => ({
  getTranslations: async ({ namespace }: { namespace: string }) =>
    createTranslator({
      locale: "en",
      messages: en,
      namespace: namespace as "aven.notifications",
    }),
}));
vi.mock("@/i18n/navigation", () => ({
  redirect: () => {
    throw new Error("Unexpected fixture redirect");
  },
}));
const enabled =
  Boolean(process.env.TEST_DATABASE_URL && process.env.OPENAI_API_KEY) &&
  process.env.TEST_AVEN_PROVIDER === "true";
describe.skipIf(!enabled)("Real provider failure and browser retry", () => {
  const owner = crypto.randomUUID(),
    token = crypto.randomUUID(),
    requestId = crypto.randomUUID();
  let db: ReturnType<typeof import("@/lib/db").getDb>,
    s: typeof import("@/lib/db/schema"),
    conversationId: string;
  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    db = (await import("@/lib/db")).getDb();
    s = await import("@/lib/db/schema");
    await db
      .insert(s.users)
      .values({
        id: owner,
        name: "Provider recovery fixture",
        email: `${owner}@example.com`,
        emailVerified: true,
        timezone: "Asia/Colombo",
        timezoneMode: "manual",
        acceptedTermsAt: new Date(),
        onboardingCompletedAt: new Date(),
      });
    await db.insert(s.preferences).values({ userId: owner });
    await db
      .insert(s.authSessions)
      .values({
        userId: owner,
        token,
        expiresAt: new Date(Date.now() + 3600000),
      });
    await db
      .insert(s.aiUserPreferences)
      .values({
        userId: owner,
        value: aiPreferenceSchema.parse({
          consent: true,
          onboardingComplete: true,
        }),
      });
  }, 60000);
  afterAll(async () => {
    if (db && s) {
      await db.delete(s.auditLogs).where(eq(s.auditLogs.actorUserId, owner));
      await db.delete(s.users).where(eq(s.users.id, owner));
    }
  }, 60000);
  it("handles a genuine OpenAI 401, displays the saved failure, and retries with no duplicate user message", async () => {
    const { prepareChat, streamChat } = await import("@/lib/aven/chat");
    const input = {
      conversationId: null,
      goalId: null,
      requestId,
      message: "What's your name?",
      planning: false,
    };
    const prepared = await prepareChat(owner, input);
    conversationId = prepared.conversation.id;
    // Deliberate negative credential in this isolated request, never in an environment file.
    prepared.reservation.config.key =
      "invalid-aven-credential-for-failure-verification";
    const events: Record<string, unknown>[] = [];
    await streamChat(
      owner,
      input,
      prepared,
      (event) => events.push(event),
      AbortSignal.timeout(60000),
    );
    expect(events.at(-1)).toMatchObject({
      type: "error",
      code: "aiKeyInvalid",
    });
    let rows = await db
      .select()
      .from(s.aiMessages)
      .where(eq(s.aiMessages.conversationId, conversationId));
    expect(rows.find((row) => row.role === "assistant")?.content).toBe(
      "aiKeyInvalid",
    );
    const browser = await chromium.launch({ channel: "msedge" });
    try {
      const base = process.env.TEST_APP_URL ?? "http://localhost:3000";
      const context = await browser.newContext({
        timezoneId: "Asia/Colombo",
        viewport: { width: 1280, height: 900 },
      });
      const cookie = encodeURIComponent(
        `${token}.${createHmac(
          "sha256",
          process.env.AUTH_SECRET ?? process.env.BETTER_AUTH_SECRET!,
        )
          .update(token)
          .digest("base64")}`,
      );
      await context.addCookies([
        { name: "better-auth.session_token", value: cookie, url: base },
      ]);
      const page = await context.newPage();
      page.setDefaultTimeout(120000);
      page.setDefaultNavigationTimeout(120000);
      await page.goto(`${base}/aven?conversation=${conversationId}`);
      await browserExpect(
        page.getByRole("button", { name: "Try again", exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Try again", exact: true })
        .click();
      await browserExpect(
        page.getByRole("button", { name: "Stop", exact: true }),
      ).toBeVisible();
      await browserExpect(
        page.getByRole("button", { name: "Stop", exact: true }),
      ).toHaveCount(0, { timeout: 120000 });
      rows = await db
        .select()
        .from(s.aiMessages)
        .where(eq(s.aiMessages.conversationId, conversationId));
      expect(rows.filter((row) => row.role === "user")).toHaveLength(1);
      expect(
        rows.some(
          (row) =>
            row.role === "assistant" &&
            row.status === "complete" &&
            /Aven/i.test(row.content),
        ),
      ).toBe(true);
      const receipt = await db
        .select()
        .from(s.aiUsageRecords)
        .where(eq(s.aiUsageRecords.requestId, requestId));
      expect(receipt[0].costMicros).toBe(0);
      await page.screenshot({
        path: ".audit-local/aven-provider-recovery.png",
      });
      await context.close();
    } finally {
      await browser.close();
    }
  }, 180000);
  it("continues a real missed-session notification into an approved reschedule", async () => {
    const subject = crypto.randomUUID(),
      now = Date.now(),
      timezone = "Asia/Colombo";
    await db
      .insert(s.subjects)
      .values({
        id: subject,
        userId: owner,
        title: "Java practice",
        displayColor: "orange",
      });
    const [block] = await db
      .insert(s.scheduleBlocks)
      .values({
        userId: owner,
        subjectId: subject,
        title: "Java practice",
        startsAt: new Date(now - 20 * 60000),
        endsAt: new Date(now + 40 * 60000),
        timezone,
        displayColor: "orange",
      })
      .returning();
    await db
      .insert(s.notificationPreferences)
      .values({
        userId: owner,
        value: notificationPreferenceSchema.parse({
          enabled: true,
          missedSessions: true,
          sessionReminders: false,
          morning: false,
          evening: false,
          weekly: false,
          randomized: false,
          goalReminders: false,
          quietStart: "00:00",
          quietEnd: "00:00",
          dailyLimit: 10,
        }),
      });
    const { processAvenUser } = await import("@/lib/aven/scheduler");
    expect(await processAvenUser(owner, now)).toBe(1);
    expect(await processAvenUser(owner, now)).toBe(0);
    const [notification] = await db
      .select()
      .from(s.notifications)
      .where(eq(s.notifications.userId, owner));
    const browser = await chromium.launch({ channel: "msedge" });
    try {
      const base = process.env.TEST_APP_URL ?? "http://localhost:3000",
        context = await browser.newContext({ timezoneId: timezone });
      await context.addCookies([
        {
          name: "better-auth.session_token",
          value: encodeURIComponent(
            `${token}.${createHmac(
              "sha256",
              process.env.AUTH_SECRET ?? process.env.BETTER_AUTH_SECRET!,
            )
              .update(token)
              .digest("base64")}`,
          ),
          url: base,
        },
      ]);
      const page = await context.newPage();
      page.setDefaultTimeout(120000);
      page.setDefaultNavigationTimeout(120000);
      await page.goto(`${base}/aven?notification=${notification.id}`);
      await browserExpect(
        page
          .locator('article[data-role="assistant"]')
          .filter({ hasText: "Java practice" }),
      ).toBeVisible();
      await page
        .getByRole("textbox", { name: "Message Aven", exact: true })
        .fill(
          "Move this missed Java practice session to tomorrow at 9:00 AM. Keep its one-hour duration.",
        );
      const pending = page.waitForResponse(
        (response) =>
          response.url() === base + "/api/aven/chat" &&
          response.request().method() === "POST",
      );
      await page.getByRole("button", { name: "Send", exact: true }).click();
      await pending;
      await browserExpect(
        page.getByRole("button", { name: "Stop", exact: true }),
      ).toHaveCount(0);
      await browserExpect(
        page.getByRole("button", { name: "Approve and save", exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Approve and save", exact: true })
        .click();
      await browserExpect(
        page.getByRole("link", { name: "Open Study Planner", exact: true }),
      ).toBeVisible();
      const [saved] = await db
        .select()
        .from(s.scheduleBlocks)
        .where(eq(s.scheduleBlocks.id, block.id));
      expect(wallTime(saved.startsAt.toISOString(), timezone)).toBe(
        `${shiftDay(localDay(now, timezone), 1)}T09:00`,
      );
      expect(saved.endsAt.getTime() - saved.startsAt.getTime()).toBe(3600000);
      expect(saved.displayColor).toBe("orange");
      await context.close();
    } finally {
      await browser.close();
    }
  }, 240000);
  it("stops a genuine streamed reply and leaves a terminal saved cancellation", async () => {
    const browser = await chromium.launch({ channel: "msedge" });
    try {
      const base = process.env.TEST_APP_URL ?? "http://localhost:3000",
        context = await browser.newContext({ timezoneId: "Asia/Colombo" });
      await context.addCookies([
        {
          name: "better-auth.session_token",
          value: encodeURIComponent(
            `${token}.${createHmac(
              "sha256",
              process.env.AUTH_SECRET ?? process.env.BETTER_AUTH_SECRET!,
            )
              .update(token)
              .digest("base64")}`,
          ),
          url: base,
        },
      ]);
      const page = await context.newPage();
      page.setDefaultTimeout(120000);
      page.setDefaultNavigationTimeout(120000);
      await page.goto(`${base}/aven`);
      const message =
        "Explain dependency injection in Java in detail, with several code examples and step-by-step explanations.";
      await page
        .getByRole("textbox", { name: "Message Aven", exact: true })
        .fill(message);
      const pending = page.waitForResponse(
        (response) => response.url() === base + "/api/aven/chat",
      );
      await page
        .getByRole("textbox", { name: "Message Aven", exact: true })
        .press("Enter");
      const response = await pending;
      await browserExpect(
        page.getByRole("textbox", { name: "Message Aven", exact: true }),
      ).toHaveValue("");
      await page.getByRole("button", { name: "Stop", exact: true }).click();
      await browserExpect(
        page.getByRole("button", { name: "Stop", exact: true }),
      ).toHaveCount(0);
      const request = response.request().postDataJSON();
      let row: typeof s.aiMessages.$inferSelect | undefined;
      await browserExpect
        .poll(
          async () => {
            const rows = await db
              .select()
              .from(s.aiMessages)
              .where(eq(s.aiMessages.requestId, request.requestId));
            row = rows.find((item) => item.role === "assistant");
            return row?.status;
          },
          { timeout: 30000, intervals: [2000] },
        )
        .toBe("cancelled");
      expect(
        row?.content === "generationStopped" || Boolean(row?.content),
      ).toBe(true);
      await context.close();
    } finally {
      await browser.close();
    }
  }, 180000);
  it("opens a randomized check-in from the notification center and continues with real goal context", async () => {
    const timezone = "Asia/Colombo",
      day = localDay(Date.now(), timezone),
      goal = crypto.randomUUID();
    const { mutateGoal } = await import("@/lib/goals/service");
    await mutateGoal(owner, {
      operationId: crypto.randomUUID(),
      goalId: goal,
      expectedVersion: 0,
      action: {
        kind: "goal",
        value: goalSchema.parse({
          title: "Learn Java",
          startDate: day,
          targetDate: shiftDay(day, 30),
          reminders: true,
        }),
      },
    });
    const prefs = notificationPreferenceSchema.parse({
      enabled: true,
      randomized: true,
      allowedStart: "12:00",
      allowedEnd: "12:01",
      morning: false,
      evening: false,
      weekly: false,
      missedSessions: false,
      sessionReminders: false,
      goalReminders: false,
      quietStart: "00:00",
      quietEnd: "00:00",
      dailyLimit: 10,
    });
    await db
      .insert(s.notificationPreferences)
      .values({ userId: owner, value: prefs })
      .onConflictDoUpdate({
        target: s.notificationPreferences.userId,
        set: { value: prefs },
      });
    const { processAvenUser } = await import("@/lib/aven/scheduler");
    const now = Date.parse(zonedToUtc(`${day}T12:00`, timezone));
    expect(await processAvenUser(owner, now)).toBe(1);
    expect(await processAvenUser(owner, now)).toBe(0);
    const browser = await chromium.launch({ channel: "msedge" });
    try {
      const base = process.env.TEST_APP_URL ?? "http://localhost:3000",
        context = await browser.newContext({ timezoneId: timezone });
      await context.addCookies([
        {
          name: "better-auth.session_token",
          value: encodeURIComponent(
            `${token}.${createHmac(
              "sha256",
              process.env.AUTH_SECRET ?? process.env.BETTER_AUTH_SECRET!,
            )
              .update(token)
              .digest("base64")}`,
          ),
          url: base,
        },
      ]);
      const page = await context.newPage();
      page.setDefaultTimeout(120000);
      page.setDefaultNavigationTimeout(120000);
      await page.goto(`${base}/aven`);
      await page
        .getByRole("tab", { name: "Notifications", exact: true })
        .click();
      const item = page.locator("article").filter({ hasText: "Learn Java" });
      await browserExpect(item).toBeVisible();
      await item
        .getByRole("button", { name: "Reply to Aven", exact: true })
        .click();
      await browserExpect(
        page
          .locator('article[data-role="assistant"]')
          .filter({ hasText: "Learn Java" }),
      ).toBeVisible();
      await page
        .getByRole("textbox", { name: "Message Aven", exact: true })
        .fill(
          "What should I do next for my Java goal? Please look at my saved goal.",
        );
      const pending = page.waitForResponse(
        (response) =>
          response.url() === base + "/api/aven/chat" &&
          response.request().method() === "POST",
      );
      await page.getByRole("button", { name: "Send", exact: true }).click();
      const response = await pending;
      await browserExpect(
        page.getByRole("button", { name: "Stop", exact: true }),
      ).toHaveCount(0);
      const request = response.request().postDataJSON();
      const rows = await db
        .select()
        .from(s.aiMessages)
        .where(eq(s.aiMessages.requestId, request.requestId));
      expect(
        rows.some(
          (row) =>
            row.role === "assistant" &&
            row.status === "complete" &&
            /Java/i.test(row.content),
        ),
      ).toBe(true);
      const audit = await db
        .select()
        .from(s.auditLogs)
        .where(eq(s.auditLogs.actorUserId, owner));
      expect(
        audit.some(
          (row) =>
            ["getUserGoals", "getGoalDetails", "getGoalProgress"].includes(
              String(row.metadata?.tool),
            ) && row.metadata?.outcome === "success",
        ),
      ).toBe(true);
      await page.screenshot({ path: ".audit-local/aven-proactive-reply.png" });
      await context.close();
    } finally {
      await browser.close();
    }
  }, 240000);
});
