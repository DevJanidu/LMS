// Explicitly acknowledged current/development branch; never resets existing data.
import { environment as env } from "./env-runtime.mjs";
import { neon } from "@neondatabase/serverless";
import { hash } from "@node-rs/argon2";
import { mkdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
if (process.env.VERCEL_ENV === "production" || !process.argv.includes("--acknowledge-current-test-database")) throw new Error("Explicit test-database acknowledgement is required. Production refused.");
const sql = neon(env.DATABASE_URL_UNPOOLED);
const path = ".audit-local/fixtures.json";
mkdirSync(".audit-local", { recursive: true });
try {
  if (process.argv.includes("--cleanup")) {
    const fixture = JSON.parse(readFileSync(path, "utf8"));
    // Both UUID and unique random email must match; never deletes owner records.
    for (const user of fixture.users) await sql`DELETE FROM users WHERE id = ${user.id}::uuid AND email = ${user.email}`;
    unlinkSync(path);
    console.info("Only audit fixture accounts removed.");
  } else if (existsSync(path) && JSON.parse(readFileSync(path, "utf8")).ready) console.info("Using existing audit fixtures; owner accounts unchanged.");
  else {
    const previous = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : undefined;
    const run = previous?.run ?? crypto.randomUUID(), password = previous?.password ?? crypto.randomUUID() + "Aa!9";
    const users = previous?.users ?? ["learner", "learner", "super_admin"].map((role, index) => ({ id: crypto.randomUUID(), email: `audit-${run}-${index}@example.com`, role }));
    // Save before creating anything so interrupted runs can clean only their own records.
    writeFileSync(path, JSON.stringify({ run, password, users }, null, 2));
    const digest = await hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
    for (const user of users) {
      const [existing] = await sql`SELECT id FROM users WHERE id = ${user.id}::uuid AND email = ${user.email}`;
      if (existing) continue;
      await sql.transaction([
        sql`INSERT INTO users (id,name,email,role,timezone,email_verified,accepted_terms_at,onboarding_completed_at) VALUES (${user.id}::uuid, 'Audit fixture', ${user.email}, ${user.role}::user_role, 'Asia/Colombo',true,now(),now())`,
        sql`INSERT INTO accounts (user_id,account_id,provider_id,password) VALUES (${user.id}::uuid,${user.id},'credential',${digest})`,
        sql`INSERT INTO user_preferences (user_id,weekly_target_minutes,theme) VALUES (${user.id}::uuid,720,'light')`,
      ]);
      if (user.role === "learner") {
        for (let index = 0; index < 3; index++) {
          const subject = crypto.randomUUID();
          await sql`INSERT INTO subjects (id,user_id,title) VALUES (${subject}::uuid,${user.id}::uuid,${`Audit subject ${index + 1}`})`;
          await sql`INSERT INTO topics (subject_id,title,sort_order,status,completed_at) SELECT ${subject}::uuid,'Audit topic ' || n,n-1,CASE WHEN n <= 7 THEN 'completed'::topic_status ELSE 'not_started'::topic_status END,CASE WHEN n <= 7 THEN now() ELSE NULL END FROM generate_series(1,10) n`;
          await sql`INSERT INTO study_sessions (user_id,subject_id,started_at,ended_at,duration_seconds,source) SELECT ${user.id}::uuid,${subject}::uuid,date_trunc('day',now()) - n * interval '1 day' + interval '6 hours',date_trunc('day',now()) - n * interval '1 day' + interval '6 hours 30 minutes',1800,'manual' FROM generate_series(1,365) n`;
        }
      }
    }
    writeFileSync(path, JSON.stringify({ run, password, users, ready: true }, null, 2));
    console.info("Created two learners with one year of sessions and one audit Super Admin. Credentials remain in ignored local fixture file.");
  }
} catch { console.error("Fixture operation failed; verify branch connectivity. No connection details printed."); process.exitCode = 1; }
