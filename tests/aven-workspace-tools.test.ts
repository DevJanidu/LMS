import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => {
  const user = { id: "00000000-0000-4000-8000-000000000002", status: "active", role: "learner", timezone: "UTC" };
  const reminders = [
    { id: "00000000-0000-4000-8000-000000000071", dueAt: new Date("2026-10-20T18:00:00Z"), value: { title: "Review SQL" } },
  ];
  // The first select reads the account; later ones read reminders.
  let selects = 0;
  const chain = (rows: unknown[]): unknown =>
    new Proxy(() => undefined, {
      get: (_t, property) =>
        property === "then" ? (resolve: (value: unknown) => void) => resolve(rows) : () => chain(rows),
    });
  return {
    user,
    reminders,
    reset: () => (selects = 0),
    select: () => chain(selects++ === 0 ? [user] : reminders),
    store: vi.fn(async (_u: string, _c: string, value: unknown) => ({ id: "proposal", status: "pending", value })),
    subject: vi.fn(),
    blocks: vi.fn(),
    preferences: vi.fn(),
  };
});
vi.mock("@/lib/db", () => ({
  getDb: () => ({ select: mocks.select, insert: () => ({ values: async () => undefined }) }),
}));
vi.mock("@/lib/goals/service", () => ({
  GoalError: class GoalError extends Error {},
  getGoalDetail: vi.fn(),
  listGoals: vi.fn(),
  goalReferences: vi.fn(),
}));
vi.mock("@/lib/services/lists", () => ({ getScheduleBlocksInRange: mocks.blocks }));
vi.mock("@/lib/services/calendar", () => ({ getCalendarBlock: vi.fn(), mutateCalendar: vi.fn() }));
vi.mock("@/lib/aven/proposals", () => ({ storeProposal: mocks.store }));
vi.mock("@/lib/aven/preferences", () => ({ getAvenPreferences: mocks.preferences }));
vi.mock("@/lib/learning/server", () => ({
  resolveOwnedSubject: mocks.subject,
  recentlyDeclined: vi.fn(),
  planSubjectPractice: vi.fn(),
  practiceRecommendationKey: (value: string) => value,
  loadTopicCoverage: vi.fn(),
  loadGoalHealth: vi.fn(),
  loadLearningGaps: vi.fn(),
  learningRankingContext: vi.fn(),
}));
import { executeAvenTool } from "@/lib/aven/tools";
const subject = (n: number, title: string) => ({ id: `00000000-0000-4000-8000-0000000000${n}`, title, targetDate: null });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.reset();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-16T08:00:00Z"));
  mocks.preferences.mockResolvedValue({
    ai: { preferredStudyStart: "17:00", preferredStudyEnd: "20:00", studyDays: [1, 2, 3, 4, 5], dailyTargetMinutes: 120 },
  });
  mocks.blocks.mockResolvedValue([]);
  mocks.subject.mockImplementation(async (_user: string, _id: string | null, name: string) =>
    name === "java" ? subject(10, "Java") : name === "sql" ? subject(11, "SQL") : subject(12, "Spring Boot"),
  );
});
const request = (overrides: Record<string, unknown> = {}) => ({
  subjects: [
    { subjectId: null, subjectName: "java", sessions: 1 },
    { subjectId: null, subjectName: "sql", sessions: 1 },
    { subjectId: null, subjectName: "spring", sessions: 1 },
  ],
  minutes: 60,
  from: "2026-10-19",
  to: "2026-10-25",
  earliest: "19:00",
  latest: null,
  explanation: "Next week after 7 PM",
  ...overrides,
});
it("schedules several subjects next week after 7 PM without asking for times", async () => {
  const result = (await executeAvenTool(mocks.user.id, "c", "scheduleStudySessions", request())) as {
    sessions: { subject: string; localStartsAt: string }[];
    window: { latest: string };
  };
  // The preferred end (20:00) is before an explicit 19:00 start, so the window extends to 22:00.
  expect(result.window.latest).toBe("22:00");
  expect(result.sessions.map((item) => item.subject).sort()).toEqual(["Java", "SQL", "Spring Boot"]);
  expect(result.sessions.every((item) => item.localStartsAt.slice(11) >= "19:00")).toBe(true);
  expect(mocks.store).toHaveBeenCalledWith(
    mocks.user.id,
    "c",
    expect.objectContaining({ kind: "schedule", goalId: null }),
  );
});
it("creates nothing when the calendar is full and explains the constraint", async () => {
  mocks.blocks.mockResolvedValue(
    ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"].map((day, index) => ({
      id: `00000000-0000-4000-8000-00000000080${index}`, userId: mocks.user.id, title: "Work shift",
      startsAt: `${day}T18:00:00.000Z`, endsAt: `${day}T23:00:00.000Z`, repeat: "once", weekdays: [],
      timezone: "UTC", color: "brand", exceptions: [], createdAt: "", updatedAt: "",
    })),
  );
  const result = await executeAvenTool(mocks.user.id, "c", "scheduleStudySessions", request());
  expect(result).toMatchObject({ proposalCreated: false, constraint: "noFreeTime" });
  expect(mocks.store).not.toHaveBeenCalled();
});
it("rejects windows longer than two weeks", async () => {
  await expect(
    executeAvenTool(mocks.user.id, "c", "scheduleStudySessions", request({ to: "2026-11-30" })),
  ).rejects.toThrow("invalidInput");
});
it("cancels only reminders that exist and are still pending", async () => {
  await executeAvenTool(mocks.user.id, "c", "cancelReminders", {
    reminderIds: [mocks.reminders[0].id],
    explanation: "Not needed",
  });
  expect(mocks.store).toHaveBeenCalledWith(
    mocks.user.id,
    "c",
    expect.objectContaining({ kind: "cancelReminders", reminders: [{ id: mocks.reminders[0].id, title: "Review SQL" }] }),
  );
  mocks.reset();
  await expect(
    executeAvenTool(mocks.user.id, "c", "cancelReminders", {
      reminderIds: ["00000000-0000-4000-8000-000000000999"],
      explanation: "x",
    }),
  ).rejects.toThrow("recordUnavailable");
});
