import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/services/lists", () => ({ getScheduleBlocksInRange: vi.fn() }));
vi.mock("@/lib/services/calendar", () => ({
  getCalendarBlock: vi.fn(),
  mutateCalendar: vi.fn(),
}));
vi.mock("@/lib/goals/service", () => ({
  GoalError: class GoalError extends Error {},
}));
import { createTranslator } from "next-intl";
import en from "@/messages/en.json";
import { classifyIntent, intentGuidance } from "@/lib/aven/intent";
import {
  availableMinutes,
  buildGoalHierarchy,
  findDuplicateGoals,
  goalHierarchyInputSchema,
  matchSubject,
  type GoalHierarchyInput,
} from "@/lib/aven/decomposition";
import { proposalSchema } from "@/lib/aven/validation";
import { rankNextActions } from "@/lib/goals/next-action";
import { overlappingOccurrences } from "@/lib/aven/calendar-actions";
import {
  applyCalendarCommand,
  calendarOccurrences,
} from "@/lib/calendar/model";
import type { GoalDetail } from "@/lib/goals/model";
import type { ScheduleBlock } from "@/types";
const translate = createTranslator({
  locale: "en",
  messages: en,
  namespace: "aven.decomposition",
});
const javaRequest =
  "I want to find a Java backend or DevOps job within three months. First, I need to complete Core Java and Advanced Java. Then Spring Boot, Microservices, Docker, and DevOps.";
