import { describe, expect, it } from "vitest";
import {
  autoEffort,
  effortFor,
  modelOptions,
  modelRegistry,
  modesFor,
  nearestEffort,
  resolveModelChoice,
  VERIFIED_CAPABILITIES,
} from "@/lib/aven/models";
import { normalizeSettings } from "@/components/aven/useModelSettings";
import { createLatencyTimer, percentile } from "@/lib/aven/latency";
import { aiPreferenceSchema, chatSchema, preferenceMutationSchema } from "@/lib/aven/validation";

const env = {};
const turn = { planning: false, presentation: false, multiPart: false };
describe("model registry", () => {
  it("maps display names to verified API models with their real capabilities and prices", () => {
    const [sol, luna] = modelRegistry(env);
    expect(sol).toMatchObject({ key: "sol", label: "GPT-6.1 Sol", apiModel: "gpt-6.1-sol", verbosity: true, prices: { input: 2, cachedInput: 0.1, output: 10 } });
    expect(sol.efforts).toEqual(["low", "medium", "high", "xhigh", "max"]);
    expect(luna).toMatchObject({ key: "luna", label: "GPT-6 Luna", apiModel: "gpt-6-luna", prices: { input: 0.1, cachedInput: 0.01, output: 0.5 } });
    expect(luna.efforts[0]).toBe("none");
  });
  it("uses configured model ids and treats unknown models conservatively", () => {
    const [sol] = modelRegistry({ AVEN_SOL_MODEL: "gpt-7-experimental" });
    expect(sol).toMatchObject({ apiModel: "gpt-7-experimental", efforts: ["low", "medium", "high"], verbosity: false, prices: null });
    const priced = modelRegistry({ AVEN_SOL_MODEL: "gpt-7-experimental", AVEN_SOL_INPUT_PRICE: "3", AVEN_SOL_OUTPUT_PRICE: "12" })[0];
    expect(priced.prices).toEqual({ input: 3, output: 12, cachedInput: 3 });
    // Luna follows the operator's existing chat model setting when no Aven-specific one exists.
    expect(modelRegistry({ OPENAI_CHAT_MODEL: "gpt-6-luna" })[1].apiModel).toBe("gpt-6-luna");
  });
  it("offers only reasoning modes a model can honour", () => {
    expect(modesFor(VERIFIED_CAPABILITIES["gpt-6.1-sol"].efforts)).toEqual(["auto", "quick", "balanced", "deep", "extended"]);
    expect(modesFor(["low", "medium", "high"])).toEqual(["auto", "quick", "balanced", "deep"]);
  });
  it("marks unpriced or plan-excluded models unavailable, without exposing prices", () => {
    const options = modelOptions({ AVEN_SOL_MODEL: "gpt-7-experimental" }, ["luna"]);
    expect(options[0]).toMatchObject({ key: "sol", available: false, unavailableReason: "notConfigured" });
    expect(options[1]).toMatchObject({ key: "luna", available: true, recommended: false });
    expect(modelOptions(env, ["luna"])[0]).toMatchObject({ available: false, unavailableReason: "plan", recommended: true });
    expect(JSON.stringify(options)).not.toMatch(/price|key"?:\s*"sk-/i);
  });
});
describe("reasoning and detail mapping", () => {
  it("maps each mode to a real effort for the selected model", () => {
    const sol = VERIFIED_CAPABILITIES["gpt-6.1-sol"].efforts,
      luna = VERIFIED_CAPABILITIES["gpt-6-luna"].efforts;
    expect(effortFor("quick", sol, "none")).toBe("low");
    expect(effortFor("quick", luna, "none")).toBe("none");
    expect(effortFor("balanced", sol, "none")).toBe("medium");
    expect(effortFor("deep", luna, "none")).toBe("high");
    expect(effortFor("extended", sol, "none")).toBe("xhigh");
    expect(effortFor("extended", ["low", "medium", "high"], "none")).toBeNull();
    // Auto targets "none" for a greeting; Sol's lightest real value is "low".
    expect(effortFor("auto", sol, "none")).toBe("low");
    expect(nearestEffort("xhigh", ["low", "medium", "high"])).toBe("high");
  });
  it("chooses Auto effort cheaply and deterministically from the request", () => {
    expect(autoEffort("hi!", turn)).toBe("none");
    expect(autoEffort("Create a checklist for Java", { ...turn, presentation: true })).toBe("low");
    expect(autoEffort("Explain Java inheritance with an example", turn)).toBe("medium");
    expect(autoEffort("Why does my code throw a NullPointerException in this loop?", turn)).toBe("high");
    expect(autoEffort("Plan my semester", { ...turn, planning: true })).toBe("high");
  });
  it("resolves settings into exact API parameters or a clear refusal, never a silent swap", () => {
    const choice = resolveModelChoice(env, { model: "luna", reasoning: "deep", detail: "concise" }, { allowed: null, auto: "medium" });
    expect(choice).toMatchObject({ key: "luna", label: "GPT-6 Luna", apiModel: "gpt-6-luna", effort: "high", verbosity: "low", detail: "concise" });
    expect(resolveModelChoice(env, { model: "sol", reasoning: "auto", detail: "detailed" }, { allowed: null, auto: "medium" })).toMatchObject({ apiModel: "gpt-6.1-sol", effort: "medium", verbosity: "high" });
    expect(resolveModelChoice(env, { model: "sol", reasoning: "auto", detail: "balanced" }, { allowed: ["luna"], auto: "low" })).toEqual({ error: "modelUnavailable" });
    expect(resolveModelChoice({ AVEN_SOL_MODEL: "gpt-7-x", AVEN_SOL_INPUT_PRICE: "1", AVEN_SOL_OUTPUT_PRICE: "2" }, { model: "sol", reasoning: "extended", detail: "balanced" }, { allowed: null, auto: "low" })).toEqual({ error: "reasoningUnsupported" });
  });
  it("keeps the client from selecting an unavailable model or unsupported mode", () => {
    const options = modelOptions({ AVEN_SOL_MODEL: "gpt-7-x" }, null);
    expect(normalizeSettings({ model: "sol", reasoning: "extended", detail: "balanced", interactive: true }, options)).toMatchObject({ model: "luna", reasoning: "extended" });
    const restricted = modelOptions({ AVEN_LUNA_MODEL: "gpt-7-y", AVEN_LUNA_INPUT_PRICE: "1", AVEN_LUNA_OUTPUT_PRICE: "1" }, null);
    expect(normalizeSettings({ model: "luna", reasoning: "extended", detail: "balanced", interactive: true }, restricted)).toMatchObject({ model: "luna", reasoning: "auto" });
  });
});
describe("validation", () => {
  it("accepts only known keys from the browser", () => {
    const base = { conversationId: null, requestId: crypto.randomUUID(), goalId: null, message: "Hi" };
    expect(chatSchema.safeParse({ ...base, model: "sol", reasoning: "deep", detail: "concise", interactive: false }).success).toBe(true);
    expect(chatSchema.safeParse({ ...base, model: "gpt-4o" }).success).toBe(false);
    expect(chatSchema.safeParse({ ...base, reasoning: "max" }).success).toBe(false);
    expect(preferenceMutationSchema.safeParse({ kind: "modelSettings", model: "luna", reasoning: "auto", detail: "detailed", interactive: true }).success).toBe(true);
  });
  it("gives existing preference rows safe defaults and repairs invalid saved values", () => {
    expect(aiPreferenceSchema.parse({})).toMatchObject({ model: "sol", reasoning: "auto", detail: "balanced", interactive: true });
    expect(aiPreferenceSchema.parse({ model: "retired-model", reasoning: "warp" })).toMatchObject({ model: "sol", reasoning: "auto" });
  });
});
describe("latency instrumentation", () => {
  it("records first occurrences, step durations and accumulated stages", async () => {
    let now = 0;
    const timer = createLatencyTimer(() => now);
    now = 5;
    timer.mark("prepared");
    now = 9;
    timer.mark("prepared");
    await timer.time("context", async () => {
      now = 12;
    });
    timer.add("providerMs", 3);
    timer.add("providerMs", 4);
    expect(timer.marks).toEqual({ prepared: 5, contextMs: 3, providerMs: 7 });
    expect(percentile([5, 1, 9, 3, 7], 50)).toBe(5);
    expect(percentile([5, 1, 9, 3, 7], 95)).toBe(9);
  });
});
describe("usage cost", async () => {
  const { usageCostMicros } = await import("@/lib/aven/usage");
  it("bills cached input at the cached price, using the answering model's prices", () => {
    const sol = { inputPrice: 2, cachedInputPrice: 0.1, outputPrice: 10 };
    // 4,000 input (3,000 cached) + 500 output on Sol: 1,000×2 + 3,000×0.1 + 500×10 µ$.
    expect(usageCostMicros(sol, 4000, 500, 3000)).toBe(7300);
    expect(usageCostMicros(sol, 4000, 500)).toBe(13000);
    expect(usageCostMicros({ inputPrice: 0.1, cachedInputPrice: 0.01, outputPrice: 0.5 }, 4000, 500, 3000)).toBe(380);
    // Cached tokens can never exceed input tokens.
    expect(usageCostMicros(sol, 100, 0, 999)).toBe(10);
  });
});
