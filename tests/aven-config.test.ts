import { expect, it } from "vitest";
import {
  avenConfigurationStatus,
  resolveAvenConfiguration,
} from "@/lib/aven/configuration";
import {
  providerErrorCode,
  readProviderFailure,
} from "@/lib/aven/provider-errors";

it("enables the documented default models with only a private API key", () => {
  const result = resolveAvenConfiguration({ OPENAI_API_KEY: " fixture-key " });
  expect(result.success).toBe(true);
  if (!result.success) return;
  expect(result.data.OPENAI_API_KEY).toBe("fixture-key");
  expect(result.data.OPENAI_CHAT_MODEL).toBe("gpt-4.1-mini");
  expect(result.data.OPENAI_PLANNING_MODEL).toBe("gpt-4.1-mini");
  expect(result.data.OPENAI_CHAT_INPUT_PRICE).toBe(0.4);
  expect(result.data.OPENAI_PLANNING_OUTPUT_PRICE).toBe(1.6);
});
it("normalizes empty optional env values but never invents a missing API key", () => {
  expect(avenConfigurationStatus({ OPENAI_API_KEY: " " }).code).toBe(
    "aiKeyMissing",
  );
  expect(
    avenConfigurationStatus({
      OPENAI_API_KEY: "fixture",
      OPENAI_CHAT_MODEL: "",
      AVEN_DAILY_BUDGET_USD: "",
    }).configured,
  ).toBe(true);
});
it("requires explicit pricing for custom models and rejects invalid budget settings", () => {
  const env = { OPENAI_API_KEY: "fixture", OPENAI_CHAT_MODEL: "custom-model" };
  expect(avenConfigurationStatus(env).fields).toEqual([
    "OPENAI_CHAT_INPUT_PRICE",
    "OPENAI_CHAT_OUTPUT_PRICE",
  ]);
  expect(
    avenConfigurationStatus({
      ...env,
      OPENAI_CHAT_INPUT_PRICE: "2",
      OPENAI_CHAT_OUTPUT_PRICE: "8",
    }).configured,
  ).toBe(true);
  expect(
    avenConfigurationStatus({
      OPENAI_API_KEY: "fixture",
      AVEN_DAILY_BUDGET_USD: "-1",
    }).code,
  ).toBe("aiConfigurationInvalid");
});
it("configuration diagnostics never expose the API key", () => {
  const status = avenConfigurationStatus({
    OPENAI_API_KEY: "private-fixture-value",
    OPENAI_CHAT_INPUT_PRICE: "invalid",
  });
  expect(JSON.stringify(status)).not.toContain("private-fixture-value");
});
it("distinguishes authentication, quota, model access and transient provider failures", async () => {
  expect(providerErrorCode(401)).toBe("aiKeyInvalid");
  expect(providerErrorCode(403)).toBe("aiAccessDenied");
  expect(providerErrorCode(404)).toBe("aiModelUnavailable");
  expect(providerErrorCode(429, "insufficient_quota")).toBe("aiQuotaExceeded");
  expect(providerErrorCode(429)).toBe("aiRateLimited");
  expect(providerErrorCode(400)).toBe("aiRequestInvalid");
  expect(providerErrorCode(503)).toBe("aiUnavailable");
  expect(
    await readProviderFailure(
      Response.json(
        { error: { code: "insufficient_quota", message: "private contents" } },
        { status: 429 },
      ),
    ),
  ).toBe("aiQuotaExceeded");
});