describe("intent classification", () => {
  it("recognizes a multi-part career goal and routes it to the planning model", () => {
    const intent = classifyIntent(javaRequest);
    expect(intent.intents).toContain("goal");
    expect(intent.multiPart).toBe(true);
    expect(intent.planning).toBe(true);
    expect(intentGuidance(intent)).toContain("proposeGoalHierarchy");
  });
  it("separates scheduling, rescheduling and next-action requests", () => {
    expect(
      classifyIntent("Add Java every day from 7 PM to 9 PM for the whole month")
        .intents,
    ).toContain("schedule");
    const move = classifyIntent("Move tomorrow's Java session to 9:30");
    expect(move.intents).toEqual(["reschedule"]);
    expect(intentGuidance(move)).toContain("Never change a whole series");
    expect(classifyIntent("What should I work on next?").intents).toEqual([
      "nextAction",
    ]);
    expect(classifyIntent("Thanks!").intents).toEqual([]);
  });
});
const milestone = (
  title: string,
  hours: number,
  dependsOn: number[],
  subjectName: string | null = null,
) => ({
  title,
  description: "",
  successCriteria: `Can apply ${title}`,
  estimatedHours: hours,
  dueDate: null,
  dependsOn,
  subjectName,
  tasks: [
    {
      title: `Study ${title}`,
      description: "",
      estimatedMinutes: 120,
      dueDate: null,
      dependsOnPrevious: false,
    },
    {
      title: `Build a ${title} exercise`,
      description: "",
      estimatedMinutes: 180,
      dueDate: null,
      dependsOnPrevious: true,
    },
  ],
});
const hierarchy: GoalHierarchyInput = goalHierarchyInputSchema.parse({
  goalId: null,
  title: "Get a Java backend or DevOps job",
  description: "Three-month career plan",
  category: "career",
  targetDate: "2027-01-12",
  successCriteria: "Receive a backend or DevOps offer",
  assumptions: ["Applications start after the portfolio is ready"],
  allowDuplicate: false,
  milestones: [
    milestone("Core Java", 40, [], "java"),
    milestone("Advanced Java", 40, [1], "Java"),
    milestone("Spring Boot", 30, [2]),
    milestone("Microservices", 30, [3]),
    milestone("DevOps", 30, [4]),
    milestone("Portfolio and applications", 20, [3, 5]),
  ],
});
const context = {
  today: "2026-10-12",
  subjects: [
    { id: "8d0f7c56-8a51-4a9e-9a6f-2a1f5d1a7c11", title: "Java" },
    { id: "0c6c1b9e-6a8d-4a8f-9a5c-0d3f1e2b4c5d", title: "Mathematics" },
  ],
  dailyTargetMinutes: 90,
  studyDays: [1, 2, 3, 4, 5],
  recentWeeklyMinutes: 300,
  expectedVersion: 0,
  translate: (key: string, values?: Record<string, string | number>) =>
    translate(key as "suggested", values as never),
};
describe("goal decomposition", () => {
  it("extracts a primary goal with ordered milestones, dependencies, tasks and deadlines", () => {
    const { proposal, summary } = buildGoalHierarchy(hierarchy, context);
    expect(proposalSchema.safeParse(proposal).success).toBe(true);
    expect(proposal.milestones.map((m) => m.value.title)).toEqual([
      "Core Java",
      "Advanced Java",
      "Spring Boot",
      "Microservices",
      "DevOps",
      "Portfolio and applications",
    ]);
    expect(proposal.milestones[5].dependencyKeys).toEqual(["m3", "m5"]);
    const dues = proposal.milestones.map((m) => m.value.dueDate!);
    expect([...dues].sort()).toEqual(dues);
    expect(dues.at(-1)).toBe("2027-01-12");
    expect(dues[0] >= "2026-10-12").toBe(true);
    expect(proposal.tasks).toHaveLength(12);
    expect(proposal.tasks[1].dependencyKeys).toEqual(["m1t1"]);
    expect(proposal.tasks[0].dependencyKeys).toEqual([]);
    for (const task of proposal.tasks) {
      const due = proposal.milestones.find((m) => m.key === task.milestoneKey)!
        .value.dueDate!;
      expect(task.value.dueDate! <= due).toBe(true);
    }
    expect(proposal.tasks[0].value.subjectId).toBe(context.subjects[0].id);
    expect(proposal.goal.subjectIds).toEqual([context.subjects[0].id]);
    expect(proposal.goal.estimatedMinutes).toBe(190 * 60);
    expect(summary.firstTask).toBe("Study Core Java");
    expect(proposal.explanation).toContain("Assumptions Aven made");
    expect(proposal.explanation).toContain("Verified: you recorded about 5");
  });
  it("flags plans that exceed the student's stated capacity", () => {
    const { summary, proposal } = buildGoalHierarchy(
      { ...hierarchy, targetDate: "2026-10-30" },
      context,
    );
    expect(summary.feasible).toBe(false);
    expect(proposal.explanation).toContain("needs more time");
    expect(
      availableMinutes("2026-10-12", "2026-10-18", 60, [1, 2, 3, 4, 5]),
    ).toBe(300);
  });
  it("rejects forward dependencies and past deadlines", () => {
    expect(() =>
      buildGoalHierarchy(
        {
          ...hierarchy,
          milestones: [milestone("A", 1, [2]), milestone("B", 1, [])],
        },
        context,
      ),
    ).toThrow("invalidDependency");
    expect(() =>
      buildGoalHierarchy({ ...hierarchy, targetDate: "2026-01-01" }, context),
    ).toThrow("invalidDates");
  });
  it("detects duplicate goals by significant words and ignores finished ones", () => {
    const goals = [
      { id: "1", title: "Get a Java backend job", status: "active" },
      { id: "2", title: "Java backend or DevOps job", status: "completed" },
      { id: "3", title: "Learn guitar", status: "active" },
    ];
    expect(
      findDuplicateGoals("Find a Java backend job", goals).map((g) => g.id),
    ).toEqual(["1"]);
    expect(findDuplicateGoals("Learn Spanish", goals)).toEqual([]);
    expect(matchSubject("mathematics", context.subjects)).toBe(
      context.subjects[1].id,
    );
    expect(matchSubject("Physics", context.subjects)).toBeNull();
  });
});
const task = (
  id: string,
  title: string,
  extra: Partial<GoalDetail["tasks"][number]> = {},
) =>
  ({
    id,
    goalId: "g",
    title,
    description: "",
    milestoneId: null,
    status: "todo",
    priority: "normal",
    dueDate: null,
    estimatedMinutes: 60,
    weight: 1,
    subjectId: null,
    topicId: null,
    dependencyIds: [],
    recurringDays: [],
    evidence: "",
    progressMode: "manual",
    manualProgress: 0,
    completedAt: null,
    updatedAt: "2026-10-01T00:00:00Z",
    actualSeconds: 0,
    ...extra,
  }) as GoalDetail["tasks"][number];
const detail = (
  id: string,
  tasks: GoalDetail["tasks"],
  extra: { blockedIds?: string[]; priority?: "low" | "normal" | "high" } = {},
) =>
  ({
    goal: {
      id,
      title: `Goal ${id}`,
      status: "active",
      priority: extra.priority ?? "normal",
      targetDate: "2026-12-31",
    },
    tasks,
    milestones: [],
    activity: [],
    sessions: [],
    progress: {
      percent: 0,
      health: "onTrack",
      taskProgress: Object.fromEntries(tasks.map((t) => [t.id, 0])),
      milestoneProgress: {},
      blockedIds: extra.blockedIds ?? [],
    },
  }) as unknown as GoalDetail;
