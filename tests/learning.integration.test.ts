import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import {
  aiPreferenceSchema,
  notificationPreferenceSchema,
} from "@/lib/aven/validation";
vi.mock("next-intl/server", () => ({
  getTranslations:
    async () => (key: string, values?: Record<string, unknown>) =>
      `${key}: ${JSON.stringify(values ?? {})}`,
}));
vi.mock("@/i18n/navigation", () => ({
  redirect: () => {
    throw new Error("Unexpected fixture redirect");
  },
}));
const enabled =
  Boolean(process.env.TEST_DATABASE_URL) &&
  (process.env.TEST_DATABASE_ISOLATED === "true" ||
    process.env.TEST_DATABASE_FIXTURES_ONLY === "true");
if (enabled) vi.setConfig({ testTimeout: 120000, hookTimeout: 60000 });
const clock = (time: number) => new Date(time).toISOString().slice(11, 16);
describe.skipIf(!enabled)(
  "Learning intelligence on disposable owned database fixtures",
  () => {
    let db: ReturnType<typeof import("@/lib/db").getDb>,
      s: typeof import("@/lib/db/schema");
    const owner = crypto.randomUUID(),
      other = crypto.randomUUID(),
      subject = crypto.randomUUID(),
      topics = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()],
      reportedAt = new Date(Date.now() - 86400000).toISOString();
    beforeAll(async () => {
      process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
      process.env.DATABASE_URL_UNPOOLED = process.env.TEST_DATABASE_URL;
      db = (await import("@/lib/db")).getDb();
      s = await import("@/lib/db/schema");
      await db.insert(s.users).values([
        { id: owner, name: "Learning fixture", email: `${owner}@example.com`, acceptedTermsAt: new Date(), timezone: "UTC" },
        { id: other, name: "Other fixture", email: `${other}@example.com`, acceptedTermsAt: new Date(), timezone: "UTC" },
      ]);
      await db.insert(s.subjects).values({ id: subject, userId: owner, title: "Advanced Java" });
      await db.insert(s.topics).values(
        topics.map((id, index) => ({
          id,
          subjectId: subject,
          title: ["Collections", "Concurrency", "JVM internals"][index],
          sortOrder: index,
          status: index === 0 ? ("completed" as const) : ("not_started" as const),
          completedAt: index === 0 ? new Date(Date.now() - 5 * 86400000) : null,
        })),
      );
      await db.insert(s.aiUserPreferences).values({
        userId: owner,
        value: aiPreferenceSchema.parse({
          consent: true,
          onboardingComplete: true,
          preferredStudyStart: "06:00",
          preferredStudyEnd: "23:00",
          dailyTargetMinutes: 180,
          studyDays: [0, 1, 2, 3, 4, 5, 6],
          learningSignals: [
            { subjectId: subject, topicId: topics[1], level: "needsPractice", source: "chat", at: reportedAt },
          ],
        }),
      });
      const now = Date.now();
      await db.insert(s.notificationPreferences).values({
        userId: owner,
        value: notificationPreferenceSchema.parse({
          enabled: true,
          inApp: true,
          email: true,
          goalReminders: true,
          sessionReminders: false,
          missedSessions: false,
          morning: false,
          evening: false,
          weekly: false,
          randomized: false,
          // Learning alerts are due 150 minutes after the morning time; place that one minute ago.
          morningTime: clock(now - 151 * 60000),
          quietStart: "00:00",
          quietEnd: "00:00",
          dailyLimit: 10,
        }),
      });
    });
    afterAll(async () => {
      if (db && s) {
        await db.delete(s.auditLogs).where(inArray(s.auditLogs.actorUserId, [owner, other]));
        await db.delete(s.users).where(inArray(s.users.id, [owner, other]));
      }
    });
    it("audits coverage from records and keeps other accounts out", async () => {
      const learning = await import("@/lib/learning/server");
      const { audit, attention } = await learning.loadTopicCoverage(owner, subject);
      expect(audit.counts).toMatchObject({ required: 3, completed: 1, remaining: 2, neverScheduled: 2 });
      expect(audit.mastery.measured).toBe(false);
      expect(attention.topics[topics[1]]).toBe("needsPractice");
      await expect(learning.loadTopicCoverage(other, subject)).rejects.toThrow();
      await expect(learning.resolveOwnedSubject(other, null, "Advanced Java")).rejects.toThrow();
    });
    it("Test 5: announces reported difficulty once, with an email delivery queued and a private draft", async () => {
      const { processAvenUser } = await import("@/lib/aven/scheduler");
      const now = Date.now();
      expect(await processAvenUser(owner, now)).toBe(1);
      expect(await processAvenUser(owner, now + 60000)).toBe(0);
      const rows = await db.select().from(s.notifications).where(eq(s.notifications.userId, owner));
      expect(rows).toHaveLength(1);
      expect(rows[0].deduplicationKey).toBe(`aven:learningAlert:difficulty:${subject}:${reportedAt}`);
      const deliveries = await db
        .select()
        .from(s.notificationDeliveries)
        .where(eq(s.notificationDeliveries.notificationId, rows[0].id));
      expect(deliveries.map((row) => [row.channel, row.status]).sort()).toEqual([
        ["email", "pending"],
        ["inApp", "delivered"],
      ]);
      const drafts = await db
        .select()
        .from(s.aiPlanProposals)
        .where(and(eq(s.aiPlanProposals.userId, owner), eq(s.aiPlanProposals.status, "pending")));
      expect(drafts).toHaveLength(1);
      expect(drafts[0].value).toMatchObject({ kind: "schedule", recommendationKey: `practice:${subject}` });
    });
    it("Test 6: declining changes nothing and quiets the recommendation", async () => {
      const { resolveProposal } = await import("@/lib/aven/proposals");
      const learning = await import("@/lib/learning/server");
      const [draft] = await db
        .select()
        .from(s.aiPlanProposals)
        .where(and(eq(s.aiPlanProposals.userId, owner), eq(s.aiPlanProposals.status, "pending")));
      expect((await resolveProposal(owner, draft.id, "reject")).status).toBe("rejected");
      expect(await db.select().from(s.scheduleBlocks).where(eq(s.scheduleBlocks.userId, owner))).toHaveLength(0);
      expect(await learning.recentlyDeclined(owner, `practice:${subject}`)).toBe(true);
    });
    it("Test 1: an approved practice plan persists without conflicts", async () => {
      const learning = await import("@/lib/learning/server");
      const { storeProposal, resolveProposal } = await import("@/lib/aven/proposals");
      const { plan } = await learning.planSubjectPractice(owner, subject, { sessions: 2, minutes: 45, horizonDays: 7 });
      expect(plan.sessions.length).toBe(2);
      expect(plan.sessions[0].topicId).toBe(topics[1]);
      const stored = await storeProposal(owner, null, {
        kind: "schedule",
        goalId: null,
        expectedVersion: 0,
        recommendationKey: `practice:${subject}`,
        explanation: "Extra practice",
        sessions: plan.sessions.map((item) => ({
          title: `Practice: ${item.topicTitle}`,
          taskId: null,
          subjectId: subject,
          topicId: item.topicId,
          startsAt: item.startsAt,
          endsAt: item.endsAt,
        })),
      });
      const result = await resolveProposal(owner, stored.id, "approve");
      expect(result.status).toBe("approved");
      const blocks = await db.select().from(s.scheduleBlocks).where(eq(s.scheduleBlocks.userId, owner));
      expect(blocks.map((block) => block.id).sort()).toEqual([...(result.result?.blockIds ?? [])].sort());
      expect(blocks.every((block) => block.subjectId === subject)).toBe(true);
      // The next audit sees the new coverage.
      const { audit } = await learning.loadTopicCoverage(owner, subject);
      expect(audit.counts.neverScheduled).toBeLessThan(2);
    });
    it("Test 8: a confident check-in replaces the earlier report", async () => {
      const learning = await import("@/lib/learning/server");
      await db.transaction((tx) =>
        learning.saveLearningSignal(tx, owner, { subjectId: subject, topicId: topics[1], level: "confident", source: "checkIn" }),
      );
      const { attention } = await learning.loadTopicCoverage(owner, subject);
      expect(attention.topics[topics[1]]).toBe("confident");
      await expect(
        db.transaction((tx) =>
          learning.saveLearningSignal(tx, other, { subjectId: subject, topicId: null, level: "confident", source: "checkIn" }),
        ),
      ).rejects.toThrow();
    });
  },
);
