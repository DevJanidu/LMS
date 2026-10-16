import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { rateLimits } from "@/lib/db/schema";
import { authLimitKey, requestAuthLimit } from "@/lib/auth/limits";

const enabled = Boolean(process.env.TEST_DATABASE_URL) && (process.env.TEST_DATABASE_ISOLATED === "true" || process.env.TEST_DATABASE_FIXTURES_ONLY === "true");
describe.skipIf(!enabled)("persistent auth route limits using only owned test rows", () => {
  const fixture = crypto.randomUUID();
  const identifiers = [`auth-fixture:${fixture}:counter`, `auth-fixture:${fixture}:concurrent`];
  const keys = identifiers.map(id => authLimitKey(id, 5, 3600));
  beforeAll(() => { process.env.DATABASE_URL = process.env.TEST_DATABASE_URL; });
  afterAll(async () => { await getDb().delete(rateLimits).where(inArray(rateLimits.key, keys)); });
  it("atomically allows five concurrent requests and blocks the sixth", async () => {
    const decisions = await Promise.all(Array.from({ length: 7 }, () => requestAuthLimit(identifiers[1], 5, 3600)));
    expect(decisions.filter(value => value === "allowed")).toHaveLength(5);
    expect(decisions.filter(value => value === "limited")).toHaveLength(2);
  }, 120000);
});
