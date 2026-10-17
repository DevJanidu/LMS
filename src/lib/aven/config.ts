import "server-only";
import { assertEnvironmentIsolation } from "@/lib/deployment-policy.mjs";
import {
  resolveAvenConfiguration,
  avenConfigurationStatus,
  isReasoningModel,
  outputTokenLimit,
  providerUrl,
} from "./configuration";
import { GoalError } from "@/lib/goals/service";
import type { ModelChoice } from "./models";
export function avenConfigured() {
  return avenConfigurationStatus(process.env).configured;
}
export function avenStatus() {
  return avenConfigurationStatus(process.env);
}
/**
 * Provider settings for one request. With a `choice` (the student's resolved model and
 * reasoning settings, see models.ts) those exact values are used; without one, the
 * operator-configured chat/planning models apply (documents, background jobs).
 */
export function avenConfig(planning = false, choice?: ModelChoice) {
  assertEnvironmentIsolation(process.env);
  const result = resolveAvenConfiguration(process.env);
  if (!result.success)
    throw new GoalError(avenStatus().code ?? "aiNotConfigured", 503);
  const value = result.data;
  const model =
    choice?.apiModel ??
    (planning ? value.OPENAI_PLANNING_MODEL : value.OPENAI_CHAT_MODEL);
  const inputPrice =
    choice?.prices.input ??
    (planning ? value.OPENAI_PLANNING_INPUT_PRICE : value.OPENAI_CHAT_INPUT_PRICE);
  return {
    key: value.OPENAI_API_KEY,
    url: providerUrl(process.env),
    model,
    reasoningEffort: choice
      ? choice.effort
      : isReasoningModel(model)
        ? planning
          ? value.OPENAI_PLANNING_REASONING_EFFORT
          : value.OPENAI_CHAT_REASONING_EFFORT
        : null,
    verbosity: choice?.verbosity ?? null,
    maxOutputTokens: outputTokenLimit(
      model,
      planning,
      value.AVEN_MAX_OUTPUT_TOKENS,
    ),
    inputPrice,
    /** Cached input is billed at a fraction of the input price. */
    cachedInputPrice: choice?.prices.cachedInput ?? inputPrice,
    outputPrice:
      choice?.prices.output ??
      (planning ? value.OPENAI_PLANNING_OUTPUT_PRICE : value.OPENAI_CHAT_OUTPUT_PRICE),
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
