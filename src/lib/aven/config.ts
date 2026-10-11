import "server-only";
import {
  resolveAvenConfiguration,
  avenConfigurationStatus,
} from "./configuration";
import { GoalError } from "@/lib/goals/service";
export function avenConfigured() {
  return avenConfigurationStatus(process.env).configured;
}
export function avenStatus() {
  return avenConfigurationStatus(process.env);
}
export function avenConfig(planning = false) {
  const result = resolveAvenConfiguration(process.env);
  if (!result.success)
    throw new GoalError(avenStatus().code ?? "aiNotConfigured", 503);
  const value = result.data;
  return {
    key: value.OPENAI_API_KEY,
    model: planning ? value.OPENAI_PLANNING_MODEL : value.OPENAI_CHAT_MODEL,
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
export const MAX_TOOL_ROUNDS = 6,
  MAX_OUTPUT_TOKENS = 4096,
  MAX_INSTRUCTION_BYTES = 16000,
  MAX_INPUT_BYTES = 24000;
