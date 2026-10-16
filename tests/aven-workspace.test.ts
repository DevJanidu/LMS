import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  rows: new Map<unknown, unknown[]>(),
  goalDetail: vi.fn(),
  subject: vi.fn(),
}));
vi.mock("@/lib/db", () => {
  const query = (table: unknown): unknown =>
    new Proxy(() => undefined, {
      get: (_target, property) =>
        property === "then"
          ? (resolve: (value: unknown) => void) => resolve(mocks.rows.get(table) ?? [])
          : () => query(table),
    });
  return { getDb: () => ({ select: () => ({ from: (table: unknown) => query(table) }) }) };
});
vi.mock("@/lib/goals/service", () => ({
  GoalError: class GoalError extends Error {
    constructor(message: string, public status = 400) {
      super(message);
    }
  },
  getGoalDetail: mocks.goalDetail,
}));
vi.mock("@/lib/learning/server", () => ({ resolveOwnedSubject: mocks.subject }));
import * as s from "@/lib/db/schema";
import {
  goalChangesProposal,
  libraryProposal,
  subjectProposal,
  topicProposal,
} from "@/lib/aven/workspace-actions";
import { proposalSchema } from "@/lib/aven/validation";
import { planStudySessions } from "@/lib/learning/slots";
import { overlaps, validateSchedule } from "@/lib/aven/planning";
import { goalSchema, milestoneSchema, taskSchema } from "@/lib/goals/validation";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const updated = new Date("2026-10-10T10:00:00Z");
const subjectRow = (n: number, title: string) => ({
  id: id(n), userId: id(1), title, description: "", displayColor: "brand", targetDate: null,
  status: "active", createdAt: updated, updatedAt: updated,
});
beforeEach(() => {
  mocks.rows.clear();
  vi.clearAllMocks();
});

