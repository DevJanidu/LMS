// Drives real Aven turns through a running app and prints client-side timings. Server-side
// stage timings are in the app's `aven_latency` logs (pass --log to summarize them).
//
//   node scripts/bench-aven-latency.mjs --base http://localhost:3100 --users 4 --messages 5 [--log path] [--label before]
//
// Uses the development database from .env.develop, refuses the registered production host,
// creates isolated fixture learners and deletes them afterwards.
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { assertEnvironmentIsolation } from "../src/lib/deployment-policy.mjs";

const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const base = arg("base", "http://localhost:3100");
const users = Number(arg("users", 4)),
  messages = Number(arg("messages", 5)),
  logFile = arg("log"),
  label = arg("label", "run"),
  prompt = arg("prompt", "Hello there");
const env = parse(readFileSync(".env.develop", "utf8"));
assertEnvironmentIsolation({ APP_ENV: "development", ENVIRONMENT_ISOLATED: "true", DATABASE_URL: env.DATABASE_URL, DATABASE_URL_UNPOOLED: env.DATABASE_URL_UNPOOLED });
const sql = neon(env.DATABASE_URL_UNPOOLED);
const percentile = (values, p) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
};
async function fixture(index) {
  const id = randomUUID(),
    token = randomBytes(24).toString("base64url");
  await sql.transaction([
    sql`INSERT INTO users (id, name, email, email_verified, role, status, accepted_terms_at, onboarding_completed_at)
        VALUES (${id}, ${`Latency bench ${index}`}, ${`e2e-bench-${id}@example.com`}, true, 'learner', 'active', now(), now())`,
    sql`INSERT INTO accounts (id, user_id, account_id, provider_id) VALUES (${randomUUID()}, ${id}, ${`google-${id}`}, 'google')`,
    sql`INSERT INTO sessions (id, user_id, token, expires_at) VALUES (${randomUUID()}, ${id}, ${token}, ${new Date(Date.now() + 36e5)})`,
  ]);
  const cookie = `better-auth.session_token=${encodeURIComponent(`${token}.${createHmac("sha256", env.AUTH_SECRET).update(token).digest("base64")}`)}`;
  const headers = { cookie, origin: new URL(base).origin, "content-type": "application/json" };
  const enabled = await fetch(`${base}/api/aven`, { method: "POST", headers, body: JSON.stringify({ kind: "enableAven" }) });
  if (!enabled.ok) throw new Error(`enableAven ${enabled.status}`);
  return { id, headers };
}
async function turn(user, conversationId) {
  const started = performance.now();
  const response = await fetch(`${base}/api/aven/chat`, {
    method: "POST",
    headers: user.headers,
    body: JSON.stringify({ conversationId, goalId: null, requestId: randomUUID(), message: prompt, planning: false, references: [] }),
  });
  const headersMs = performance.now() - started;
  if (!response.ok) return { ok: false, status: response.status, error: (await response.json().catch(() => ({}))).error };
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let text = "",
    firstDelta = null,
    id = conversationId;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    if (firstDelta === null && text.includes('"text-delta"')) firstDelta = performance.now() - started;
    id ??= /"conversationId":"([0-9a-f-]{36})"/.exec(text)?.[1] ?? null;
  }
  return { ok: text.includes('"message-complete"'), headersMs, firstDelta, totalMs: performance.now() - started, conversationId: id };
}
const created = [];
const results = [];
try {
  for (let index = 0; index < users; index++) created.push(await fixture(index));
  // Warm up each route once so compilation is not measured.
  await turn(created[0], null);
  for (const user of created) {
    let conversationId = null;
    for (let index = 0; index < messages; index++) {
      const result = await turn(user, conversationId);
      results.push(result);
      if (result.ok) conversationId = result.conversationId;
    }
  }
} finally {
  for (const user of created) {
    await sql`DELETE FROM ai_usage_records WHERE user_id = ${user.id}`;
    await sql`DELETE FROM users WHERE id = ${user.id}`;
  }
}
const ok = results.filter((result) => result.ok);
const summary = (values) => ({ p50: Math.round(percentile(values, 50)), p95: Math.round(percentile(values, 95)) });
console.log(JSON.stringify({ label, samples: results.length, ok: ok.length, failures: results.filter((r) => !r.ok).map((r) => `${r.status ?? "incomplete"}:${r.error ?? ""}`),
  clientHeadersMs: summary(ok.map((r) => r.headersMs)), clientFirstDeltaMs: summary(ok.map((r) => r.firstDelta).filter((v) => v !== null)), clientTotalMs: summary(ok.map((r) => r.totalMs)) }));
if (logFile) {
  const stages = {};
  const lines = readFileSync(logFile, "utf8").split(/\r?\n/).filter((line) => line.startsWith('{"event":"aven_latency"'));
  // Only this run's turns: the last N log lines (warm-up included in the file, excluded here).
  for (const line of lines.slice(-results.length)) {
    const entry = JSON.parse(line);
    for (const [key, value] of Object.entries(entry)) if (typeof value === "number") (stages[key] ??= []).push(value);
  }
  console.log(JSON.stringify({ label, serverStages: Object.fromEntries(Object.entries(stages).map(([key, values]) => [key, summary(values)])) }));
}
