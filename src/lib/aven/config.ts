import "server-only";
import { assertEnvironmentIsolation } from "@/lib/deployment-policy.mjs";
import {
  resolveAvenConfiguration,
  avenConfigurationStatus,
  isReasoningModel,
  outputTokenLimit,
} from "./configuration";
import { GoalError } from "@/lib/goals/service";
export function avenConfigured() {
  return avenConfigurationStatus(process.env).configured;
}
export function avenStatus() {
  return avenConfigurationStatus(process.env);
}
export function avenConfig(planning = false) {
  assertEnvironmentIsolation(process.env);
  const result = resolveAvenConfiguration(process.env);
  if (!result.success)
    throw new GoalError(avenStatus().code ?? "aiNotConfigured", 503);
  const value = result.data;
  const model = planning
    ? value.OPENAI_PLANNING_MODEL
    : value.OPENAI_CHAT_MODEL;
  return {
    key: value.OPENAI_API_KEY,
    model,
    reasoningEffort: isReasoningModel(model)
      ? planning
        ? value.OPENAI_PLANNING_REASONING_EFFORT
        : value.OPENAI_CHAT_REASONING_EFFORT
      : null,
    maxOutputTokens: outputTokenLimit(
      model,
      planning,
      value.AVEN_MAX_OUTPUT_TOKENS,
    ),
    inputPrice: planning
      ? value.OPENAI_PLANNING_INPUT_PRICE
      : value.OPENAI_CHAT_INPUT_PRICE,
    outputPrice: planning
      ? value.OPENAI_PLANNING_OUTPUT_PRICE
      : value.OPENAI_CHAT_OUTPUT_PRICE,
    dailyBudget: value.AVEN_DAILY_BUDGET_USD,
    monthlyBudget: value.AVEN_MONTHLY_BUDGET_USD,
    globalMonthlyBudget: value.AVEN_GLOBAL_MONTHLY_BUDGET_USD,
    dailyTokens: value.AVEN_DAILY_TOKEN_LIMIT,
    monthlyTokens: value.AVEN_MONTHLY_TOKEN_LIMIT,
  };
}
/** MAX_OUTPUT_TOKENS is the non-reasoning default; use avenConfig().maxOutputTokens for requests. */
export const MAX_TOOL_ROUNDS = 6,
  MAX_OUTPUT_TOKENS = 4096,
  // Static guidance (~8 KB) plus bounded memory, summary and reminder context (~9.5 KB) must fit.
  MAX_INSTRUCTION_BYTES = 24000,
  MAX_INPUT_BYTES = 24000;
