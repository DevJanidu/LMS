interface BudgetConfig {
  dailyBudget: number;
  monthlyBudget: number;
  globalMonthlyBudget: number;
  dailyTokens: number;
  monthlyTokens: number;
}
interface Usage {
  dayCost: number;
  monthCost: number;
  dayTokens: number;
  monthTokens: number;
  globalCost: number;
}
export function budgetFailure(
  usage: Usage,
  costMicros: number,
  tokens: number,
  config: BudgetConfig,
) {
  if (usage.globalCost + costMicros > config.globalMonthlyBudget * 1e6)
    return "workspaceUsageLimit";
  if (
    (config.dailyBudget > 0 &&
      usage.dayCost + costMicros > config.dailyBudget * 1e6) ||
    usage.monthCost + costMicros > config.monthlyBudget * 1e6 ||
    (config.dailyTokens > 0 && usage.dayTokens + tokens > config.dailyTokens) ||
    (config.monthlyTokens > 0 &&
      usage.monthTokens + tokens > config.monthlyTokens)
  )
    return "usageLimit";
  return null;
}
