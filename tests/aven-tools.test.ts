import { expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));
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
import { avenTools, validateToolInput } from "@/lib/aven/tools";
import { resolveAvenConfiguration } from "@/lib/aven/configuration";
import {
  MAX_INPUT_BYTES,
  MAX_INSTRUCTION_BYTES,
  MAX_OUTPUT_TOKENS,
  MAX_TOOL_ROUNDS,
} from "@/lib/aven/config";
it("exposes only registered, validated tools and rejects arbitrary code/query requests", () => {
  expect(() =>
    validateToolInput("executeSql", { query: "select * from users" }),
  ).toThrow();
  expect(() =>
    validateToolInput("getGoalDetails", { goalId: "invalid" }),
  ).toThrow();
  expect(avenTools).toHaveLength(17);
  expect(avenTools.every((tool) => tool.strict)).toBe(true);
});
it("marks all changing tools as proposals requiring application approval", () => {
  for (const name of [
    "createGoalTask",
    "updateGoalTask",
    "rescheduleStudySession",
    "createReminder",
    "proposeGoalPlan",
    "proposeStudySchedule",
  ])
    expect(avenTools.find((tool) => tool.name === name)?.description).toContain(
      "user must approve",
    );
});
it("produces provider-compatible strict schemas at every nested object", () => {
  const check = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(check);
      return;
    }
    const value = node as Record<string, unknown>;
    expect(value).not.toHaveProperty("default");
    expect(value).not.toHaveProperty("$schema");
    if (value.type === "object") {
      expect(value.additionalProperties).toBe(false);
      expect([...((value.required as string[]) ?? [])].sort()).toEqual(
        Object.keys(value.properties ?? {}).sort(),
      );
    }
    Object.values(value).forEach(check);
  };
  avenTools.forEach((tool) => check(tool.parameters));
});
it("allows a planning turn with the default models and account limits", () => {
  const result = resolveAvenConfiguration({ OPENAI_API_KEY: "fixture" });
  if (!result.success) throw new Error("invalid fixture config");
  const value = result.data;
  const inputBound =
    MAX_INPUT_BYTES +
    MAX_INSTRUCTION_BYTES +
    Buffer.byteLength(JSON.stringify(avenTools));
  const tokens = MAX_TOOL_ROUNDS * (inputBound + MAX_OUTPUT_TOKENS);
  const cost =
    (MAX_TOOL_ROUNDS *
      (inputBound * value.OPENAI_PLANNING_INPUT_PRICE +
        MAX_OUTPUT_TOKENS * value.OPENAI_PLANNING_OUTPUT_PRICE)) /
    1e6;
  expect(tokens).toBeLessThanOrEqual(value.AVEN_DAILY_TOKEN_LIMIT);
  expect(cost).toBeLessThanOrEqual(value.AVEN_DAILY_BUDGET_USD);
});
