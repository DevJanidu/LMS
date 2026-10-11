import { describe, expect, it } from "vitest";
import {
  goalSchema,
  taskSchema,
  milestoneSchema,
} from "@/lib/goals/validation";
import {
  assertAcyclic,
  calculateGoalProgress,
  hierarchyDependencies,
  type GoalRecord,
  type GoalTask,
  type GoalMilestone,
  type GoalSessionLink,
} from "@/lib/goals/model";
const uuid = (value: number) =>
  `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const base: GoalRecord = {
  ...goalSchema.parse({
    title: "Career readiness",
    startDate: "2026-10-01",
    targetDate: "2026-10-31",
  }),
  id: uuid(1),
  userId: uuid(2),
  version: 1,
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-10T00:00:00Z",
};
const task = (id: number, fields: Partial<GoalTask> = {}): GoalTask => ({
  ...taskSchema.parse({ title: `Task ${id}` }),
  id: uuid(id),
  goalId: base.id,
  actualSeconds: 0,
  completedAt: null,
  updatedAt: base.updatedAt,
  ...fields,
});
const milestone = (id: number, weight: number): GoalMilestone => ({
  ...milestoneSchema.parse({ title: `Milestone ${id}`, weight }),
  id: uuid(id),
  goalId: base.id,
});
const session = (id: number, seconds: number): GoalSessionLink => ({
  id: uuid(id),
  sessionId: uuid(id),
  taskId: null,
  allocatedSeconds: seconds,
  startedAt: "2026-10-10T10:00:00Z",
  subjectId: uuid(99),
  title: "Study",
});
const progress = (
  goal = base,
  tasks: GoalTask[] = [],
  milestones: GoalMilestone[] = [],
  activity: Parameters<typeof calculateGoalProgress>[3] = [],
  sessions: GoalSessionLink[] = [],
  today = "2026-10-11",
) => calculateGoalProgress(goal, tasks, milestones, activity, sessions, today);
describe("goal progress and dependencies", () => {
  it("measures weighted milestone work rather than counting milestones equally", () => {
    const a = milestone(10, 40),
      b = milestone(11, 30),
      c = milestone(12, 30);
    expect(
      progress(
        base,
        [
          task(20, { status: "completed", milestoneId: a.id }),
          task(21, { milestoneId: b.id }),
          task(22, { milestoneId: c.id }),
        ],
        [a, b, c],
      ).percent,
    ).toBe(40);
  });
  it("uses allocated verified study hours and never counts duplicate session rows", () => {
    const goal = { ...base, progressMode: "time" as const };
    expect(
      progress(
        goal,
        [],
        [],
        [],
        [session(30, 50 * 3600), session(30, 50 * 3600)],
      ).percent,
    ).toBe(50);
    expect(progress(goal, [], [], [], [session(30, 99.9 * 3600)]).percent).toBe(
      99,
    );
  });
  it("separates preparation completion from externally controlled outcomes", () => {
    const goal = { ...base, progressMode: "outcome" as const };
    expect(progress(goal, [task(20, { status: "completed" })]).percent).toBe(
      99,
    );
    expect(
      progress(
        goal,
        [],
        [],
        [
          {
            id: uuid(30),
            type: "outcome",
            amount: 1,
            date: "2026-10-11",
            evidence: "Offer received",
            taskId: null,
          },
        ],
      ).percent,
    ).toBe(100);
  });
  it("recalculates quantity and hybrid progress after an activity is removed", () => {
    const quantity = { ...base, progressMode: "quantity" as const };
    const activity = [
      {
        id: uuid(30),
        type: "quantity",
        amount: 10,
        date: "2026-10-11",
        evidence: "Applications confirmed",
        taskId: null,
      },
    ];
    expect(progress(quantity, [], [], activity).percent).toBe(50);
    expect(progress(quantity).percent).toBe(0);
    const hybrid = {
      ...base,
      progressMode: "hybrid" as const,
      progressConfig: {
        ...base.progressConfig,
        taskWeight: 1,
        quantityWeight: 1,
      },
    };
    expect(
      progress(hybrid, [task(20, { status: "completed" })], [], activity)
        .percent,
    ).toBe(75);
  });
  it("excludes blocked work and restores blocking when a prerequisite is reopened", () => {
    const prerequisite = task(20),
      child = task(21, {
        status: "completed",
        dependencyIds: [prerequisite.id],
      });
    expect(progress(base, [prerequisite, child]).blockedIds).toContain(
      child.id,
    );
    expect(progress(base, [prerequisite, child]).percent).toBe(0);
    expect(
      progress(base, [{ ...prerequisite, status: "completed" }, child]).percent,
    ).toBe(100);
  });
  it("rejects task, milestone and combined hierarchy cycles", () => {
    expect(() =>
      assertAcyclic([
        { id: "a", dependencyIds: ["b"] },
        { id: "b", dependencyIds: ["a"] },
      ]),
    ).toThrow("circularDependency");
    expect(() =>
      assertAcyclic([{ id: "a", dependencyIds: ["missing"] }]),
    ).toThrow("invalidDependency");
    expect(() =>
      assertAcyclic(
        hierarchyDependencies(
          [
            { id: "t1", milestoneId: "m1", dependencyIds: ["t2"] },
            { id: "t2", milestoneId: "m2", dependencyIds: [] },
          ],
          [
            { id: "m1", dependencyIds: [] },
            { id: "m2", dependencyIds: ["m1"] },
          ],
        ),
      ),
    ).toThrow("circularDependency");
  });
  it("treats an overdue target as recoverable and uses actual elapsed time for health", () => {
    expect(progress(base, [], [], [], [], "2026-11-01").health).toBe("overdue");
    expect(
      progress({ ...base, targetDate: "2026-12-31" }, [
        task(20, { manualProgress: 25 }),
      ]).health,
    ).toBe("onTrack");
    expect(progress(base, [], [], [], [], "2026-10-30").health).toBe("atRisk");
  });
  it("validates date ranges and explicit hybrid metric weights", () => {
    expect(
      goalSchema.safeParse({ ...base, targetDate: "2026-09-01" }).success,
    ).toBe(false);
    expect(
      goalSchema.safeParse({
        ...base,
        progressMode: "hybrid",
        progressConfig: { ...base.progressConfig, taskWeight: 0 },
      }).success,
    ).toBe(false);
  });
});
