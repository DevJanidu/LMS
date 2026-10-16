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
import { avenTools } from "@/lib/aven/tools";
import { planTurn } from "@/lib/aven/orchestration";
/**
 * Deterministic before/after measurement of what each turn sends: tool schemas
 * (bytes, approximate tokens at 4 bytes per token) and workflow routing agreement.
 * Model latency and live tool-call accuracy need provider calls and are not measured here.
 */
const corpus: { message: string; mentions?: ("subject" | "goal" | "friend")[]; expected: string }[] = [
  { message: "/schedule @Advanced Java next week after 7 PM", mentions: ["subject"], expected: "schedule" },
  { message: "Schedule Advanced Java study sessions next week after 7 PM", expected: "schedule" },
  { message: "Find free time next week after 7 PM.", expected: "schedule" },
  { message: "Add a study session tomorrow at 6 pm", expected: "schedule" },
  { message: "/catchup", expected: "catchup" },
  { message: "I've missed several SQL topics.", expected: "catchup" },
  { message: "I'm falling behind on my backend goal", expected: "catchup" },
  { message: "/review @Backend developer", mentions: ["goal"], expected: "review" },
  { message: "What should I focus on next?", expected: "review" },
  { message: "/practice @SQL", mentions: ["subject"], expected: "practice" },
  { message: "I'm really bad at Advanced Java.", expected: "practice" },
  { message: "I keep skipping concurrency", expected: "practice" },
  { message: "/plan become a backend developer by March", expected: "plan" },
  { message: "Help me finish my backend developer goal.", expected: "plan" },
  { message: "I want to become a data analyst within six months", expected: "plan" },
  { message: "/progress", expected: "progress" },
  { message: "I want to study more consistently than last week.", expected: "progress" },
  { message: "How am I doing?", expected: "progress" },
  { message: "/friends @Maya", mentions: ["friend"], expected: "friends" },
  { message: "Show my study group leaderboard", expected: "friends" },
  { message: "/goals", expected: "goals" },
  { message: "/subjects", expected: "subjects" },
  { message: "Explain Java generics", expected: "general" },
  { message: "Thanks!", expected: "general" },
];
const bytes = (tools: typeof avenTools) => Buffer.byteLength(JSON.stringify(tools));
it("measures tool-schema context per turn and routing agreement", () => {
  const before = bytes(avenTools);
  const rows = corpus.map((item) => {
    const plan = planTurn(item.message, item.mentions);
    const tools = plan.tools ? avenTools.filter((tool) => plan.tools!.includes(tool.name)) : avenTools;
    // Every planned tool name must exist in the registry.
    expect(plan.tools?.every((name) => avenTools.some((tool) => tool.name === name)) ?? true).toBe(true);
    return { ...item, workflow: plan.workflows[0], tools: tools.length, after: bytes(tools) };
  });
  const correct = rows.filter((row) => row.workflow === row.expected).length;
  const routed = rows.filter((row) => row.expected !== "general");
  const average = routed.reduce((sum, row) => sum + row.after, 0) / routed.length;
  const summary = {
    event: "aven_context_benchmark",
    allTools: avenTools.length,
    beforeBytes: before,
    beforeTokensApprox: Math.round(before / 4),
    routedAverageBytes: Math.round(average),
    routedAverageTokensApprox: Math.round(average / 4),
    reductionPercent: Math.round((1 - average / before) * 100),
    routingAgreement: `${correct}/${rows.length}`,
    misses: rows.filter((row) => row.workflow !== row.expected).map((row) => row.message),
  };
  console.info(JSON.stringify(summary));
  expect(correct).toBe(rows.length);
  expect(summary.reductionPercent).toBeGreaterThanOrEqual(40);
});
