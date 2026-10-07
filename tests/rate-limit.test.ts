import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ configured: true, limit: vi.fn() }));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ UPSTASH_REDIS_REST_URL: mocks.configured ? "https://redis.example.com" : undefined, UPSTASH_REDIS_REST_TOKEN: mocks.configured ? "test" : undefined }) }));
vi.mock("@/lib/cache", () => ({ getRedis: () => undefined, cachePrefix: () => "lms:v1:test" }));
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
it("permits the memory fallback only in development", async () => {
  mocks.configured = false;
  const { allowRequest } = await import("@/lib/rate-limit");
  vi.stubEnv("NODE_ENV", "production"); expect(await allowRequest("login:test")).toBe(false);
  vi.stubEnv("NODE_ENV", "test"); expect(await allowRequest("login:test")).toBe(false);
  vi.stubEnv("NODE_ENV", "development");
  expect(await allowRequest("login:test", 1)).toBe(true);
  expect(await allowRequest("login:test", 1)).toBe(false);
});
