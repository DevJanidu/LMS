import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";

const fixture = {
  DATABASE_URL: "postgresql://fixture:fixture@ep-fixture-pooler.us-east-2.aws.neon.tech/app?sslmode=require",
  DATABASE_URL_UNPOOLED: "postgresql://fixture:fixture@ep-fixture.us-east-2.aws.neon.tech/app?sslmode=require",
  AUTH_SECRET: "production-fixture-secret-with-at-least-32-characters",
  CRON_SECRET: "production-fixture-cron-with-at-least-32-characters",
  APP_URL: "https://app.example.org",
  OBJECT_STORAGE_ENDPOINT: "https://storage.example.org",
  OBJECT_STORAGE_REGION: "us-east-2", OBJECT_STORAGE_BUCKET: "fixture",
  OBJECT_STORAGE_ACCESS_KEY_ID: "fixture-key", OBJECT_STORAGE_SECRET_ACCESS_KEY: "fixture-secret",
  UPSTASH_REDIS_REST_URL: "https://redis.example.org", UPSTASH_REDIS_REST_TOKEN: "fixture-token",
  CACHE_NAMESPACE: "production",
};

function run(overrides: Record<string, string>) {
  const directory = mkdtempSync(join(tmpdir(), "production-env-test-"));
  try {
    const file = join(directory, ".env.production");
    writeFileSync(file, Object.entries({ ...fixture, ...overrides }).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join("\n"));
    return spawnSync(process.execPath, ["scripts/check-production.mjs", `--env=${file}`], {
      encoding: "utf8", windowsHide: true,
      env: { ...process.env, APP_URL: "https://parent.example.org", UPSTASH_REDIS_REST_TOKEN: "parent-fixture-token" },
    });
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

it("validates a production file without printing credentials", () => {
  const result = run({});
  expect(result.status).toBe(0);
  expect(result.stdout).not.toContain(fixture.AUTH_SECRET);
  expect(result.stdout).not.toContain(fixture.DATABASE_URL);
  expect(result.stdout).not.toContain(fixture.UPSTASH_REDIS_REST_TOKEN);
});

it("rejects missing production values even when the parent process supplies them", () => {
  const result = run({ APP_URL: "", UPSTASH_REDIS_REST_TOKEN: "" });
  expect(result.status).toBe(1);
  expect(result.stdout).toContain('"check":"environment_schema","ok":false');
});

it("rejects a localhost origin and development cache namespace", () => {
  const result = run({ APP_URL: "http://localhost:3000", CACHE_NAMESPACE: "development" });
  expect(result.status).toBe(1);
  expect(result.stdout).toContain('"check":"production_origin","ok":false');
  expect(result.stdout).toContain('"check":"cache_namespace","ok":false');
});
