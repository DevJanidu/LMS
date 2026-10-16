import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
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
describe.skipIf(!enabled)("Aven workspace actions on disposable owned database fixtures", () => {
  let db: ReturnType<typeof import("@/lib/db").getDb>,
    s: typeof import("@/lib/db/schema"),
    actions: typeof import("@/lib/aven/workspace-actions"),
    proposals: typeof import("@/lib/aven/proposals");
  const owner = crypto.randomUUID(),
    other = crypto.randomUUID(),
    subject = crypto.randomUUID(),
    otherSubject = crypto.randomUUID(),
    goal = crypto.randomUUID(),
    task = crypto.randomUUID();
  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.DATABASE_URL_UNPOOLED = process.env.TEST_DATABASE_URL;
    db = (await import("@/lib/db")).getDb();
    s = await import("@/lib/db/schema");
    actions = await import("@/lib/aven/workspace-actions");
    proposals = await import("@/lib/aven/proposals");
    const service = await import("@/lib/goals/service");
    const { goalSchema, taskSchema } = await import("@/lib/goals/validation");
    await db.insert(s.users).values([
      { id: owner, name: "Workspace fixture", email: `${owner}@example.com`, acceptedTermsAt: new Date() },
      { id: other, name: "Other fixture", email: `${other}@example.com`, acceptedTermsAt: new Date() },
    ]);
    await db.insert(s.subjects).values([
      { id: subject, userId: owner, title: "Advanced Java" },
      { id: otherSubject, userId: other, title: "Private" },
    ]);
    await service.mutateGoal(owner, {
      operationId: crypto.randomUUID(), goalId: goal, expectedVersion: 0,
      action: { kind: "goal", value: goalSchema.parse({ title: "Backend developer", startDate: "2026-10-01", targetDate: "2027-03-01" }) },
    });
    const detail = await service.getGoalDetail(owner, goal);
    await service.mutateGoal(owner, {
      operationId: crypto.randomUUID(), goalId: goal, expectedVersion: detail.goal.version,
      action: { kind: "task", id: task, value: taskSchema.parse({ title: "Joins", dueDate: "2026-10-20" }) },
    });
  });
  afterAll(async () => {
    if (db && s) {
      await db.delete(s.auditLogs).where(inArray(s.auditLogs.actorUserId, [owner, other]));
      await db.delete(s.users).where(inArray(s.users.id, [owner, other]));
    }
  });
  const store = (value: unknown) => proposals.storeProposal(owner, null, value);
  it("creates topics through the workspace service, once, even under concurrent approval", async () => {
    const value = await actions.topicProposal(owner, {
      explanation: "Add topics",
      changes: [
        { action: "create", topicId: null, subjectId: subject, subjectName: null, title: "Streams", targetDate: null },
        { action: "create", topicId: null, subjectId: subject, subjectName: null, title: "Records", targetDate: null },
      ],
    });
    const stored = await store(value);
    const results = await Promise.allSettled([
      proposals.resolveProposal(owner, stored.id, "approve"),
      proposals.resolveProposal(owner, stored.id, "approve"),
    ]);
    expect(results.some((r) => r.status === "fulfilled" && r.value.status === "approved")).toBe(true);
    const topics = await db.select().from(s.topics).where(eq(s.topics.subjectId, subject));
    expect(topics.map((t) => t.title).sort()).toEqual(["Records", "Streams"]);
    // A replayed approval returns the stored outcome without applying again.
    expect((await proposals.resolveProposal(owner, stored.id, "approve")).status).toBe("approved");
    expect(await db.select().from(s.topics).where(eq(s.topics.subjectId, subject))).toHaveLength(2);
  });
  it("detects a record changed after the proposal and leaves it pending", async () => {
    const value = await actions.subjectProposal(owner, {
      explanation: "Rename",
      changes: [{ action: "update", subjectId: subject, title: "Java II", description: null, targetDate: null }],
    });
    const stored = await store(value);
    await db.update(s.subjects).set({ title: "Changed elsewhere", updatedAt: new Date(Date.now() + 1000) }).where(eq(s.subjects.id, subject));
    await expect(proposals.resolveProposal(owner, stored.id, "approve")).rejects.toThrow("conflict");
    const [row] = await db.select().from(s.aiPlanProposals).where(eq(s.aiPlanProposals.id, stored.id));
    expect(row.status).toBe("pending");
    const [current] = await db.select().from(s.subjects).where(eq(s.subjects.id, subject));
    expect(current.title).toBe("Changed elsewhere");
  });
  it("requires the explicit second confirmation before deleting a goal", async () => {
    const value = await actions.goalChangesProposal(owner, {
      goalId: goal, explanation: "Remove",
      changes: [{ action: "deleteGoal", id: null, title: null, dueDate: null, priority: null, order: null }],
    });
    const stored = await store(value);
    await expect(proposals.resolveProposal(owner, stored.id, "approve")).rejects.toThrow("confirmationRequired");
    expect(await db.select().from(s.goals).where(eq(s.goals.id, goal))).toHaveLength(1);
    // Completing a task first proves goal item changes persist.
    const complete = await store(
      await actions.goalChangesProposal(owner, {
        goalId: goal, explanation: "Done",
        changes: [{ action: "completeTask", id: task, title: null, dueDate: null, priority: null, order: null }],
      }),
    );
    expect((await proposals.resolveProposal(owner, complete.id, "approve")).status).toBe("approved");
    const [saved] = await db.select().from(s.goalTasks).where(eq(s.goalTasks.id, task));
    expect(saved.status).toBe("completed");
    // The earlier deletion proposal now carries a stale version and fails safely.
    await expect(
      proposals.resolveProposal(owner, stored.id, "approve", { confirmHighImpact: true }),
    ).rejects.toThrow();
    const fresh = await store(
      await actions.goalChangesProposal(owner, {
        goalId: goal, explanation: "Remove",
        changes: [{ action: "deleteGoal", id: null, title: null, dueDate: null, priority: null, order: null }],
      }),
    );
    expect((await proposals.resolveProposal(owner, fresh.id, "approve", { confirmHighImpact: true })).status).toBe("approved");
    expect(await db.select().from(s.goals).where(eq(s.goals.id, goal))).toHaveLength(0);
  });
  it("refuses another account's records at proposal time", async () => {
    await expect(
      actions.subjectProposal(owner, {
        explanation: "x",
        changes: [{ action: "delete", subjectId: otherSubject, title: null, description: null, targetDate: null }],
      }),
    ).rejects.toThrow("recordUnavailable");
    expect(await db.select().from(s.subjects).where(eq(s.subjects.id, otherSubject))).toHaveLength(1);
  });
  it("cancels a pending reminder and refuses a stale cancellation", async () => {
    const [reminder] = await db
      .insert(s.scheduledCheckIns)
      .values({ userId: owner, kind: "manual", deduplicationKey: `manual:${crypto.randomUUID()}`, dueAt: new Date(Date.now() + 86400000), value: { title: "Review" } })
      .returning();
    const stored = await store({ kind: "cancelReminders", explanation: "x", reminders: [{ id: reminder.id, title: "Review" }] });
    expect((await proposals.resolveProposal(owner, stored.id, "approve")).status).toBe("approved");
    const [row] = await db.select().from(s.scheduledCheckIns).where(and(eq(s.scheduledCheckIns.id, reminder.id)));
    expect(row.status).toBe("cancelled");
    const again = await store({ kind: "cancelReminders", explanation: "x", reminders: [{ id: reminder.id, title: "Review" }] });
    await expect(proposals.resolveProposal(owner, again.id, "approve")).rejects.toThrow("conflict");
  });
});
