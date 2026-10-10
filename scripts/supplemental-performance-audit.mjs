import { request } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { environment } from "./env-runtime.mjs";

if (!process.argv.includes("--acknowledge-current-test-database") || process.env.VERCEL_ENV === "production") throw new Error("Test database acknowledgement required.");
const baseURL = process.argv.find(value => value.startsWith("--url="))?.slice(6) ?? "http://localhost:3100";
const fixture = JSON.parse(readFileSync(".audit-local/fixtures.json", "utf8"));
const fresh = JSON.parse(readFileSync(".audit-local/performance-persona.json", "utf8"));
const users = [fresh, ...fixture.users.filter(user => user.role === "learner").map(user => ({ ...user, password: fixture.password }))];
const sql = neon(environment.DATABASE_URL_UNPOOLED), results = [], contexts = [], inserted = [];
try {
  for (const [index, user] of users.entries()) {
    assert(user.email.startsWith("audit-"));
    const context = await request.newContext({ baseURL }); contexts.push(context);
    const login = await context.post("/api/auth/sign-in/email", { headers: { Origin: baseURL }, data: { email: user.email, password: user.password } }); assert(login.ok());
    const { fields } = await (await context.get("/api/workspace?groups=shell")).json(); assert(fields?.user);
    const notificationId = crypto.randomUUID(), owner = fields.user.id;
    inserted.push({ notificationId, owner });
    await sql`INSERT INTO notifications (id,user_id,type,title,body,deduplication_key,scheduled_for) SELECT ${notificationId}::uuid,id,'block','Audit notification','Fixture only',${notificationId},now() FROM users WHERE id=${owner}::uuid AND email=${user.email}`;
    const before = await (await context.get("/api/workspace?groups=shell")).json(); assert(before.fields.notifications.some(row => row.id === notificationId && !row.readAt));
    const response = await context.post("/api/workspace", { headers: { Origin: baseURL }, data: { operations: [{ kind: "readNotification", id: notificationId }] } }); assert((await response.json()).ok);
    const after = await (await context.get("/api/workspace?groups=shell")).json(); assert(after.fields.notifications.some(row => row.id === notificationId && row.readAt));
    results.push({ persona: index === 0 ? "new" : index === 1 ? "active" : "stress", operation: "notification read persistence", status: "PASS" });
    const exported = await context.get("/api/export"); assert(exported.ok()); assert.match(exported.headers()["content-disposition"], /attachment/);
    const data = await exported.json(); assert.equal(data.user.id, owner);
    for (const collection of [data.subjects, data.resources, data.sessions, data.schedule]) assert(collection.every(row => row.userId === owner));
    assert(!("accounts" in data) && !("password" in data.user));
    results.push({ persona: index === 0 ? "new" : index === 1 ? "active" : "stress", operation: "owned export and credential exclusion", status: "PASS" });
  }
  const foreign = await contexts[1].post("/api/workspace", { headers: { Origin: baseURL }, data: { operations: [{ kind: "readNotification", id: inserted[0].notificationId }] } }); assert.equal((await foreign.json()).ok, false);
  const badOrigin = await contexts[1].post("/api/workspace", { headers: { Origin: "https://attacker.example" }, data: { operations: [{ kind: "readNotification", id: inserted[1].notificationId }] } }); assert.equal(badOrigin.status(), 403);
  results.push({ operation: "notification ownership and CSRF", status: "PASS" });
} catch (error) {
  results.push({ operation: "supplemental audit", status: "FAIL", error: error.name }); process.exitCode = 1;
} finally {
  for (const item of inserted) {
    try { await sql`DELETE FROM notifications WHERE id=${item.notificationId}::uuid AND user_id=${item.owner}::uuid`; }
    catch { results.push({ operation: "fixture cleanup", status: "BLOCKED" }); process.exitCode = 1; }
  }
  for (const context of contexts) await context.dispose();
  writeFileSync("docs/SUPPLEMENTAL_PERFORMANCE_RESULTS.json", JSON.stringify({ results }, null, 2));
}
console.info(JSON.stringify({ passed: results.length }));
