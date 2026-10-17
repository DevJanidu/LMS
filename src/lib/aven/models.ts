import {
  EFFORTS,
  MODEL_KEYS,
  type DetailLevel,
  type Effort,
  type ModelKey,
  type ModelOption,
  type ReasoningMode,
} from "./model-options";
/**
 * Server-side model registry. Display names map to API model IDs from configuration, and
 * each API model's supported parameters come from a capability table verified against the
 * OpenAI API. A model whose capabilities are unknown gets a conservative profile, and a
 * model without a known or configured price is unavailable (budgets could not be enforced).
 */
export const CAPABILITIES_VERIFIED_AT = "2026-10-18";
interface Capability {
  efforts: readonly Effort[];
  verbosity: boolean;
  /** Standard-tier USD per 1M tokens (developers.openai.com/api/docs/pricing). */
  prices: { input: number; cachedInput: number; output: number };
}
/**
 * Verified with live requests: rejected efforts return 400 `unsupported_value` naming the
 * supported set; verbosity, streaming, strict tools and prompt_cache_key were accepted.
 */
export const VERIFIED_CAPABILITIES: Record<string, Capability> = {
  "gpt-6.1-sol": {
    efforts: ["low", "medium", "high", "xhigh", "max"],
    verbosity: true,
    prices: { input: 2, cachedInput: 0.1, output: 10 },
  },
  "gpt-6-luna": {
    efforts: ["none", "low", "medium", "high", "xhigh", "max"],
    verbosity: true,
    prices: { input: 0.1, cachedInput: 0.01, output: 0.5 },
  },
};
const CONSERVATIVE_EFFORTS: readonly Effort[] = ["low", "medium", "high"];
const descriptions: Record<ModelKey, { label: string; description: string }> = {
  sol: {
    label: "GPT-6.1 Sol",
    description: "Advanced reasoning for tutoring, problem-solving and complex study planning.",
  },
  luna: {
    label: "GPT-6 Luna",
    description: "Fast and efficient for everyday questions, checklists and summaries.",
  },
};
export interface ResolvedModel {
  key: ModelKey;
  label: string;
  description: string;
  apiModel: string;
  efforts: readonly Effort[];
  verbosity: boolean;
  prices: Capability["prices"] | null;
}
type Env = Record<string, string | undefined>;
const price = (raw: string | undefined) => {
  const value = Number(raw);
  return raw?.trim() && Number.isFinite(value) && value > 0 && value <= 1000 ? value : null;
};
export function modelRegistry(env: Env): ResolvedModel[] {
  const apiModels: Record<ModelKey, string> = {
    sol: env.AVEN_SOL_MODEL?.trim() || "gpt-6.1-sol",
    luna: env.AVEN_LUNA_MODEL?.trim() || env.OPENAI_CHAT_MODEL?.trim() || "gpt-6-luna",
  };
  return MODEL_KEYS.map((key) => {
    const apiModel = apiModels[key],
      known = VERIFIED_CAPABILITIES[apiModel];
    const prefix = `AVEN_${key.toUpperCase()}`;
    const input = price(env[`${prefix}_INPUT_PRICE`]) ?? known?.prices.input ?? null,
      output = price(env[`${prefix}_OUTPUT_PRICE`]) ?? known?.prices.output ?? null;
    return {
      key,
      ...descriptions[key],
      apiModel,
      efforts: known?.efforts ?? CONSERVATIVE_EFFORTS,
      verbosity: known?.verbosity ?? false,
      prices:
        input && output
          ? { input, output, cachedInput: price(env[`${prefix}_CACHED_INPUT_PRICE`]) ?? known?.prices.cachedInput ?? input }
          : null,
    };
  });
}
/** Reasoning modes a model can honour with a real API value. */
export function modesFor(efforts: readonly Effort[]): ReasoningMode[] {
  return [
    "auto",
    "quick",
    ...(efforts.includes("medium") ? (["balanced"] as const) : []),
    ...(efforts.includes("high") ? (["deep"] as const) : []),
    ...(efforts.includes("xhigh") ? (["extended"] as const) : []),
  ];
}
/** The closest supported effort to a target (ties go to the lighter, cheaper effort). */
export function nearestEffort(target: Effort, efforts: readonly Effort[]): Effort {
  if (efforts.includes(target)) return target;
  const index = EFFORTS.indexOf(target);
  return [...efforts].sort(
    (a, b) => Math.abs(EFFORTS.indexOf(a) - index) - Math.abs(EFFORTS.indexOf(b) - index) || EFFORTS.indexOf(a) - EFFORTS.indexOf(b),
  )[0];
}
const GREETING = /^(hi|hello|hey|thanks|thank you|ok(ay)?|good (morning|afternoon|evening)|yo)\b[\s!.,]*$/i;
const COMPLEX =
  /\b(debug|stack ?trace|exception|error|bug|optimi[sz]e|complexity|prove|proof|derive|algorithm|refactor|architecture|trade-?offs?|compare|why does|multi-?week|semester|exam (prep|plan)|struggling)\b/i;
