import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  list: vi.fn(),
  detail: vi.fn(),
  mutate: vi.fn(),
  references: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/env", () => ({
  getAccountEnv: () => ({ APP_URL: "https://acadence.example" }),
}));
vi.mock("@/lib/goals/service", () => ({
  listGoals: mocks.list,
  getGoalDetail: mocks.detail,
  mutateGoal: mocks.mutate,
  goalReferences: mocks.references,
  GoalError: class GoalError extends Error {
    constructor(
      message: string,
      public status = 400,
    ) {
      super(message);
    }
  },
}));
import { GET, POST } from "@/app/api/goals/route";
import { goalSchema } from "@/lib/goals/validation";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({
    id: "00000000-0000-4000-8000-000000000001",
    role: "learner",
    acceptedTermsAt: new Date(),
    onboardingCompletedAt: new Date(),
  });
  mocks.list.mockResolvedValue({ details: [], total: 0 });
});
it("refuses learners who have not accepted Terms or finished onboarding, even through direct API calls", async () => {
  for (const incomplete of [{ acceptedTermsAt: null, onboardingCompletedAt: null }, { acceptedTermsAt: new Date(), onboardingCompletedAt: null }, { acceptedTermsAt: null, onboardingCompletedAt: new Date() }]) {
    mocks.user.mockResolvedValueOnce({ id: "00000000-0000-4000-8000-000000000001", role: "learner", ...incomplete });
    const response = await GET(new Request("https://study.example.com/api/goals"));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ ok: false, error: "onboardingRequired" });
  }
  expect(mocks.list).not.toHaveBeenCalled();
});
const body = {
  operationId: "00000000-0000-4000-8000-000000000002",
  goalId: "00000000-0000-4000-8000-000000000003",
  expectedVersion: 0,
  action: {
    kind: "goal",
    value: goalSchema.parse({
      title: "Learn",
      startDate: "2026-10-11",
      targetDate: "2026-11-11",
    }),
  },
};
it("rejects unsigned and non-learner requests before accessing goal records", async () => {
  mocks.user.mockResolvedValueOnce(null);
  expect(
    (await GET(new Request("https://acadence.example/api/goals"))).status,
  ).toBe(401);
  mocks.user.mockResolvedValueOnce({ id: "admin", role: "super_admin" });
  expect(
    (await GET(new Request("https://acadence.example/api/goals"))).status,
  ).toBe(403);
  expect(mocks.list).not.toHaveBeenCalled();
});
it("uses the authenticated owner, ignoring a supplied owner identifier", async () => {
  await GET(new Request("https://acadence.example/api/goals?userId=other"));
  expect(mocks.list).toHaveBeenCalledWith(
    "00000000-0000-4000-8000-000000000001",
    1,
    "",
    "",
    "deadline",
  );
});
it("combines search, status, pagination and server-wide sorting", async () => {
  await GET(
    new Request(
      "https://acadence.example/api/goals?search=Java&status=active&page=2&sort=progress",
    ),
  );
  expect(mocks.list).toHaveBeenCalledWith(
    "00000000-0000-4000-8000-000000000001",
    2,
    "Java",
    "active",
    "progress",
  );
  expect(
    (await GET(new Request("https://acadence.example/api/goals?sort=invalid")))
      .status,
  ).toBe(400);
});
it("protects all mutations against cross-origin requests and invalid schemas", async () => {
  expect(
    (
      await POST(
        new Request("https://acadence.example/api/goals", {
          method: "POST",
          headers: { Origin: "https://attacker.example" },
          body: JSON.stringify(body),
        }),
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await POST(
        new Request("https://acadence.example/api/goals", {
          method: "POST",
          headers: { Origin: "https://acadence.example" },
          body: JSON.stringify({ ...body, expectedVersion: -1 }),
        }),
      )
    ).status,
  ).toBe(400);
  expect(mocks.mutate).not.toHaveBeenCalled();
});
it("returns reconciled server state after a successful create", async () => {
  mocks.mutate.mockResolvedValue({
    goalId: body.goalId,
    version: 1,
    deleted: false,
  });
  mocks.detail.mockResolvedValue({ goal: { id: body.goalId, version: 1 } });
  const response = await POST(
    new Request("https://acadence.example/api/goals", {
      method: "POST",
      headers: { Origin: "https://acadence.example" },
      body: JSON.stringify(body),
    }),
  );
  expect(response.status).toBe(200);
  expect((await response.json()).detail.goal.version).toBe(1);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
});
