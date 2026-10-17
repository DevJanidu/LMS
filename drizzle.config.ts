import { loadAppEnv } from "./scripts/lib/env-file.mjs";
import { defineConfig } from "drizzle-kit";
import { assertEnvironmentIsolation, deploymentEnvironment } from "./src/lib/deployment-policy.mjs";

loadAppEnv();
if (process.argv.some(arg => ["migrate", "push", "studio", "pull"].includes(arg))) {
  assertEnvironmentIsolation(process.env);
  if (deploymentEnvironment(process.env) === "production" && process.env.ACADENCE_MIGRATION_APPROVED !== "true") {
    throw new Error("Use the reviewed production migration command in docs/DEPLOYMENT_GUIDE.md.");
  }
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED ?? "" },
  strict: true,
  verbose: false,
});
