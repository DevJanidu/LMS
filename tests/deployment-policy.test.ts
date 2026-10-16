import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { assertEnvironmentIsolation, deploymentEnvironment, nonproductionJobsAllowed } from "@/lib/deployment-policy.mjs";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const identities = {
  verifiedCommit: "fixture", productionDatabaseHost: hash("ep-production.neon.example"),
  productionStorageHost: hash("production.storage.example"), productionRedisHost: hash("production.redis.example"),
  productionOrigin: "https://production.example",
};
const development = {
  APP_ENV: "development", ENVIRONMENT_ISOLATED: "true", CACHE_NAMESPACE: "development",
  DATABASE_URL: "postgresql://fixture:fixture@ep-development-pooler.neon.example/app",
  OBJECT_STORAGE_ENDPOINT: "https://development.storage.example", APP_URL: "http://localhost:3000",
};

it("blocks pooled, direct and test URLs pointing to production before connecting", () => {
  for (const key of ["DATABASE_URL", "DATABASE_URL_UNPOOLED", "TEST_DATABASE_URL"]) {
    for (const hostname of ["ep-production.neon.example", "ep-production-pooler.neon.example"]) {
      const env = { ...development, [key]: `postgresql://fixture:fixture@${hostname}/app` };
      expect(() => assertEnvironmentIsolation(env, identities)).toThrow(key);
    }
  }
});
it("blocks production storage, aliases, Redis and the live origin", () => {
  for (const [key, value] of [
    ["OBJECT_STORAGE_ENDPOINT", "https://production.storage.example"],
    ["AWS_ENDPOINT_URL_S3", "https://production.storage.example"],
    ["UPSTASH_REDIS_REST_URL", "https://production.redis.example"],
    ["APP_URL", "https://production.example"],
  ]) expect(() => assertEnvironmentIsolation({ ...development, [key]: value }, identities)).toThrow();
});
it("requires isolated credentials and prevents namespace mismatches", () => {
  expect(() => assertEnvironmentIsolation({ ...development, ENVIRONMENT_ISOLATED: "" }, identities)).toThrow("ENVIRONMENT_ISOLATED");
  expect(() => assertEnvironmentIsolation({ ...development, CACHE_NAMESPACE: "production" }, identities)).toThrow("namespace");
  expect(() => assertEnvironmentIsolation(development, identities)).not.toThrow();
});
it("allows staging only on the staging branch with explicit staging configuration", () => {
  const staging = { ...development, APP_ENV: "staging", CACHE_NAMESPACE: "preview", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "staging" };
  expect(() => assertEnvironmentIsolation(staging, identities)).not.toThrow();
  for (const branch of ["develop", "feature/example", ""]) expect(() => assertEnvironmentIsolation({ ...staging, VERCEL_GIT_COMMIT_REF: branch }, identities)).toThrow("restricted");
  expect(() => assertEnvironmentIsolation({ ...staging, APP_ENV: "production" }, identities)).toThrow();
});
it("preserves existing Vercel production settings and rejects a conflicting declaration", () => {
  expect(deploymentEnvironment({ VERCEL_ENV: "production" })).toBe("production");
  expect(() => assertEnvironmentIsolation({ VERCEL_ENV: "production", DATABASE_URL: "postgresql://fixture:fixture@ep-production.neon.example/app" }, identities)).not.toThrow();
  expect(() => deploymentEnvironment({ VERCEL_ENV: "production", APP_ENV: "development" })).toThrow("mismatch");
  expect(() => deploymentEnvironment({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "feature/example" })).toThrow("main");
});
it("rejects production AI and signing credentials without printing their values", () => {
  const productionCredentialHashes = { OPENAI_API_KEY: hash("sensitive-fixture"), AUTH_SECRET: hash("signing-fixture") };
  for (const [key, value] of [["OPENAI_API_KEY", "sensitive-fixture"], ["AUTH_SECRET", "signing-fixture"]]) {
    expect(() => assertEnvironmentIsolation({ ...development, [key]: value }, { ...identities, productionCredentialHashes })).toThrow(key);
  }
});
it("keeps background jobs off outside production unless explicitly enabled", () => {
  expect(nonproductionJobsAllowed(development)).toBe(false);
  expect(nonproductionJobsAllowed({ ...development, NONPRODUCTION_JOBS_ENABLED: "true" })).toBe(true);
  expect(nonproductionJobsAllowed({ VERCEL_ENV: "production" })).toBe(true);
});
