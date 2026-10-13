import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { parse } from "dotenv";
import { assertEnvironmentIsolation } from "../src/lib/deployment-policy.mjs";

const args = process.argv.slice(2);
const environment = args[0];
const command = args[1] || "check";
const file = args.find(arg => arg.startsWith("--env="))?.slice(6) || `.env.${environment}.local`;
const fromProcess = args.includes("--process-env");
try {
  if (!["development", "staging", "production"].includes(environment)) throw new Error("Choose development, staging or production.");
  if (!["check", "dev", "migrate", "seed", "studio"].includes(command)) throw new Error("Unsupported environment command.");
  if (command === "dev" && environment !== "development") throw new Error("Development server requires the development environment.");
  if (fromProcess && (process.env.CI !== "true" || environment === "production")) throw new Error("Process-only credentials are limited to nonproduction CI.");
  if (environment === "production" && command !== "check" && !args.includes("--approved-production-migration")) throw new Error("Production changes require explicit release approval and --approved-production-migration.");
  if (environment === "production" && command === "seed") throw new Error("Production seeding is disabled.");
  if (environment === "production" && command === "studio") throw new Error("Production database studio is disabled.");
  const values = fromProcess ? { ...process.env } : parse(readFileSync(file, "utf8"));
  if (values.APP_ENV !== environment) throw new Error("The selected file must declare the matching APP_ENV.");
  // Neutralize every documented app variable: Next must not fill gaps from .env.local.
  const names = Object.keys(parse(readFileSync(".env.example", "utf8")));
  const env = { ...process.env, ...Object.fromEntries(names.map(key => [key, ""])), ...values, APP_ENV: environment,
    NODE_ENV: environment === "production" ? "production" : "development",
    ACADENCE_MIGRATION_APPROVED: environment === "production" && command === "migrate" ? "true" : "" };
  assertEnvironmentIsolation(env);
  if (environment !== "production" && existsSync(".env.production")) {
    const production = parse(readFileSync(".env.production", "utf8"));
    for (const key of ["AUTH_SECRET", "CRON_SECRET", "OPENAI_API_KEY", "OBJECT_STORAGE_ACCESS_KEY_ID", "OBJECT_STORAGE_SECRET_ACCESS_KEY", "UPSTASH_REDIS_REST_TOKEN", "RESEND_API_KEY", "GOOGLE_CLIENT_SECRET", "VAPID_PRIVATE_KEY"]) {
      if (values[key] && values[key] === production[key]) throw new Error(`Nonproduction credentials must differ from production: ${key}.`);
    }
  }
  for (const key of ["DATABASE_URL", "DATABASE_URL_UNPOOLED", "AUTH_SECRET", "APP_URL", "CRON_SECRET", "OBJECT_STORAGE_ENDPOINT", "OBJECT_STORAGE_REGION", "OBJECT_STORAGE_BUCKET", "OBJECT_STORAGE_ACCESS_KEY_ID", "OBJECT_STORAGE_SECRET_ACCESS_KEY"]) {
    if (!env[key]) throw new Error(`Required environment setting is missing: ${key}.`);
  }
  const pooled = new URL(env.DATABASE_URL), direct = new URL(env.DATABASE_URL_UNPOOLED);
  if (pooled.hostname.replace("-pooler.", ".") !== direct.hostname.replace("-pooler.", ".") || pooled.pathname !== direct.pathname || pooled.username !== direct.username || pooled.password !== direct.password) throw new Error("Database URLs must identify the same database and role.");
  if (![pooled, direct].every(url => ["postgres:", "postgresql:"].includes(url.protocol) && ["require", "verify-full"].includes(url.searchParams.get("sslmode")))) throw new Error("Database connections require PostgreSQL and TLS.");
  console.log(JSON.stringify({ check: "environment_isolation", environment, ok: true }));
  if (command === "check") process.exit(0);
  const cli = command === "dev" ? ["node_modules/next/dist/bin/next", "dev", ...args.slice(2).filter(arg => !arg.startsWith("--env="))]
    : ["migrate", "studio"].includes(command) ? ["node_modules/drizzle-kit/bin.cjs", command] : ["scripts/seed.mjs"];
  const result = spawnSync(process.execPath, cli.map((arg, index) => index === 0 ? resolve(arg) : arg), { env, stdio: "inherit", windowsHide: true });
  process.exitCode = result.status ?? 1;
} catch (error) {
  // File/URL parser errors may contain values. Only controlled policy messages are logged.
  const message = error instanceof Error && !["ENOENT", "EACCES", "ERR_INVALID_URL"].includes(error.code) ? error.message : "Cannot read the selected environment file or parse its URLs.";
  console.error(JSON.stringify({ check: "environment_isolation", ok: false, message }));
  process.exitCode = 1;
}
