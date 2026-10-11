import { expect, it } from "vitest";
import { budgetFailure } from "@/lib/aven/budget";
const config = {
  dailyBudget: 0,
  monthlyBudget: 5,
  globalMonthlyBudget: 5,
  dailyTokens: 0,
  monthlyTokens: 0,
};
const usage = {
  dayCost: 2e6,
  monthCost: 2e6,
  globalCost: 3e6,
  dayTokens: 10000000,
  monthTokens: 10000000,
};
it("does not impose daily chat allowances or optional token caps when disabled", () => {
  expect(budgetFailure(usage, 10000, 100000, config)).toBeNull();
});
it("enforces the shared app budget even if the learner has remaining allowance", () => {
  expect(budgetFailure({ ...usage, globalCost: 4999999 }, 2, 1, config)).toBe(
    "workspaceUsageLimit",
  );
});
it("includes outstanding reservations and accepts a request exactly at the cap", () => {
  expect(
    budgetFailure({ ...usage, globalCost: 4900000 }, 100000, 1, config),
  ).toBeNull();
  expect(
    budgetFailure({ ...usage, globalCost: 4900001 }, 100000, 1, config),
  ).toBe("workspaceUsageLimit");
});
it("still respects explicitly configured account safety limits", () => {
  expect(budgetFailure(usage, 1000, 1, { ...config, dailyBudget: 1 })).toBe(
    "usageLimit",
  );
  expect(budgetFailure(usage, 1000, 1, { ...config, dailyTokens: 1000 })).toBe(
    "usageLimit",
  );
});
