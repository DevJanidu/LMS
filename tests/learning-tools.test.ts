import { beforeEach, expect, it, vi } from "vitest";
const { user, subject, auditLog, storeProposal, learning } = vi.hoisted(() => {
  const subject = {
    id: "00000000-0000-4000-8000-000000000500",
    title: "Advanced Java",
    targetDate: null,
  };
  return {
    user: {
      id: "00000000-0000-4000-8000-000000000002",
      status: "active",
      role: "learner",
      timezone: "UTC",
    },
    subject,
    auditLog: vi.fn(async () => undefined),
    storeProposal: vi.fn(
      async (_user: string, _conversation: string, value: unknown) => ({
        id: "proposal",
        status: "pending",
        value,
      }),
    ),
    learning: {
      resolveOwnedSubject: vi.fn(async () => subject),
      recentlyDeclined: vi.fn(async () => false),
      planSubjectPractice: vi.fn(),
      practiceRecommendationKey: (id: string) => `practice:${id}`,
      loadTopicCoverage: vi.fn(),
      loadGoalHealth: vi.fn(),
      loadLearningGaps: vi.fn(),
      learningRankingContext: vi.fn(),
    },
  };
});
vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: async () => [user] }) }),
    insert: () => ({ values: auditLog }),
  }),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string, values?: Record<string, string>) =>
    key === "practiceTitle" ? `Practice: ${values?.topic}` : key,
}));
vi.mock("@/lib/goals/service", () => ({
  GoalError: class GoalError extends Error {},
  getGoalDetail: vi.fn(),
  listGoals: vi.fn(),
  goalReferences: vi.fn(),
}));
vi.mock("@/lib/services/lists", () => ({ getScheduleBlocksInRange: vi.fn() }));
vi.mock("@/lib/services/calendar", () => ({
  getCalendarBlock: vi.fn(),
  mutateCalendar: vi.fn(),
}));
vi.mock("@/lib/aven/proposals", () => ({ storeProposal }));
vi.mock("@/lib/learning/server", () => learning);
import { executeAvenTool } from "@/lib/aven/tools";
const request = {
  subjectId: null,
  subjectName: "advanced java",
  sessions: 3,
  minutes: 45,
  horizonDays: 7,
  explanation: "More Advanced Java practice",
};
const counts = { required: 6, completed: 2, remaining: 4 };
beforeEach(() => {
  vi.clearAllMocks();
  learning.recentlyDeclined.mockResolvedValue(false);
});

it("Test 6: a declined recommendation is not proposed again unprompted", async () => {
  learning.recentlyDeclined.mockResolvedValue(true);
  const result = await executeAvenTool(user.id, "conversation", "proposePracticeSessions", {
    ...request,
    explicitRequest: false,
  });
  expect(result).toMatchObject({ proposalCreated: false, declinedRecently: true });
  expect(learning.recentlyDeclined).toHaveBeenCalledWith(user.id, `practice:${subject.id}`);
  expect(learning.planSubjectPractice).not.toHaveBeenCalled();
  expect(storeProposal).not.toHaveBeenCalled();
});

it("Test 6: the student can still ask again explicitly", async () => {
  learning.recentlyDeclined.mockResolvedValue(true);
  learning.planSubjectPractice.mockResolvedValue({
    audit: { counts },
    attention: { level: "needsPractice" },
    plan: {
      sessions: [
        {
          topicId: "00000000-0000-4000-8000-000000001004",
          topicTitle: "Concurrency",
          reason: "reportedDifficulty",
          startsAt: "2026-10-16T18:15:00.000Z",
          endsAt: "2026-10-16T19:00:00.000Z",
        },
      ],
      shortfall: 0,
      constraint: null,
      tradeoffs: [],
      skippedBlocked: [],
      nothingToPractice: false,
    },
  });
  const result = await executeAvenTool(user.id, "conversation", "proposePracticeSessions", {
    ...request,
    explicitRequest: true,
  });
  expect(storeProposal).toHaveBeenCalledWith(
    user.id,
    "conversation",
    expect.objectContaining({
      kind: "schedule",
      recommendationKey: `practice:${subject.id}`,
      sessions: [
        expect.objectContaining({
          title: "Practice: Concurrency",
          subjectId: subject.id,
          taskId: null,
        }),
      ],
    }),
  );
  expect(result).toMatchObject({
    sessions: [{ topic: "Concurrency", reason: "reportedDifficulty", localStartsAt: "2026-10-16T18:15" }],
  });
});

it("Test 7: with no free time it offers trade-offs and creates nothing", async () => {
  learning.planSubjectPractice.mockResolvedValue({
    audit: { counts },
    attention: { level: null },
    plan: {
      sessions: [],
      shortfall: 3,
      constraint: "noFreeTime",
      tradeoffs: [
        {
          blockId: "00000000-0000-4000-8000-000000000800",
          date: "2026-10-16",
          title: "Spring Boot",
          startsAt: "2026-10-16T17:00:00.000Z",
          endsAt: "2026-10-16T21:00:00.000Z",
        },
      ],
      skippedBlocked: [],
      nothingToPractice: false,
    },
  });
  const result = await executeAvenTool(user.id, "conversation", "proposePracticeSessions", {
    ...request,
    explicitRequest: true,
  });
  expect(result).toMatchObject({
    proposalCreated: false,
    availableCapacity: false,
    constraint: "noFreeTime",
    tradeoffs: [{ title: "Spring Boot", localStartsAt: "2026-10-16T17:00" }],
  });
  expect(storeProposal).not.toHaveBeenCalled();
});

it("records difficulty only as a reviewable proposal", async () => {
  await executeAvenTool(user.id, "conversation", "recordLearningSignal", {
    subjectId: subject.id,
    subjectName: null,
    topicId: null,
    level: "needsPractice",
    explanation: "You said Advanced Java feels hard.",
  });
  expect(storeProposal).toHaveBeenCalledWith(
    user.id,
    "conversation",
    expect.objectContaining({
      kind: "learningSignal",
      subjectId: subject.id,
      subjectTitle: "Advanced Java",
      level: "needsPractice",
    }),
  );
});