describe("multi-subject scheduling", () => {
  const NOW = Date.parse("2026-10-16T08:00:00Z"); // Friday
  const subjects = [
    { subjectId: id(10), title: "Java", sessions: 2 },
    { subjectId: id(11), title: "SQL", sessions: 2 },
    { subjectId: id(12), title: "Spring Boot", sessions: 2 },
  ];
  const existing = [
    { blockId: id(90), title: "Gym", date: "2026-10-19", startsAt: "2026-10-19T19:00:00.000Z", endsAt: "2026-10-19T20:30:00.000Z" },
  ];
  const plan = planStudySessions({
    subjects, minutes: 60, from: "2026-10-19", to: "2026-10-25", earliest: "19:00", latest: "22:00",
    studyDays: [1, 2, 3, 4, 5], dailyTargetMinutes: 120, commitments: existing, timezone: "UTC", now: NOW,
  });
  it("places every requested session after 7 PM next week without overlaps", () => {
    expect(plan.sessions).toHaveLength(6);
    expect(plan.unplaced).toEqual([]);
    for (const session of plan.sessions) {
      expect(session.startsAt.slice(11, 16) >= "19:00").toBe(true);
      expect(session.endsAt.slice(11, 16) <= "22:00").toBe(true);
      expect(existing.some((item) => overlaps(session, item))).toBe(false);
    }
    expect(() => validateSchedule(plan.sessions, existing, NOW, 120, "UTC")).not.toThrow();
  });
  it("keeps a break after existing commitments and at most one session per subject a day", () => {
    const monday = plan.sessions.filter((item) => item.startsAt.startsWith("2026-10-19"));
    for (const item of monday) expect(Date.parse(item.startsAt)).toBeGreaterThanOrEqual(Date.parse("2026-10-19T20:45:00Z"));
    const keys = plan.sessions.map((item) => `${item.subjectId}:${item.startsAt.slice(0, 10)}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("only uses study days and spreads sessions across the week", () => {
    expect(plan.sessions.every((item) => ![0, 6].includes(new Date(item.startsAt).getUTCDay()))).toBe(true);
    expect(new Set(plan.sessions.map((item) => item.startsAt.slice(0, 10))).size).toBeGreaterThanOrEqual(3);
  });
  it("reports unplaced sessions and trade-offs instead of inventing time", () => {
    const full = planStudySessions({
      subjects, minutes: 60, from: "2026-10-19", to: "2026-10-20", earliest: "19:00", latest: "20:30",
      studyDays: [1, 2], dailyTargetMinutes: 240,
      commitments: [{ ...existing[0], date: "2026-10-20", startsAt: "2026-10-20T19:00:00.000Z", endsAt: "2026-10-20T20:30:00.000Z" }, existing[0]],
      timezone: "UTC", now: NOW,
    });
    expect(full.sessions).toEqual([]);
    expect(full.constraint).toBe("noFreeTime");
    expect(full.unplaced.map((item) => item.missing)).toEqual([2, 2, 2]);
    expect(full.tradeoffs.length).toBeGreaterThan(0);
  });
  it("names the daily target when it is the limit, and reports windows without study days", () => {
    const tight = planStudySessions({
      subjects: [{ subjectId: id(10), title: "Java", sessions: 3 }], minutes: 60,
      from: "2026-10-19", to: "2026-10-19", earliest: "19:00", latest: "22:00",
      studyDays: [1], dailyTargetMinutes: 30, commitments: [], timezone: "UTC", now: NOW,
    });
    expect(tight.constraint).toBe("dailyTarget");
    const weekend = planStudySessions({
      subjects: [{ subjectId: id(10), title: "Java", sessions: 1 }], minutes: 60,
      from: "2026-10-17", to: "2026-10-18", earliest: "19:00", latest: "22:00",
      studyDays: [1, 2, 3, 4, 5], dailyTargetMinutes: 120, commitments: [], timezone: "UTC", now: NOW,
    });
    expect(weekend.constraint).toBe("noStudyDays");
  });
  it("never schedules in the past", () => {
    const today = planStudySessions({
      subjects: [{ subjectId: id(10), title: "Java", sessions: 1 }], minutes: 60,
      from: "2026-10-10", to: "2026-10-16", earliest: "06:00", latest: "11:00",
      studyDays: [0, 1, 2, 3, 4, 5, 6], dailyTargetMinutes: 120, commitments: [], timezone: "UTC", now: NOW,
    });
    expect(today.sessions).toHaveLength(1);
    expect(today.sessions[0].startsAt).toBe("2026-10-16T08:30:00.000Z");
  });
});

describe("workspace proposals: forged operations are rejected", () => {
  const base = { kind: "workspace", explanation: "x", impact: "standard", summary: [{ action: "update", entity: "subject", title: "x" }], preconditions: [] };
  it.each([
    [{ kind: "profile", value: { name: "x", timezone: "UTC", weeklyTargetMinutes: 0, theme: "auto", weekStartDay: 1, reminders: true } }],
    [{ kind: "settings", value: { streakMinutes: 1, maxFileSizeMB: 100, storagePerUserMB: 10000 } }],
    [{ kind: "userStatus", id: id(2), status: "inactive" }],
    [{ kind: "timer", value: { command: "discard" } }],
    [{ kind: "delete", entity: "session", id: id(2) }],
    [{ kind: "resource", value: { id: id(3), subjectId: id(4), type: "file", title: "x" } }],
  ])("rejects %j", (operation) => {
    expect(proposalSchema.safeParse({ ...base, operations: [operation] }).success).toBe(false);
  });
  it("rejects goal actions outside item management", () => {
    expect(
      proposalSchema.safeParse({
        kind: "goalChanges", goalId: id(5), expectedVersion: 1, explanation: "x", impact: "standard",
        summary: [{ action: "update", entity: "task", title: "x" }],
        actions: [{ kind: "linkSession", sessionId: id(6), taskId: null, seconds: 600 }],
      }).success,
    ).toBe(false);
  });
});

describe("subject, topic and library proposals", () => {
  it("builds exact operations with conflict preconditions and flags subject deletion as high impact", async () => {
    mocks.rows.set(s.subjects, [subjectRow(20, "Advanced Java"), subjectRow(21, "Old notes")]);
    const proposal = await subjectProposal(id(1), {
      explanation: "Tidy up",
      changes: [
        { action: "update", subjectId: id(20), title: "Advanced Java II", description: null, targetDate: "2026-12-01" },
        { action: "delete", subjectId: id(21), title: null, description: null, targetDate: null },
        { action: "create", subjectId: null, title: "Spring Boot", description: null, targetDate: null },
      ],
    });
    expect(proposal.impact).toBe("high");
    expect(proposal.operations[0]).toEqual({
      kind: "subject",
      value: { id: id(20), title: "Advanced Java II", description: "", color: "brand", targetDate: "2026-12-01", status: "active" },
    });
    expect(proposal.operations[1]).toEqual({ kind: "delete", entity: "subject", id: id(21) });
    expect(proposal.preconditions.slice(0, 2)).toEqual([
      { kind: "subject", id: id(20), values: { updatedAt: updated.toISOString() } },
      { kind: "subject", id: id(21), values: { updatedAt: updated.toISOString() } },
    ]);
    expect(proposal.preconditions[2]).toMatchObject({ kind: "subject", values: null });
    expect(proposalSchema.safeParse(proposal).success).toBe(true);
  });
  it("refuses other people's or deleted records", async () => {
    mocks.rows.set(s.subjects, []);
    await expect(
      subjectProposal(id(1), { explanation: "x", changes: [{ action: "delete", subjectId: id(99), title: null, description: null, targetDate: null }] }),
    ).rejects.toThrow("recordUnavailable");
  });
  it("completes and reopens topics without claiming mastery, and appends new topics", async () => {
    const topic = {
      id: id(30), subjectId: id(20), title: "Concurrency", description: null, status: "in_progress", targetDate: null,
      sortOrder: 3, completedAt: null, archived: false, createdAt: updated, updatedAt: updated,
    };
    mocks.rows.set(s.topics, [{ topic }]);
    const done = await topicProposal(id(1), {
      explanation: "Done",
      changes: [{ action: "complete", topicId: id(30), subjectId: null, subjectName: null, title: null, targetDate: null }],
    });
    expect(done.operations[0]).toMatchObject({ kind: "topic", value: { id: id(30), status: "completed", sortOrder: 3 } });
    expect(done.impact).toBe("standard");
    mocks.subject.mockResolvedValue({ id: id(20), title: "Advanced Java", targetDate: null });
    mocks.rows.set(s.topics, [{ highest: 7 }]);
    const created = await topicProposal(id(1), {
      explanation: "Add",
      changes: [
        { action: "create", topicId: null, subjectId: null, subjectName: "advanced java", title: "Streams", targetDate: null },
        { action: "create", topicId: null, subjectId: null, subjectName: "advanced java", title: "Records", targetDate: null },
      ],
    });
    expect(created.operations.map((op) => op.kind === "topic" && op.value.sortOrder)).toEqual([8, 9]);
  });
  it("adds only valid http(s) links", async () => {
    mocks.subject.mockResolvedValue({ id: id(20), title: "Advanced Java", targetDate: null });
    await expect(
      libraryProposal(id(1), { explanation: "x", changes: [{ action: "addLink", resourceId: null, subjectId: id(20), subjectName: null, topicId: null, title: "x", url: "javascript:alert(1)" }] }),
    ).rejects.toThrow("invalidUrl");
    const ok = await libraryProposal(id(1), {
      explanation: "x",
      changes: [{ action: "addLink", resourceId: null, subjectId: id(20), subjectName: null, topicId: null, title: "Java docs", url: "https://docs.oracle.com/javase/" }],
    });
    expect(ok.operations[0]).toMatchObject({ kind: "resource", value: { type: "link", url: "https://docs.oracle.com/javase/" } });
  });
});

describe("goal change proposals", () => {
  const goal = {
    ...goalSchema.parse({ title: "Backend developer", startDate: "2026-10-01", targetDate: "2026-12-31" }),
    id: id(40), userId: id(1), version: 3, createdAt: "", updatedAt: "",
  };
  const milestones = [0, 1].map((n) => ({ ...milestoneSchema.parse({ title: `M${n}`, sortOrder: n }), id: id(50 + n), goalId: id(40) }));
  const task = { ...taskSchema.parse({ title: "Joins", dueDate: "2026-10-20" }), id: id(60), goalId: id(40), actualSeconds: 0, completedAt: null, updatedAt: "" };
  beforeEach(() => mocks.goalDetail.mockResolvedValue({ goal, milestones, tasks: [task] }));
  it("completes, reschedules and reorders with the version seen at proposal time", async () => {
    const proposal = await goalChangesProposal(id(1), {
      goalId: id(40),
      explanation: "Update",
      changes: [
        { action: "completeTask", id: id(60), title: null, dueDate: null, priority: null, order: null },
        { action: "rescheduleTask", id: id(60), title: null, dueDate: "2026-10-25", priority: null, order: null },
        { action: "reorderMilestones", id: null, title: null, dueDate: null, priority: null, order: [id(51), id(50)] },
      ],
    });
    expect(proposal.expectedVersion).toBe(3);
    expect(proposal.actions[0]).toMatchObject({ kind: "task", id: id(60), value: { status: "completed" } });
    expect(proposal.actions[1]).toMatchObject({ kind: "task", value: { dueDate: "2026-10-25" } });
    expect(proposal.actions.slice(2)).toMatchObject([
      { kind: "milestone", id: id(51), value: { sortOrder: 0 } },
      { kind: "milestone", id: id(50), value: { sortOrder: 1 } },
    ]);
    expect(proposal.impact).toBe("standard");
    expect(proposalSchema.safeParse(proposal).success).toBe(true);
  });
  it("needs a second confirmation to delete a goal and refuses to mix it with edits", async () => {
    const deletion = await goalChangesProposal(id(1), {
      goalId: id(40), explanation: "Remove",
      changes: [{ action: "deleteGoal", id: null, title: null, dueDate: null, priority: null, order: null }],
    });
    expect(deletion.impact).toBe("high");
    await expect(
      goalChangesProposal(id(1), {
        goalId: id(40), explanation: "x",
        changes: [
          { action: "deleteGoal", id: null, title: null, dueDate: null, priority: null, order: null },
          { action: "completeTask", id: id(60), title: null, dueDate: null, priority: null, order: null },
        ],
      }),
    ).rejects.toThrow("invalidToolInput");
  });
  it("rejects items from another goal and incomplete reorders", async () => {
    await expect(
      goalChangesProposal(id(1), { goalId: id(40), explanation: "x", changes: [{ action: "deleteTask", id: id(999), title: null, dueDate: null, priority: null, order: null }] }),
    ).rejects.toThrow("recordUnavailable");
    await expect(
      goalChangesProposal(id(1), { goalId: id(40), explanation: "x", changes: [{ action: "reorderMilestones", id: null, title: null, dueDate: null, priority: null, order: [id(50)] }] }),
    ).rejects.toThrow("invalidToolInput");
  });
});
