import { expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/goals/service", () => ({
  GoalError: class GoalError extends Error {},
  getGoalDetail: vi.fn(),
  listGoals: vi.fn(),
  goalReferences: vi.fn(),
}));
vi.mock("@/lib/services/lists", () => ({ getScheduleBlocksInRange: vi.fn() }));
vi.mock("@/lib/services/calendar", () => ({ getCalendarBlock: vi.fn(), mutateCalendar: vi.fn() }));
import { avenTools, isAvenWriteTool } from "@/lib/aven/tools";
import { planTurn } from "@/lib/aven/orchestration";
import { evalCases, type EvalCase } from "./aven-eval/cases";
import { holdoutCases } from "./aven-eval/holdout";
/**
 * Objective routing evaluation over the labeled request set:
 * - intent accuracy: the expected workflow is among the planned ones (general = all tools)
 * - tool availability: every tool a correct answer needs is offered for the turn
 * - safety: no turn offers anything outside the account-scoped, approval-only registry
 * - token efficiency: tool-schema bytes per turn versus sending every tool
 */
const bytes = (names: string[] | null) =>
  Buffer.byteLength(
    JSON.stringify(names ? avenTools.filter((tool) => names.includes(tool.name)) : avenTools),
  );
function evaluate(cases: EvalCase[]) {
  const registry = new Set(avenTools.map((tool) => tool.name));
  return cases.map((item) => {
    const plan = planTurn(item.message, item.mentions);
    const offered = plan.tools ?? [...registry];
    return {
      ...item,
      workflows: plan.workflows,
      intentOk:
        item.workflow === "general"
          ? plan.tools === null || plan.command === "help"
          : plan.workflows.includes(item.workflow),
      missing: item.tools.filter((name) => !offered.includes(name)),
      unknown: offered.filter((name) => !registry.has(name)),
      bytes: bytes(plan.tools),
    };
  });
}
it("routes the evaluation set accurately and efficiently", () => {
  expect(evalCases.length).toBeGreaterThanOrEqual(100);
  const rows = evaluate(evalCases);
  const byCategory: Record<string, { total: number; intent: number; tools: number }> = {};
  for (const row of rows) {
    const entry = (byCategory[row.category] ??= { total: 0, intent: 0, tools: 0 });
    entry.total++;
    if (row.intentOk) entry.intent++;
    if (!row.missing.length) entry.tools++;
  }
  const intent = rows.filter((row) => row.intentOk).length;
  const tools = rows.filter((row) => !row.missing.length).length;
  const all = bytes(null);
  const average = rows.reduce((sum, row) => sum + row.bytes, 0) / rows.length;
  const report = {
    event: "aven_eval",
    cases: rows.length,
    intentAccuracy: `${intent}/${rows.length}`,
    toolAvailability: `${tools}/${rows.length}`,
    toolSchemaBytes: { allTools: all, averagePerTurn: Math.round(average), reductionPercent: Math.round((1 - average / all) * 100) },
    byCategory,
    intentMisses: rows.filter((row) => !row.intentOk).map((row) => ({ message: row.message, got: row.workflows })),
    toolMisses: rows.filter((row) => row.missing.length).map((row) => ({ message: row.message, missing: row.missing })),
  };
  console.info(JSON.stringify(report));
  // Safety: every offered tool is a registered tool; nothing else exists to call.
  expect(rows.every((row) => !row.unknown.length)).toBe(true);
  // Every changing tool in the registry only creates proposals.
  expect(avenTools.filter((tool) => isAvenWriteTool(tool.name)).every((tool) => tool.description.includes("user must approve"))).toBe(true);
  expect(tools).toBe(rows.length);
  expect(intent / rows.length).toBeGreaterThanOrEqual(0.95);
});

it("reports the held-out set without tuning to it", () => {
  const rows = evaluate(holdoutCases);
  const intent = rows.filter((row) => row.intentOk).length;
  const tools = rows.filter((row) => !row.missing.length).length;
  console.info(
    JSON.stringify({
      event: "aven_eval_holdout",
      cases: rows.length,
      intentAccuracy: `${intent}/${rows.length}`,
      toolAvailability: `${tools}/${rows.length}`,
      intentMisses: rows.filter((row) => !row.intentOk).map((row) => ({ message: row.message, expected: row.workflow, got: row.workflows })),
      toolMisses: rows.filter((row) => row.missing.length).map((row) => ({ message: row.message, missing: row.missing })),
    }),
  );
  // Safety holds regardless of routing accuracy.
  expect(rows.every((row) => !row.unknown.length)).toBe(true);
});
