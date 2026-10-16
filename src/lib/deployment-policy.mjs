import { createHash } from "node:crypto";
import resources from "../../config/production-resources.json" with { type: "json" };

/** @param {Record<string, string | undefined>} env */
export function deploymentEnvironment(env) {
  if (env.APP_ENV && !["development", "staging", "production"].includes(env.APP_ENV)) {
    throw new Error("APP_ENV must be development, staging or production.");
  }
  if (env.VERCEL_ENV === "production") {
    if (env.APP_ENV && env.APP_ENV !== "production") throw new Error("Production environment mismatch.");
    if (env.VERCEL_GIT_COMMIT_REF && env.VERCEL_GIT_COMMIT_REF !== "main") throw new Error("Production deployments require main.");
    return "production";
  }
  if (env.VERCEL_ENV === "preview") {
    if (env.APP_ENV !== "staging" || env.VERCEL_GIT_COMMIT_REF !== "staging") {
      throw new Error("Hosted previews are restricted to the staging branch and APP_ENV=staging.");
    }
    return "staging";
  }
  return env.APP_ENV || "development";
}

/** @param {string | undefined} value */
function hostHash(value) {
  if (!value) return undefined;
  try {
    const host = new URL(value.trim().replace(/^(["'])(.*)\1$/, "$2")).hostname.replace("-pooler.", ".").toLowerCase();
    return createHash("sha256").update(host).digest("hex");
  } catch { throw new Error("Invalid service URL in environment configuration."); }
}

/** Fail before connecting. Host fingerprints contain no passwords or API keys.
 * @param {Record<string, string | undefined>} env
 * @param {{productionDatabaseHost: string, productionStorageHost: string, productionRedisHost: string, productionOrigin: string, productionCredentialHashes?: Record<string, string>}} identities
 */
export function assertEnvironmentIsolation(env, identities = resources) {
  // Existing unit suites use mocked clients. Explicit environment-policy tests still run.
  if (env.NODE_ENV === "test" && !env.APP_ENV && !env.VERCEL_ENV) return;
  const environment = deploymentEnvironment(env);
  if (environment === "production") return;
  if (env.ENVIRONMENT_ISOLATED !== "true") throw new Error("Nonproduction services require ENVIRONMENT_ISOLATED=true after provisioning isolated resources.");
  for (const [key, fingerprint] of Object.entries(identities.productionCredentialHashes || {})) {
    if (env[key] && createHash("sha256").update(env[key]).digest("hex") === fingerprint) {
      throw new Error(`Nonproduction credentials match production: ${key}.`);
    }
  }
  for (const [key, forbidden] of [
    ["DATABASE_URL", identities.productionDatabaseHost],
    ["DATABASE_URL_UNPOOLED", identities.productionDatabaseHost],
    ["TEST_DATABASE_URL", identities.productionDatabaseHost],
    ["OBJECT_STORAGE_ENDPOINT", identities.productionStorageHost],
    ["AWS_ENDPOINT_URL_S3", identities.productionStorageHost],
    ["UPSTASH_REDIS_REST_URL", identities.productionRedisHost],
  ]) {
    if (hostHash(env[key]) === forbidden) throw new Error(`Nonproduction configuration uses a production service: ${key}.`);
  }
  if (env.APP_URL && new URL(env.APP_URL).origin === identities.productionOrigin) {
    throw new Error("Nonproduction APP_URL cannot use the production origin.");
  }
  const namespace = environment === "staging" ? "preview" : "development";
  if (env.CACHE_NAMESPACE && env.CACHE_NAMESPACE !== namespace && !(env.CI === "true" && env.CACHE_NAMESPACE === "test")) {
    throw new Error("Cache namespace does not match the application environment.");
  }
}

/** @param {Record<string, string | undefined>} env */
export function nonproductionJobsAllowed(env) {
  if (env.NODE_ENV === "test" && !env.APP_ENV && !env.VERCEL_ENV) return true;
  return deploymentEnvironment(env) === "production" || env.NONPRODUCTION_JOBS_ENABLED === "true";
}
