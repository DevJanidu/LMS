import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  goalSchema,
  milestoneSchema,
  taskSchema,
} from "@/lib/goals/validation";
import type { GoalMutation } from "@/lib/goals/validation";
import { notificationPreferenceSchema } from "@/lib/aven/validation";
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
describe.skipIf(!enabled)(
  "Goals and Aven on disposable owned database fixtures",
  () => {
    let db: ReturnType<typeof import("@/lib/db").getDb>,
      s: typeof import("@/lib/db/schema"),
      service: typeof import("@/lib/goals/service"),
      proposals: typeof import("@/lib/aven/proposals");
    const a = crypto.randomUUID(),
      b = crypto.randomUUID(),
      subjectA = crypto.randomUUID(),
      subjectB = crypto.randomUUID(),
      session = crypto.randomUUID();
    const today = new Date().toISOString().slice(0, 10),
      future = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const value = goalSchema.parse({
      title: "Owned fixture goal",
      startDate: today,
      targetDate: future,
    });
    const create = async (owner = a, input = value) => {
      const id = crypto.randomUUID();
      await service.mutateGoal(owner, {
        operationId: crypto.randomUUID(),
        goalId: id,
        expectedVersion: 0,
        action: { kind: "goal", value: input },
      });
      return service.getGoalDetail(owner, id);
    };
    const change = async (id: string, action: GoalMutation["action"]) => {
      const detail = await service.getGoalDetail(a, id);
      await service.mutateGoal(a, {
        operationId: crypto.randomUUID(),
        goalId: id,
        expectedVersion: detail.goal.version,
        action,
      });
      return service.getGoalDetail(a, id);
    };
    beforeAll(async () => {
      process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
      process.env.DATABASE_URL_UNPOOLED = process.env.TEST_DATABASE_URL;
      db = (await import("@/lib/db")).getDb();
      s = await import("@/lib/db/schema");
      service = await import("@/lib/goals/service");
      proposals = await import("@/lib/aven/proposals");
      await db.insert(s.users).values([
        {
          id: a,
          name: "Goal fixture A",
          email: `${a}@example.com`,
          acceptedTermsAt: new Date(),
        },
        {
          id: b,
          name: "Goal fixture B",
          email: `${b}@example.com`,
          acceptedTermsAt: new Date(),
        },
      ]);
      await db.insert(s.subjects).values([
        { id: subjectA, userId: a, title: "Owned subject A" },
        { id: subjectB, userId: b, title: "Private subject B" },
      ]);
      await db.insert(s.studySessions).values({
        id: session,
        userId: a,
        subjectId: subjectA,
        source: "timer",
        status: "valid",
        startedAt: new Date(`${today}T08:00:00Z`),
        endedAt: new Date(`${today}T09:00:00Z`),
        durationSeconds: 3600,
      });
    });
    afterAll(async () => {
      if (db && s) {
        // This suite never calls a provider; its budget-only reservations have no billable usage.
        await db
          .delete(s.aiUsageRecords)
          .where(inArray(s.aiUsageRecords.userId, [a, b]));
        await db
          .delete(s.auditLogs)
          .where(inArray(s.auditLogs.actorUserId, [a, b]));
        await db.delete(s.users).where(inArray(s.users.id, [a, b]));
      }
    });
    it("creates, edits, lists and deletes goals without requiring OpenAI", async () => {
      const detail = await create();
      const edited = await change(detail.goal.id, {
        kind: "goal",
        value: { ...detail.goal, title: "Revised target", targetDate: future },
      });
      expect(edited.goal.title).toBe("Revised target");
      expect(
        (await service.listGoals(a, 1, "Revised")).details[0].goal.id,
      ).toBe(detail.goal.id);
      await change(detail.goal.id, { kind: "deleteGoal" }).catch((error) => {
        expect(error.message).toBe("recordUnavailable");
      });
      await expect(
        service.getGoalDetail(a, detail.goal.id),
      ).rejects.toMatchObject({ status: 404 });
    });
    it("rejects reading, attaching, updating or deleting another account's records", async () => {
      const other = await create(b);
      await expect(
        service.getGoalDetail(a, other.goal.id),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        service.mutateGoal(a, {
          operationId: crypto.randomUUID(),
          goalId: other.goal.id,
          expectedVersion: 1,
          action: { kind: "deleteGoal" },
        }),
      ).rejects.toMatchObject({ status: 404 });
      const own = await create();
      await expect(
        change(own.goal.id, {
          kind: "goal",
          value: { ...own.goal, subjectIds: [subjectB] },
        }),
      ).rejects.toMatchObject({ status: 404 });
    });
    it("performs milestone/task CRUD, validates dependencies and preserves tasks when a milestone is removed", async () => {
      const goal = await create(),
        milestone = crypto.randomUUID(),
        first = crypto.randomUUID(),
        second = crypto.randomUUID();
      await change(goal.goal.id, {
        kind: "milestone",
        id: milestone,
        value: milestoneSchema.parse({ title: "Foundation" }),
      });
      await change(goal.goal.id, {
        kind: "task",
        id: first,
        value: taskSchema.parse({
          title: "Prerequisite",
          milestoneId: milestone,
        }),
      });
      const detail = await change(goal.goal.id, {
        kind: "task",
        id: second,
        value: taskSchema.parse({ title: "Deploy", dependencyIds: [first] }),
      });
      expect(detail.progress.blockedIds).toContain(second);
      await expect(
        change(goal.goal.id, {
          kind: "task",
          id: second,
          value: {
            ...detail.tasks.find((t) => t.id === second)!,
            status: "completed",
          },
        }),
      ).rejects.toMatchObject({ message: "taskBlocked" });
      await expect(
        change(goal.goal.id, {
          kind: "task",
          id: first,
          value: {
            ...detail.tasks.find((t) => t.id === first)!,
            dependencyIds: [second],
          },
        }),
      ).rejects.toMatchObject({ message: "circularDependency" });
      const removed = await change(goal.goal.id, {
        kind: "deleteMilestone",
        id: milestone,
      });
      expect(removed.tasks.find((t) => t.id === first)?.milestoneId).toBeNull();
      await change(goal.goal.id, { kind: "deleteTask", id: first });
      const final = await change(goal.goal.id, {
        kind: "deleteTask",
        id: second,
      });
      expect(final.tasks).toHaveLength(0);
    }, 240000); // Multiple real network transactions; the normal per-test allowance remains unchanged.
    it("deduplicates retries and rejects conflicting concurrent versions", async () => {
      const goal = await create(),
        input: GoalMutation = {
          operationId: crypto.randomUUID(),
          goalId: goal.goal.id,
          expectedVersion: goal.goal.version,
          action: {
            kind: "task",
            id: crypto.randomUUID(),
            value: taskSchema.parse({ title: "Only once" }),
          },
        };
      const copies = await Promise.all([
        service.mutateGoal(a, input),
        service.mutateGoal(a, input),
      ]);
      expect(copies[0].version).toBe(copies[1].version);
      expect((await service.getGoalDetail(a, goal.goal.id)).tasks).toHaveLength(
        1,
      );
      const current = await service.getGoalDetail(a, goal.goal.id);
      const writes = await Promise.allSettled(
        ["one", "two"].map((title) =>
          service.mutateGoal(a, {
            operationId: crypto.randomUUID(),
            goalId: goal.goal.id,
            expectedVersion: current.goal.version,
            action: { kind: "goal", value: { ...current.goal, title } },
          }),
        ),
      );
      expect(writes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(writes.filter((r) => r.status === "rejected")).toHaveLength(1);
    });
    it("prevents double-counting and scales allocations after a verified session is shortened", async () => {
      const first = await create(a, { ...value, progressMode: "time" }),
        second = await create(a, { ...value, progressMode: "time" });
      const linked = await change(first.goal.id, {
        kind: "linkSession",
        sessionId: session,
        taskId: null,
        seconds: 2400,
      });
      expect(linked.progress.hours).toBeCloseTo(2 / 3);
      await expect(
        change(second.goal.id, {
          kind: "linkSession",
          sessionId: session,
          taskId: null,
          seconds: 1800,
        }),
      ).rejects.toMatchObject({ message: "sessionAlreadyAllocated" });
      await change(second.goal.id, {
        kind: "linkSession",
        sessionId: session,
        taskId: null,
        seconds: 1200,
      });
      await db
        .update(s.studySessions)
        .set({ durationSeconds: 1800 })
        .where(eq(s.studySessions.id, session));
      const hours =
        (await service.getGoalDetail(a, first.goal.id)).progress.hours +
        (await service.getGoalDetail(a, second.goal.id)).progress.hours;
      expect(hours).toBeCloseTo(0.5);
      await db
        .update(s.studySessions)
        .set({ status: "discarded" })
        .where(eq(s.studySessions.id, session));
      expect(
        (await service.getGoalDetail(a, first.goal.id)).progress.hours,
      ).toBe(0);
      await db
        .update(s.studySessions)
        .set({ durationSeconds: 3600, status: "valid" })
        .where(eq(s.studySessions.id, session));
    });
    it("recalculates activity progress after deletion and requires explicit outcome evidence", async () => {
      const goal = await create(a, { ...value, progressMode: "outcome" });
      await expect(
        change(goal.goal.id, {
          kind: "goal",
          value: { ...goal.goal, status: "completed" },
        }),
      ).rejects.toMatchObject({ message: "outcomeNotConfirmed" });
      const outcome = await change(goal.goal.id, {
        kind: "activity",
        taskId: null,
        type: "outcome",
        amount: 1,
        evidence: "User-confirmed offer",
        date: today,
      });
      expect(outcome.progress.percent).toBe(100);
      const completed = await change(goal.goal.id, {
        kind: "goal",
        value: { ...outcome.goal, status: "completed" },
      });
      expect(completed.progress.health).toBe("completed");
      const removed = await change(goal.goal.id, {
        kind: "deleteActivity",
        id: outcome.activity[0].id,
      });
      expect(removed.progress.percent).toBe(0);
      expect(removed.progress.health).toBe("needsAttention");
    });
    it("keeps AI proposals pending until approval and applies approval exactly once", async () => {
      const goal = await create(),
        plan = await proposals.storeProposal(a, null, {
          kind: "taskCreate",
          goalId: goal.goal.id,
          expectedVersion: goal.goal.version,
          value: taskSchema.parse({ title: "Approved task" }),
        });
      expect((await service.getGoalDetail(a, goal.goal.id)).tasks).toHaveLength(
        0,
      );
      await expect(
        proposals.resolveProposal(b, plan.id, "approve"),
      ).rejects.toMatchObject({ status: 404 });
      const results = await Promise.all([
        proposals.resolveProposal(a, plan.id, "approve"),
        proposals.resolveProposal(a, plan.id, "approve"),
      ]);
      expect(results.every((r) => r.status === "approved")).toBe(true);
      const audit = await db
        .select()
        .from(s.auditLogs)
        .where(
          and(
            eq(s.auditLogs.actorUserId, a),
            eq(s.auditLogs.targetId, plan.id),
          ),
        );
      expect(audit).toHaveLength(1);
      expect(audit[0].action).toBe("aven.proposal.approve");
      expect((await service.getGoalDetail(a, goal.goal.id)).tasks).toHaveLength(
        1,
      );
    });
    it("rolls back an entire goal plan if a later task references another user's subject", async () => {
      const goal = await create(),
        plan = await proposals.storeProposal(a, null, {
          kind: "goalPlan",
          goalId: goal.goal.id,
          expectedVersion: goal.goal.version,
          explanation: "Review before applying",
          goal: { ...goal.goal, title: "Must not persist" },
          milestones: [
            {
              key: "m",
              dependencyKeys: [],
              value: milestoneSchema.parse({ title: "Rollback milestone" }),
            },
          ],
          tasks: [
            {
              key: "t",
              milestoneKey: "m",
              dependencyKeys: [],
              value: taskSchema.parse({
                title: "Forbidden subject",
                subjectId: subjectB,
              }),
            },
          ],
        });
      await expect(
        proposals.resolveProposal(a, plan.id, "approve"),
      ).rejects.toMatchObject({ status: 404 });
      const unchanged = await service.getGoalDetail(a, goal.goal.id);
      expect(unchanged.goal.title).toBe(goal.goal.title);
      expect(unchanged.goal.version).toBe(goal.goal.version);
      expect(unchanged.milestones).toHaveLength(0);
    });
    it("persists conversations separately and denies cross-user conversation access", async () => {
      const conversations = await import("@/lib/aven/conversations");
      const conversation = await conversations.beginConversationTurn(
        a,
        null,
        null,
        crypto.randomUUID(),
        "Private fixture message",
      );
      expect(
        (await conversations.getConversation(a, conversation.id)).messages[0]
          .content,
      ).toBe("Private fixture message");
      await expect(
        conversations.getConversation(b, conversation.id),
      ).rejects.toMatchObject({ status: 404 });
      await conversations.finishConversationTurn(
        a,
        conversation.id,
        (
          await db
            .select()
            .from(s.aiConversations)
            .where(eq(s.aiConversations.id, conversation.id))
        )[0].activeRequestId!,
        "Reply",
        "complete",
      );
      await db.insert(s.aiMessages).values(
        Array.from({ length: 101 }, (_, index) => ({
          conversationId: conversation.id,
          requestId: crypto.randomUUID(),
          role: "user",
          content: `Message ${index}`,
          createdAt: new Date(Date.now() + index * 1000),
        })),
      );
      const newest = await conversations.getConversation(a, conversation.id);
      expect(newest.messages).toHaveLength(100);
      expect(newest.hasOlder).toBe(true);
      const older = await conversations.getConversation(
        a,
        conversation.id,
        newest.messages[0].id,
      );
      expect(older.messages).toHaveLength(3);
      expect(older.hasOlder).toBe(false);
      const preferences = await import("@/lib/aven/preferences");
      await preferences.changeAvenPreferences(a, {
        kind: "summary",
        id: conversation.id,
        content: "Corrected preference",
      });
      expect(
        (await conversations.getConversation(a, conversation.id)).conversation
          .summary,
      ).toBe("Corrected preference");
      await expect(
        preferences.changeAvenPreferences(b, {
          kind: "summary",
          id: conversation.id,
          content: "Forbidden",
        }),
      ).rejects.toMatchObject({ status: 404 });
    });
    it("creates a simple AI goal only after approval and supports manual completion and reopening", async () => {
      const { executeAvenTool } = await import("@/lib/aven/tools");
      const conversation = await db
        .insert(s.aiConversations)
        .values({ userId: a, title: "Simple goal fixture" })
        .returning();
      const proposal = (await executeAvenTool(
        a,
        conversation[0].id,
        "proposeGoal",
        { title: "Learn Spring Boot", targetDate: future, goalId: null },
      )) as {
        id: string;
        value: { goal: { title: string }; tasks: unknown[] };
      };
      expect(proposal.value.tasks).toHaveLength(0);
      const saved = await proposals.resolveProposal(a, proposal.id, "approve");
      const id = saved.result?.goalId;
      if (!id) throw new Error("Goal approval did not return an ID");
      let detail = await service.getGoalDetail(a, id);
      expect(detail.goal.title).toBe("Learn Spring Boot");
      expect(detail.goal.targetDate).toBe(future);
      expect(detail.tasks).toHaveLength(0);
      detail = await change(id, { kind: "completion", completed: true });
      expect(detail.goal.status).toBe("completed");
      expect(detail.progress.outcomeConfirmed).toBe(true);
      expect(detail.progress.percent).toBe(100);
      detail = await change(id, { kind: "completion", completed: false });
      expect(detail.goal.status).toBe("active");
      expect(detail.progress.outcomeConfirmed).toBe(false);
      expect(detail.progress.percent).toBe(0);
      await expect(
        service.mutateGoal(b, {
          operationId: crypto.randomUUID(),
          goalId: id,
          expectedVersion: detail.goal.version,
          action: { kind: "completion", completed: true },
        }),
      ).rejects.toMatchObject({ status: 404 });
    });
    it("enforces the shared monthly budget across concurrent learners", async () => {
      const { reserveUsage } = await import("@/lib/aven/usage");
      const { avenConfig, MAX_OUTPUT_TOKENS } =
        await import("@/lib/aven/config");
      const config = avenConfig(false);
      const global = await db.execute<{ cost: number }>(
        sql`SELECT coalesce(sum(cost_micros),0)::bigint AS cost FROM ai_usage_records WHERE day>=date_trunc('month',now())::date`,
      );
      const cost = Math.ceil(
        10 * config.inputPrice + MAX_OUTPUT_TOKENS * config.outputPrice,
      );
      const previous = process.env.AVEN_GLOBAL_MONTHLY_BUDGET_USD;
      process.env.AVEN_GLOBAL_MONTHLY_BUDGET_USD = String(
        (Number(global.rows[0].cost) + cost + 1) / 1e6,
      );
      try {
        const results = await Promise.allSettled([
          reserveUsage(a, crypto.randomUUID(), false, 0, 10),
          reserveUsage(b, crypto.randomUUID(), false, 0, 10),
        ]);
        expect(
          results.filter((result) => result.status === "fulfilled"),
        ).toHaveLength(1);
        const rejected = results.find(
          (result) => result.status === "rejected",
        ) as PromiseRejectedResult;
        expect(rejected.reason.message).toBe("workspaceUsageLimit");
      } finally {
        if (previous === undefined)
          delete process.env.AVEN_GLOBAL_MONTHLY_BUDGET_USD;
        else process.env.AVEN_GLOBAL_MONTHLY_BUDGET_USD = previous;
      }
    });
    it("enables supportive check-ins and deduplicates goal deadline reminders", async () => {
      const { changeAvenPreferences } = await import("@/lib/aven/preferences");
      const { processAvenUser } = await import("@/lib/aven/scheduler");
      const goal = await create();
      await db
        .update(s.goals)
        .set({ targetDate: today, reminders: true, status: "active" })
        .where(eq(s.goals.id, goal.goal.id));
      const preferences = await changeAvenPreferences(a, {
        kind: "enableReminders",
      });
      expect(preferences.notifications).toMatchObject({
        enabled: true,
        inApp: true,
        morning: true,
        randomized: true,
        evening: true,
        weekly: true,
        goalReminders: true,
      });
      const now = Date.parse(`${today}T07:05:00Z`);
      await Promise.all([processAvenUser(a, now), processAvenUser(a, now)]);
      const records = await db
        .select()
        .from(s.notifications)
        .where(
          and(
            eq(s.notifications.userId, a),
            eq(
              s.notifications.deduplicationKey,
              `aven:goalDeadline:${goal.goal.id}:${today}`,
            ),
          ),
        );
      expect(records).toHaveLength(1);
    });
    it("delivers one missed-start notification under overlapping worker executions", async () => {
      const { processAvenUser } = await import("@/lib/aven/scheduler"),
        blockId = crypto.randomUUID(),
        now = Date.parse(`${today}T10:12:00Z`);
      await db
        .insert(s.notificationPreferences)
        .values({
          userId: a,
          value: notificationPreferenceSchema.parse({
            enabled: true,
            quietStart: "00:00",
            quietEnd: "00:00",
            sessionReminders: false,
            morning: false,
            evening: false,
            randomized: false,
            weekly: false,
          }),
        })
        .onConflictDoUpdate({
          target: s.notificationPreferences.userId,
          set: {
            value: notificationPreferenceSchema.parse({
              enabled: true,
              quietStart: "00:00",
              quietEnd: "00:00",
              sessionReminders: false,
            }),
          },
        });
      await db.insert(s.scheduleBlocks).values({
        id: blockId,
        userId: a,
        subjectId: subjectA,
        title: "Missed fixture",
        startsAt: new Date(`${today}T10:00:00Z`),
        endsAt: new Date(`${today}T11:30:00Z`),
        timezone: "UTC",
      });
      await Promise.all([processAvenUser(a, now), processAvenUser(a, now)]);
      const rows = await db
        .select()
        .from(s.notifications)
        .where(
          and(
            eq(s.notifications.userId, a),
            eq(
              s.notifications.deduplicationKey,
              `aven:missed:${blockId}:${today}:${today}T10:00:00.000Z`,
            ),
          ),
        );
      expect(rows).toHaveLength(1);
      await processAvenUser(a, now);
      expect(
        await db
          .select()
          .from(s.notifications)
          .where(
            eq(
              s.notifications.deduplicationKey,
              `aven:missed:${blockId}:${today}:${today}T10:00:00.000Z`,
            ),
          ),
      ).toHaveLength(1);
    });
  },
);
