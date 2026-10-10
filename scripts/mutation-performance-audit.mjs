import { request } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";

if (!process.argv.includes("--acknowledge-current-test-database") || process.env.VERCEL_ENV === "production") throw new Error("Test database acknowledgement required.");
const baseURL = process.env.APP_URL ?? "http://localhost:3100";
const fixture = JSON.parse(readFileSync(".audit-local/fixtures.json", "utf8"));
const fresh = JSON.parse(readFileSync(".audit-local/performance-persona.json", "utf8"));
const personas = [{ ...fresh, persona: "new" }, ...fixture.users.slice(0, 2).map((user, index) => ({ ...user, password: fixture.password, persona: index ? "stress" : "active" }))];
const results = [];
for (const user of personas) {
  assert(user.email.startsWith("audit-"));
  const context = await request.newContext({ baseURL });
  const subject = { id: crypto.randomUUID(), title: `Latency audit ${crypto.randomUUID()}`, description: "Fixture only", color: "brand", status: "active" };
  let created = false;
  const send = async (operation, label) => {
    const start = performance.now();
    const response = await context.post("/api/workspace", { headers: { Origin: baseURL }, data: { operations: [operation] } });
    assert((await response.json()).ok);
    results.push({ persona: user.persona, operation: label, status: "PASS", ms: Math.round(performance.now() - start), bytes: (await response.body()).length, serverTiming: response.headers()["server-timing"] });
  };
  try {
    assert((await context.post("/api/auth/sign-in/email", { headers: { Origin: baseURL }, data: { email: user.email, password: user.password } })).ok());
    await send({ kind: "subject", value: subject }, "subject create"); created = true;
    const topic = { id: crypto.randomUUID(), subjectId: subject.id, title: "Latency topic", status: "notStarted", sortOrder: 0 };
    await send({ kind: "topic", value: topic }, "topic create");
    for (const type of ["note", "link", "video"]) {
      const resource = { id: crypto.randomUUID(), subjectId: subject.id, topicId: topic.id, type, title: `Latency ${type}`, ...(type === "note" ? { textContent: "Fixture only" } : { url: "https://www.youtube.com/watch?v=abcdefghijk" }) };
      await send({ kind: "resource", value: resource }, `${type} create`);
      await send({ kind: "resource", value: { ...resource, title: `Updated ${type}` } }, `${type} edit`);
      const list = await (await context.get(`/api/workspace/query?kind=resources&input=${encodeURIComponent(JSON.stringify({ subjectId: subject.id }))}`)).json();
      assert(list.ok && list.data.rows.some(row => row.id === resource.id && row.title === `Updated ${type}`));
      await send({ kind: "delete", entity: "resource", id: resource.id }, `${type} delete`);
    }
    const session = { id: crypto.randomUUID(), subjectId: subject.id, topicId: topic.id, startedAt: new Date(Date.now() - 3600000).toISOString(), endedAt: new Date(Date.now() - 1800000).toISOString() };
    await send({ kind: "session", value: session }, "session create");
    await send({ kind: "session", value: { ...session, note: "Edited" } }, "session edit with streak preservation");
    await send({ kind: "delete", entity: "session", id: session.id }, "session delete with streak preservation");
    await send({ kind: "delete", entity: "topic", id: topic.id }, "topic delete");
  } catch (error) {
    results.push({ persona: user.persona, operation: "final mutation lifecycle", status: "FAIL", error: error.name }); process.exitCode = 1;
  } finally {
    if (created) try { await send({ kind: "delete", entity: "subject", id: subject.id }, "subject cleanup"); }
    catch { results.push({ persona: user.persona, operation: "fixture cleanup", status: "BLOCKED" }); process.exitCode = 1; }
    await context.dispose();
  }
}
writeFileSync("docs/FINAL_MUTATION_METRICS.json", JSON.stringify({ generatedAt: new Date().toISOString(), conditions: "Three audit accounts against the final local production build; remote Neon and Redis. Sequential requests per persona, small UUID-scoped fixtures. Not a load test.", results }, null, 2));
console.info(JSON.stringify({ passed: results.filter(row => row.status === "PASS").length, failed: results.filter(row => row.status === "FAIL").length }));
