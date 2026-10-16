import { z } from "zod";
import { eq } from "drizzle-orm";
import { loadEnvironment, openDatabase } from "./lib/database.mjs";

// Creates the first account row and platform defaults. No password is stored:
// Google is the only sign-in method. A super_admin row is inert until an
// operator authorizes its Google link (`npm run admin:access -- authorize-google-link`).
loadEnvironment("Seed");
const parsed = z.object({ SEED_USER_EMAIL: z.email(), SEED_USER_NAME: z.string().trim().min(1).default("Acadence"), SEED_USER_ROLE: z.enum(["learner", "super_admin"]).default("super_admin") }).safeParse(process.env);
if (!parsed.success) throw new Error(`Missing or invalid seed configuration: ${parsed.error.issues.map(i => i.path.join(".")).join(", ")}`);
const env = parsed.data;
const { db, schema } = await openDatabase();
const email = env.SEED_USER_EMAIL.toLowerCase();
try {
  const [existing] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email));
  if (existing) {
    process.stdout.write("Seed account already exists; its role was not changed.\n");
  } else {
    const userId = crypto.randomUUID();
    await db.batch([
      db.insert(schema.users).values({ id: userId, email, name: env.SEED_USER_NAME, role: env.SEED_USER_ROLE, emailVerified: true, acceptedTermsAt: new Date(), onboardingCompletedAt: new Date() }),
      db.insert(schema.preferences).values({ userId }),
      ...Object.entries({ streakMinutes: 10, maxFileSizeMB: 10, storagePerUserMB: 100 }).map(([key, value]) => db.insert(schema.appSettings).values({ key, value }).onConflictDoNothing()),
    ]);
    process.stdout.write(`Seed account created. ${env.SEED_USER_ROLE === "super_admin" ? "Authorize its Google link with npm run admin:access -- authorize-google-link before first sign-in. " : ""}No demo data was inserted.\n`);
  }
} catch {
  process.stderr.write("Database seeding failed. Verify the branch connection and run db:migrate first. No credentials were printed.\n");
  process.exitCode = 1;
}
