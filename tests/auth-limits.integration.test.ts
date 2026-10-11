import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { rateLimits } from "@/lib/db/schema";
import { authLimitKey, requestAuthLimit, reservePasswordReset, releasePasswordReset, resetLimitPrefix, RESET_WEEK_SECONDS } from "@/lib/auth/limits";

const enabled = Boolean(process.env.TEST_DATABASE_URL) && (process.env.TEST_DATABASE_ISOLATED === "true" || process.env.TEST_DATABASE_FIXTURES_ONLY === "true");
describe.skipIf(!enabled)("persistent account limits using only owned test rows", () => {
  const fixture = crypto.randomUUID();
  const identifiers = [`auth-fixture:${fixture}:counter`, `auth-fixture:${fixture}:concurrent`];
  const emails = ["concurrent", "expiry", "release", "independent"].map(name => `auth-limit-${fixture}-${name}@example.invalid`);
  const keys = [...identifiers.map(id => authLimitKey(id, 5, 3600)), ...emails.flatMap(email => [...Array.from({ length: 5 }, (_, i) => `${resetLimitPrefix(email)}:${i}`), `${resetLimitPrefix(email)}:guard`])];
  beforeAll(() => { process.env.DATABASE_URL = process.env.TEST_DATABASE_URL; });
  afterAll(async () => { await getDb().delete(rateLimits).where(inArray(rateLimits.key, keys)); });
  it("atomically allows five concurrent requests and blocks the sixth", async () => {
    const decisions = await Promise.all(Array.from({ length: 7 }, () => requestAuthLimit(identifiers[1], 5, 3600)));
    expect(decisions.filter(value => value === "allowed")).toHaveLength(5);
    expect(decisions.filter(value => value === "limited")).toHaveLength(2);
  }, 120000);
  it("shares an exact five-per-week quota across concurrent instances and email casing", async () => {
    const now = Date.now();
    const decisions = await Promise.all(Array.from({ length: 7 }, (_, index) => reservePasswordReset(index % 2 ? emails[0].toUpperCase() : emails[0], now)));
    expect(decisions.filter(value => value.decision === "allowed")).toHaveLength(5);
    expect(decisions.filter(value => value.decision === "limited")).toHaveLength(2);
    expect(decisions.find(value => value.decision === "limited")?.retryAt).toBe(new Date(now + RESET_WEEK_SECONDS * 1000).toISOString());
    expect((await reservePasswordReset(emails[3], now)).decision).toBe("allowed");
  }, 120000);
  it("restores a failed send's slot and frees slots after exactly seven days", async () => {
    const now = Date.now();
    const first = await reservePasswordReset(emails[2], now);
    await releasePasswordReset(first.reservation!);
    for (let index = 0; index < 5; index++) expect((await reservePasswordReset(emails[2], now)).decision).toBe("allowed");
    expect((await reservePasswordReset(emails[2], now)).decision).toBe("limited");
    expect((await reservePasswordReset(emails[2], now + RESET_WEEK_SECONDS * 1000)).decision).toBe("allowed");
  }, 120000);
});
