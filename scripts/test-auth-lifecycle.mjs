import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { parse } from "dotenv";
import { neon } from "@neondatabase/serverless";

// Only freshly created, uniquely named fixtures may be changed or removed.
if (!process.argv.includes("--acknowledge-current-test-database")) throw new Error("Pass --acknowledge-current-test-database to test using a tagged, disposable account.");
const file = process.argv.find(arg => arg.startsWith("--env="))?.slice(6) ?? ".env.local";
const configured = parse(readFileSync(file, "utf8"));
const fixture = randomUUID(), email = `auth-e2e-${fixture}@example.invalid`, password = `fixture-${randomUUID()}`;
const appURL = "http://localhost:3100", mailboxURL = "http://127.0.0.1:3111";
const captured = [];
let failedFirstReset = false;
const mailbox = createServer(async (request, response) => {
  response.setHeader("Content-Type", "application/json");
  if (request.method === "GET" && request.url === "/messages") { response.end(JSON.stringify(captured)); return; }
  if (request.method !== "POST" || request.url !== "/emails") { response.statusCode = 404; response.end("{}"); return; }
  let text = ""; for await (const chunk of request) text += chunk;
  const message = JSON.parse(text);
  const recipients = Array.isArray(message.to) ? message.to : [message.to];
  if (recipients.some(to => to !== email)) { response.statusCode = 403; response.end(JSON.stringify({ name: "validation_error", message: "Only the owned test recipient is allowed." })); return; }
  const isReset = message.text.includes("/reset-password?token=");
  const rejected = isReset && !failedFirstReset;
  if (rejected) failedFirstReset = true;
  captured.push({ text: message.text, accepted: !rejected });
  response.statusCode = rejected ? 503 : 200;
  response.end(JSON.stringify(rejected ? { name: "application_error", message: "Fixture delivery failure." } : { id: randomUUID() }));
});
const accountSettings = Object.fromEntries(["DATABASE_URL", "AUTH_SECRET"].map(key => [key, configured[key]]));
if (!accountSettings.DATABASE_URL || !accountSettings.AUTH_SECRET) throw new Error("Configure the test database and signing secret first.");
const env = {
  ...process.env, ...accountSettings, APP_URL: appURL, CACHE_NAMESPACE: "test",
  DATABASE_URL_UNPOOLED: "", CRON_SECRET: "", OBJECT_STORAGE_ENDPOINT: "", OBJECT_STORAGE_REGION: "", OBJECT_STORAGE_BUCKET: "", OBJECT_STORAGE_ACCESS_KEY_ID: "", OBJECT_STORAGE_SECRET_ACCESS_KEY: "",
  UPSTASH_REDIS_REST_URL: "", UPSTASH_REDIS_REST_TOKEN: "", GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "",
  RESEND_API_KEY: "fixture-local-mailbox-only", EMAIL_FROM: "Fixture <fixture@example.invalid>", RESEND_BASE_URL: mailboxURL,
  PLAYWRIGHT_ISOLATED_BUILD: "1", PLAYWRIGHT_SKIP_BUILD: "1", PLAYWRIGHT_CHANNEL: "chrome",
  E2E_AUTH_LIFECYCLE: "1", E2E_AUTH_EMAIL: email, E2E_AUTH_PASSWORD: password, E2E_AUTH_MAILBOX: mailboxURL,
};
let result = 1;
try {
  await new Promise((resolve, reject) => { mailbox.once("error", reject); mailbox.listen(3111, "127.0.0.1", resolve); });
  const child = spawn(process.execPath, ["node_modules/@playwright/test/cli.js", "test", "tests/e2e/auth-lifecycle.spec.ts", "--output=.audit-local/auth-lifecycle-results"], { env, stdio: "inherit", windowsHide: true });
  result = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", code => resolve(code ?? 1)); });
} finally {
  console.log(JSON.stringify({ capturedEmails: captured.length, acceptedResets: captured.filter(message => message.accepted && message.text.includes("/reset-password?token=")).length, rejectedResets: captured.filter(message => !message.accepted).length }));
  try {
    const sql = neon(configured.DATABASE_URL);
    const users = await sql`SELECT id FROM users WHERE email = ${email} AND name = 'Auth Lifecycle Fixture'`;
    if (users.length === 1) {
      const id = users[0].id;
      await sql`DELETE FROM verifications WHERE value = ${id} AND identifier LIKE 'reset-password:%'`;
      await sql`DELETE FROM users WHERE id = ${id} AND email = ${email} AND name = 'Auth Lifecycle Fixture'`;
    }
    const prefix = `reset-week:v1:${createHash("sha256").update(email).digest("hex")}`;
    const keys = [...Array.from({ length: 5 }, (_, index) => `${prefix}:${index}`), `${prefix}:guard`, ...["register", "login"].map(mode => `auth:v1:5:60:${createHash("sha256").update(`account:${mode}:${email}`).digest("hex")}`)];
    await sql`DELETE FROM auth_rate_limits WHERE key = ANY(${keys})`;
    console.log("Removed the owned fixture account, reset tokens and account quota rows.");
  } catch { result = 1; console.error("Fixture cleanup could not be verified. Inspect only the tagged auth-e2e fixture account before retrying."); }
  await new Promise(resolve => mailbox.close(resolve));
}
process.exitCode = result;
