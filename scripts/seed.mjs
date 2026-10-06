import nextEnv from "@next/env";
import { z } from "zod";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import { hash } from "@node-rs/argon2";
import ts from "typescript";
import { mkdtempSync, readFileSync, writeFileSync, unlinkSync, rmdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

nextEnv.loadEnvConfig(process.cwd());
if ((process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") && !process.argv.includes("--allow-production")) {
  throw new Error("Seed refused in production. Use --allow-production only for deliberate account provisioning.");
}
const parsed = z.object({ DATABASE_URL_UNPOOLED: z.string().url(), SEED_USER_EMAIL: z.email(), SEED_USER_PASSWORD: z.string().min(8).max(128), SEED_USER_NAME: z.string().trim().min(1).default("StudyFlow"), SEED_USER_ROLE: z.enum(["learner", "super_admin"]).default("super_admin") }).safeParse(process.env);
if (!parsed.success) throw new Error(`Missing or invalid seed configuration: ${parsed.error.issues.map(i => i.path.join(".")).join(", ")}`);
const env = parsed.data;
// Use the already-installed TypeScript compiler so the CLI also runs on Node 20.
const temporary = mkdtempSync(resolve(".seed-runtime-"));
const compiled = join(temporary, "schema.mjs");
writeFileSync(compiled, ts.transpileModule(readFileSync("src/lib/db/schema.ts", "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText);
let schema;
try { schema = await import(pathToFileURL(compiled).href); }
finally { unlinkSync(compiled); rmdirSync(temporary); }
const db = drizzle(neon(env.DATABASE_URL_UNPOOLED), { schema });
const email = env.SEED_USER_EMAIL.toLowerCase();
try {
const [existing] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email));
if (existing) {
  process.stdout.write("Seed account already exists; password and role were not changed.\n");
} else {
  const userId = crypto.randomUUID();
  const password = await hash(env.SEED_USER_PASSWORD, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
  await db.batch([
    db.insert(schema.users).values({ id: userId, email, name: env.SEED_USER_NAME, role: env.SEED_USER_ROLE, emailVerified: true, acceptedTermsAt: new Date(), onboardingCompletedAt: new Date() }),
    db.insert(schema.accounts).values({ id: crypto.randomUUID(), userId, accountId: userId, providerId: "credential", password }),
    db.insert(schema.preferences).values({ userId }),
    ...Object.entries({ streakMinutes: 10, maxFileSizeMB: 10, storagePerUserMB: 100 }).map(([key, value]) => db.insert(schema.appSettings).values({ key, value }).onConflictDoNothing()),
  ]);
  process.stdout.write("Seed account created. No demo subjects or sessions were inserted.\n");
}

} catch {
  process.stderr.write("Database seeding failed. Verify the branch connection and run db:migrate first. No credentials were printed.\n");
  process.exitCode = 1;
}
