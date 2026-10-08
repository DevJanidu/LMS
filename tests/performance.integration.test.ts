import { expect, it, vi } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import nextEnv from "@next/env";
vi.mock("next/server", () => ({ after: () => undefined }));
vi.mock("next-intl/server", () => ({ getLocale: async () => "en" }));
vi.mock("@/i18n/navigation", () => ({ redirect: () => { throw new Error("unauthorized"); } }));
it.skipIf(process.env.RUN_AUDIT_PERFORMANCE !== "true")("measures three current-database fixture workspace loads without logging learner data", async () => {
  nextEnv.loadEnvConfig(process.cwd());
  const fixture = JSON.parse(readFileSync(".audit-local/fixtures.json", "utf8")) as { users: { id: string }[] };
  const { loadWorkspace } = await import("@/lib/services/workspace");
  const { queryCount } = await import("@/lib/db/metrics");
  const { cacheCounts } = await import("@/lib/cache");
  const results = [];
  for (let index = 0; index < 3; index++) {
    const before = queryCount(), start = performance.now();
    const data = await loadWorkspace(fixture.users[0].id);
    expect(data.analytics?.sessionCount).toBeGreaterThanOrEqual(1095);
    results.push({ run: index + 1, serverMs: Math.round(performance.now() - start), queryCount: queryCount() - before });
  }
  const report = { conditions: "Current database, audit fixture only, service loader outside a React request; includes live actor read. Three sequential loads; not an HTTP/dashboard paint test.", results, cache: cacheCounts() };
  writeFileSync("docs/SERVICE_METRICS.json", JSON.stringify(report, null, 2));
  console.info(JSON.stringify(report));
}, 120000);