describe("next best action", () => {
  const ctx = {
    today: "2026-10-12",
    now: Date.parse("2026-10-12T09:00:00Z"),
    dailyTargetMinutes: 90,
  };
  it("prefers overdue work and explains tasks it unblocks", () => {
    const security = task("t1", "Spring Security");
    const api = task("t2", "Portfolio API project", { dependencyIds: ["t1"] });
    const [first] = rankNextActions(
      [
        detail("a", [security, api], { blockedIds: ["t2"] }),
        detail("b", [task("t3", "Read notes", { dueDate: "2026-10-10" })]),
      ],
      ctx,
      1,
    );
    expect(first.taskTitle).toBe("Read notes");
    expect(first.reasons[0]).toEqual({ code: "overdue", date: "2026-10-10" });
    const [onlyA] = rankNextActions(
      [detail("a", [security, api], { blockedIds: ["t2"] })],
      ctx,
      3,
      "a",
    );
    expect(onlyA.taskTitle).toBe("Spring Security");
    expect(onlyA.reasons).toContainEqual({
      code: "unblocks",
      titles: ["Portfolio API project"],
      count: 1,
    });
  });
  it("never recommends blocked, finished or inactive work and keeps one action per goal", () => {
    const actions = rankNextActions(
      [
        detail(
          "a",
          [
            task("t1", "Done", { status: "completed" }),
            task("t2", "Blocked"),
            task("t3", "Open"),
            task("t4", "Also open"),
          ],
          { blockedIds: ["t2"] },
        ),
        {
          ...detail("c", [task("t5", "Paused goal task")]),
          goal: { ...detail("c", []).goal, status: "paused" },
        } as GoalDetail,
      ],
      ctx,
      5,
    );
    expect(actions.map((a) => a.taskTitle)).toEqual(["Also open"]);
  });
});
const block = (
  id: string,
  startsAt: string,
  endsAt: string,
  extra: Partial<ScheduleBlock> = {},
): ScheduleBlock => ({
  id,
  userId: "u",
  title: id,
  startsAt,
  endsAt,
  timezone: "Asia/Colombo",
  repeat: "once",
  weekdays: [],
  exceptions: [],
  color: "brand",
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  ...extra,
});
describe("recurring schedules and conflicts", () => {
  const range = { from: "2026-10-13", to: "2026-11-01" };
  // 19:00–21:00 Asia/Colombo is 13:30–15:30 UTC.
  const daily = block(
    "java",
    "2026-10-13T13:30:00.000Z",
    "2026-10-13T15:30:00.000Z",
    {
      repeat: "weekly",
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      recurrenceUntil: "2026-10-31",
    },
  );
  const existing = block(
    "math",
    "2026-10-20T14:00:00.000Z",
    "2026-10-20T15:00:00.000Z",
  );
  it("expands a daily series as one row and detects the conflicting date", () => {
    const occurrences = calendarOccurrences([daily], range, "Asia/Colombo");
    expect(occurrences).toHaveLength(19);
    const clashes = overlappingOccurrences(
      occurrences,
      calendarOccurrences([existing], range, "Asia/Colombo"),
    );
    expect(clashes.map((item) => item.candidate.date)).toEqual(["2026-10-20"]);
    const skipped = {
      ...daily,
      exceptions: [{ date: "2026-10-20", cancelled: true }],
    };
    expect(
      overlappingOccurrences(
        calendarOccurrences([skipped], range, "Asia/Colombo"),
        calendarOccurrences([existing], range, "Asia/Colombo"),
      ),
    ).toEqual([]);
  });
  it("moves one occurrence, future occurrences or the entire series", () => {
    const now = "2026-10-12T00:00:00Z";
    const move = (scope: "one" | "future" | "all") =>
      applyCalendarCommand(
        daily,
        {
          kind: "move",
          id: daily.id,
          date: "2026-10-15",
          scope,
          startsAt: "2026-10-15T16:00:00.000Z",
          endsAt: "2026-10-15T18:00:00.000Z",
          newSeriesId: "8d0f7c56-8a51-4a9e-9a6f-2a1f5d1a7c11",
        },
        "u",
        now,
      ).blocks;
    const one = calendarOccurrences(move("one"), range, "Asia/Colombo");
    expect(
      one.filter((o) => o.startsAt.endsWith("T16:00:00.000Z")),
    ).toHaveLength(1);
    const future = calendarOccurrences(move("future"), range, "Asia/Colombo");
    expect(
      future
        .filter((o) => o.date >= "2026-10-15")
        .every((o) => o.startsAt.slice(11, 16) === "16:00"),
    ).toBe(true);
    expect(
      future
        .filter((o) => o.date < "2026-10-15")
        .every((o) => o.startsAt.slice(11, 16) === "13:30"),
    ).toBe(true);
    const all = calendarOccurrences(move("all"), range, "Asia/Colombo");
    expect(all.every((o) => o.startsAt.slice(11, 16) === "16:00")).toBe(true);
  });
});
