import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ configured: true, limit: vi.fn() }));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ UPSTASH_REDIS_REST_URL: mocks.configured ? "https://redis.example.com" : undefined, UPSTASH_REDIS_REST_TOKEN: mocks.configured ? "test" : undefined }) }));
vi.mock("@/lib/cache", () => ({ getRedis: () => undefined, rateLimitPrefix: () => "lms:security:v1:test" }));
vi.mock("@upstash/redis", () => ({ Redis: class {} }));
vi.mock("@upstash/ratelimit", () => ({ Ratelimit: class { static slidingWindow = vi.fn(); limit = mocks.limit; } }));
beforeEach(() => { vi.resetModules(); vi.unstubAllEnvs(); mocks.configured = true; mocks.limit.mockReset(); });
it("denies SDK fail-open timeout results and Redis exceptions", async () => {
  const { allowRequest } = await import("@/lib/rate-limit");
  mocks.limit.mockResolvedValue({ success: true, reason: "timeout" });
  expect(await allowRequest("login:test")).toBe(false);
  mocks.limit.mockRejectedValue(new Error("redis offline"));
  expect(await allowRequest("login:test")).toBe(false);
  mocks.limit.mockResolvedValue({ success: true });
  expect(await allowRequest("login:test")).toBe(true);
});
it("separates infrastructure outages from actual rate limits", async () => {
  const { requestLimit } = await import("@/lib/rate-limit");
  mocks.limit.mockResolvedValue({ success: true, reason: "timeout" });
  expect(await requestLimit("test")).toBe("unavailable");
  mocks.limit.mockResolvedValue({ success: false, reason: "rateLimit" });
  expect(await requestLimit("test")).toBe("limited");
  mocks.limit.mockResolvedValue({ success: true });
  expect(await requestLimit("test")).toBe("allowed");
});
it("retries only an unavailable security decision and honors a denial on retry", async () => {
  const { requestLimit } = await import("@/lib/rate-limit");
  mocks.limit.mockResolvedValueOnce({ success: true, reason: "timeout" }).mockResolvedValueOnce({ success: true });
  expect(await requestLimit("recover")).toBe("allowed"); expect(mocks.limit).toHaveBeenCalledTimes(2);
  mocks.limit.mockReset().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ success: false });
  expect(await requestLimit("deny")).toBe("limited"); expect(mocks.limit).toHaveBeenCalledTimes(2);
});
it("permits the memory fallback only in development", async () => {
  mocks.configured = false;
  const { allowRequest } = await import("@/lib/rate-limit");
  vi.stubEnv("NODE_ENV", "production"); expect(await allowRequest("login:test")).toBe(false);
  vi.stubEnv("NODE_ENV", "test"); expect(await allowRequest("login:test")).toBe(false);
  vi.stubEnv("NODE_ENV", "development");
  expect(await allowRequest("login:test", 1)).toBe(true);
  expect(await allowRequest("login:test", 1)).toBe(false);
});
