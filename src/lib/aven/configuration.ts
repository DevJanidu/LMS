import { z } from "zod";

/** USD per 1M tokens from OpenAI's model pages (gpt-6-luna verified 2026-10-12). */
const knownPrices: Record<string, { input: number; output: number }> = {
  "gpt-6-luna": { input: 0.1, output: 0.5 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1-mini-2025-04-14": { input: 0.4, output: 1.6 },
  "gpt-4.1": { input: 2, output: 8 },
  "gpt-4.1-2025-04-14": { input: 2, output: 8 },
};
const price = z.coerce.number().positive().max(1000);
export const DEFAULT_MODEL = "gpt-6-luna";
const effort = z.enum(["none", "low", "medium", "high", "xhigh", "max"]);
export type ReasoningEffort = z.infer<typeof effort>;
/** Reasoning models spend output tokens on hidden reasoning and accept `reasoning.effort`. */
export const isReasoningModel = (model: string) =>
  /^(gpt-[5-9]|od)/i.test(model);
const schema = z.object({
  OPENAI_API_KEY: z.string().trim().min(1),
  OPENAI_CHAT_MODEL: z.string().trim().min(1),
  OPENAI_PLANNING_MODEL: z.string().trim().min(1),
  OPENAI_CHAT_INPUT_PRICE: price,
  OPENAI_CHAT_OUTPUT_PRICE: price,
  OPENAI_PLANNING_INPUT_PRICE: price,
  OPENAI_PLANNING_OUTPUT_PRICE: price,
  AVEN_DAILY_BUDGET_USD: z.coerce.number().min(0).max(100).default(0),
  AVEN_MONTHLY_BUDGET_USD: z.coerce.number().positive().max(1000).default(5),
  AVEN_GLOBAL_MONTHLY_BUDGET_USD: z.coerce
    .number()
    .positive()
    .max(1000)
    .default(5),
  AVEN_DAILY_TOKEN_LIMIT: z.coerce.number().int().min(0).default(0),
  AVEN_MONTHLY_TOKEN_LIMIT: z.coerce.number().int().min(0).default(0),
  OPENAI_CHAT_REASONING_EFFORT: effort.default("low"),
  OPENAI_PLANNING_REASONING_EFFORT: effort.default("medium"),
  AVEN_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(1024).max(128000).optional(),
});

/** Pure resolver shared with the operator check; never return credentials to clients. */
export function resolveAvenConfiguration(
  env: Record<string, string | undefined>,
) {
  const value: Record<string, string | number | undefined> = {};
  for (const [key, entry] of Object.entries(env)) {
    if (entry?.trim()) value[key] = entry.trim();
  }
  const chat = String(value.OPENAI_CHAT_MODEL ?? DEFAULT_MODEL);
  const planning = String(value.OPENAI_PLANNING_MODEL ?? DEFAULT_MODEL);
  return schema.safeParse({
    ...value,
    OPENAI_CHAT_MODEL: chat,
    OPENAI_PLANNING_MODEL: planning,
    OPENAI_CHAT_INPUT_PRICE:
      value.OPENAI_CHAT_INPUT_PRICE ?? knownPrices[chat]?.input,
    OPENAI_CHAT_OUTPUT_PRICE:
      value.OPENAI_CHAT_OUTPUT_PRICE ?? knownPrices[chat]?.output,
    OPENAI_PLANNING_INPUT_PRICE:
      value.OPENAI_PLANNING_INPUT_PRICE ?? knownPrices[planning]?.input,
    OPENAI_PLANNING_OUTPUT_PRICE:
      value.OPENAI_PLANNING_OUTPUT_PRICE ?? knownPrices[planning]?.output,
  });
}

export function avenConfigurationStatus(
  env: Record<string, string | undefined>,
) {
  const result = resolveAvenConfiguration(env);
  return result.success
    ? { configured: true as const, code: null, fields: [] as string[] }
    : {
        configured: false as const,
        code: !env.OPENAI_API_KEY?.trim()
          ? ("aiKeyMissing" as const)
          : ("aiConfigurationInvalid" as const),
        fields: [
          ...new Set(result.error.issues.map((issue) => String(issue.path[0]))),
        ],
      };
}

/** Output budget per provider request. Reasoning tokens count toward it, so reasoning models need headroom. */
export function outputTokenLimit(
  model: string,
  planning: boolean,
  override?: number,
) {
  if (override) return override;
  if (!isReasoningModel(model)) return 4096;
  return planning ? 25000 : 12000;
}