const EXPLAIN = /\b(explain|how|why|what is|what are|teach|difference|example)\b/i;
/**
 * Auto reasoning: a cheap, deterministic choice (no extra model call). Greetings get the
 * lightest effort, simple blocks and short requests a light one, explanations a balanced
 * one, and planning, debugging or multi-part requests a deep one. Extended is never
 * chosen automatically; students opt into it.
 */
export function autoEffort(message: string, turn: { planning: boolean; presentation: boolean; multiPart: boolean }): Effort {
  const text = message.trim();
  if (GREETING.test(text)) return "none";
  if (turn.planning || turn.multiPart || COMPLEX.test(text)) return "high";
  if (EXPLAIN.test(text)) return "medium";
  if (turn.presentation || text.length < 80) return "low";
  return "medium";
}
export function effortFor(mode: ReasoningMode, efforts: readonly Effort[], auto: Effort): Effort | null {
  if (mode === "auto") return nearestEffort(auto, efforts);
  if (mode === "quick") return efforts[0];
  if (mode === "balanced") return efforts.includes("medium") ? "medium" : null;
  if (mode === "deep") return efforts.includes("high") ? "high" : null;
  return efforts.includes("xhigh") ? "xhigh" : null;
}
export const VERBOSITY: Record<DetailLevel, "low" | "medium" | "high"> = {
  concise: "low",
  balanced: "medium",
  detailed: "high",
};
/** How a detail level shapes the answer; separate from how much the model reasons. */
export const DETAIL_GUIDANCE: Record<DetailLevel, string> = {
  concise: "\nResponse detail: concise. Answer directly in as few words as clarity allows; one short example at most; skip optional background.",
  balanced: "\nResponse detail: balanced. Explain clearly with a relevant example and a simple structure; use an interactive block only when it helps.",
  detailed: "\nResponse detail: detailed. Teach step by step with several examples, add a diagram when it clarifies a system or process, and end with one or two practice questions.",
};
/** What the browser may know about each model: no prices or credentials. */
export function modelOptions(env: Env, allowed: readonly ModelKey[] | null): ModelOption[] {
  return modelRegistry(env).map((model) => {
    const unavailableReason = !model.prices ? ("notConfigured" as const) : allowed && !allowed.includes(model.key) ? ("plan" as const) : null;
    return {
      key: model.key,
      label: model.label,
      description: model.description,
      recommended: model.key === "sol",
      apiModel: model.apiModel,
      available: unavailableReason === null,
      unavailableReason,
      modes: modesFor(model.efforts),
    };
  });
}
export interface ModelChoice {
  key: ModelKey;
  label: string;
  apiModel: string;
  mode: ReasoningMode;
  effort: Effort;
  verbosity: "low" | "medium" | "high" | null;
  detail: DetailLevel;
  prices: Capability["prices"];
}
/**
 * Resolves a student's settings into exact API parameters, or explains why it cannot:
 * `modelUnavailable` (not configured or not in the plan) or `reasoningUnsupported`.
 * Nothing is silently substituted: the label always names the model that is called.
 */
export function resolveModelChoice(
  env: Env,
  settings: { model: ModelKey; reasoning: ReasoningMode; detail: DetailLevel },
  context: { allowed: readonly ModelKey[] | null; auto: Effort },
): ModelChoice | { error: "modelUnavailable" | "reasoningUnsupported" } {
  const model = modelRegistry(env).find((item) => item.key === settings.model);
  if (!model?.prices || (context.allowed && !context.allowed.includes(model.key))) return { error: "modelUnavailable" };
  const effort = effortFor(settings.reasoning, model.efforts, context.auto);
  if (!effort) return { error: "reasoningUnsupported" };
  return {
    key: model.key,
    label: model.label,
    apiModel: model.apiModel,
    mode: settings.reasoning,
    effort,
    verbosity: model.verbosity ? VERBOSITY[settings.detail] : null,
    detail: settings.detail,
    prices: model.prices,
  };
}
