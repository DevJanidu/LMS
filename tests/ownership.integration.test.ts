import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Operation } from "@/lib/validation/operations";

const enabled = Boolean(process.env.TEST_DATABASE_URL) && process.env.TEST_DATABASE_ISOLATED === "true";
describe.skipIf(!enabled)("ownership on an isolated Neon branch", () => {
  let db: ReturnType<typeof import("@/lib/db").getDb>;
  let schema: typeof import("@/lib/db/schema");
  let mutate: typeof import("@/lib/services/mutations").mutate;
  let auth: ReturnType<typeof import("@/lib/auth").getAuth>;
  const ids = { a: crypto.randomUUID(), b: crypto.randomUUID(), admin: crypto.randomUUID(), subject: crypto.randomUUID(), topic: crypto.randomUUID(), resource: crypto.randomUUID(), session: crypto.randomUUID(), block: crypto.randomUUID() };
  const fixtures: Operation[] = [
    { kind: "subject", value: { id: ids.subject, title: "private subject", description: "private description", color: "brand", status: "active" } },
    { kind: "topic", value: { id: ids.topic, subjectId: ids.subject, title: "private topic", status: "notStarted", sortOrder: 0, description: "private topic note" } },
    { kind: "resource", value: { id: ids.resource, subjectId: ids.subject, topicId: ids.topic, type: "note", title: "private resource", textContent: "private resource note" } },
    { kind: "session", value: { id: ids.session, subjectId: ids.subject, topicId: ids.topic, startedAt: "2026-01-01T10:00:00Z", endedAt: "2026-01-01T11:00:00Z", note: "private session note" } },
    { kind: "block", value: { id: ids.block, subjectId: ids.subject, title: "private plan", startsAt: "2026-01-02T10:00:00Z", endsAt: "2026-01-02T11:00:00Z", repeat: "once", weekdays: [], timezone: "UTC", color: "brand", exceptions: [] } },
  ];
  beforeAll(async () => {
    Object.assign(process.env, { DATABASE_URL: process.env.TEST_DATABASE_URL, DATABASE_URL_UNPOOLED: process.env.TEST_DATABASE_URL, AUTH_SECRET: "fixture-auth-secret-for-isolated-tests-only", CRON_SECRET: "fixture-cron-secret-for-isolated-tests-only", APP_URL: "http://localhost:3000", RESEND_API_KEY: "fixture-key", EMAIL_FROM: "test@example.com", OBJECT_STORAGE_ENDPOINT: "https://storage.example.com", OBJECT_STORAGE_REGION: "us-east-2", OBJECT_STORAGE_BUCKET: "fixture", OBJECT_STORAGE_ACCESS_KEY_ID: "fixture-key", OBJECT_STORAGE_SECRET_ACCESS_KEY: "fixture-secret" });
    db = (await import("@/lib/db")).getDb(); schema = await import("@/lib/db/schema");
    mutate = (await import("@/lib/services/mutations")).mutate;
    auth = (await import("@/lib/auth")).getAuth();
    const { hash } = await import("@node-rs/argon2");
    await db.insert(schema.users).values([{ id: ids.a, email: `${ids.a}@example.com`, name: "A", acceptedTermsAt: new Date() }, { id: ids.b, email: `${ids.b}@example.com`, name: "B", acceptedTermsAt: new Date() }, { id: ids.admin, email: `${ids.admin}@example.com`, name: "Admin", role: "super_admin" }]);
    await db.insert(schema.accounts).values({ userId: ids.a, accountId: ids.a, providerId: "credential", password: await hash("fixture-password-only") });
    await mutate(ids.b, fixtures);
    await mutate(ids.b, [{ kind: "timer", value: { command: "start", subjectId: ids.subject, topicId: ids.topic } }]);
  });
  afterAll(async () => { for (const id of [ids.a, ids.b, ids.admin]) await db.delete(schema.users).where(eq(schema.users.id, id)); });
  it("logs in as A and cannot read, update, delete or attach B's records", async () => {
    const response = await auth.handler(new Request("http://localhost:3000/api/auth/sign-in/email", { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" }, body: JSON.stringify({ email: `${ids.a}@example.com`, password: "fixture-password-only" }) }));
    expect(response.status).toBe(200);
    const result = await response.json() as { user: { id: string } };
    expect(result.user.id).toBe(ids.a);
    const { loadWorkspace } = await import("@/lib/services/workspace");
    const workspace = await loadWorkspace(result.user.id);
    for (const key of ["subjects", "topics", "resources", "sessions", "blocks"] as const) expect(workspace[key]).toHaveLength(0);
    expect(workspace.timer).toBeNull();
    for (const operation of fixtures) await expect(mutate(result.user.id, [operation])).rejects.toThrow("recordUnavailable");
    for (const [entity, id] of [["subject", ids.subject], ["topic", ids.topic], ["resource", ids.resource], ["session", ids.session], ["block", ids.block]] as const) await expect(mutate(ids.a, [{ kind: "delete", entity, id }])).rejects.toThrow("recordUnavailable");
    await expect(mutate(ids.a, [{ kind: "timer", value: { command: "start", subjectId: ids.subject, topicId: ids.topic } }])).rejects.toThrow("recordUnavailable");
    for (const command of ["pause", "resume", "discard"] as const) await expect(mutate(ids.a, [{ kind: "timer", value: { command } }])).rejects.toThrow("recordUnavailable");
    const { requestUpload, confirmUpload } = await import("@/lib/services/uploads");
    await expect(requestUpload(ids.a, { subjectId: ids.subject, title: "File", name: "file.pdf", mimeType: "application/pdf", sizeBytes: 10 })).rejects.toThrow();
    await expect(confirmUpload(ids.a, ids.resource)).rejects.toThrow("recordUnavailable");
    await expect(mutate(ids.a, [{ kind: "settings", value: { streakMinutes: 10, maxFileSizeMB: 10, storagePerUserMB: 100 } }])).rejects.toThrow("recordUnavailable");
  });
  it("returns only private-content-free admin statistics", async () => {
    const { loadWorkspace } = await import("@/lib/services/workspace");
    const data = JSON.stringify(await loadWorkspace(ids.admin));
    for (const secret of ["private subject", "private description", "private topic", "private resource", "private session note", "private plan"]) expect(data).not.toContain(secret);
  });
  it("permits only one timer and deletes cascaded records without orphans", async () => {
    await mutate(ids.b, [{ kind: "timer", value: { command: "discard" } }]);
    const results = await Promise.allSettled([mutate(ids.b, [{ kind: "timer", value: { command: "start", subjectId: ids.subject } }]), mutate(ids.b, [{ kind: "timer", value: { command: "start", subjectId: ids.subject } }])]);
    expect(results.filter(row => row.status === "fulfilled")).toHaveLength(1);
    await mutate(ids.b, [{ kind: "delete", entity: "subject", id: ids.subject }]);
    expect(await db.select().from(schema.topics).where(eq(schema.topics.id, ids.topic))).toHaveLength(0);
    expect(await db.select().from(schema.resources).where(eq(schema.resources.id, ids.resource))).toHaveLength(0);
    expect(await db.select().from(schema.studySessions).where(eq(schema.studySessions.id, ids.session))).toHaveLength(0);
    expect(await db.select().from(schema.scheduleBlocks).where(eq(schema.scheduleBlocks.id, ids.block))).toHaveLength(0);
    expect(await db.select().from(schema.activeTimers).where(eq(schema.activeTimers.userId, ids.b))).toHaveLength(0);
    const [preferences] = await db.select().from(schema.preferences).where(eq(schema.preferences.userId, ids.b));
    expect(preferences.highestStreak).toBeGreaterThanOrEqual(1);
  });
  it("rejects deactivated accounts", async () => {
    await mutate(ids.admin, [{ kind: "userStatus", id: ids.a, status: "inactive" }]);
    await expect(mutate(ids.a, [{ kind: "profile", value: { name: "A", timezone: "UTC", weeklyTargetMinutes: 0, theme: "auto", weekStartDay: 1, reminders: true } }])).rejects.toThrow("accountInactive");
    const response = await auth.handler(new Request("http://localhost:3000/api/auth/sign-in/email", { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" }, body: JSON.stringify({ email: `${ids.a}@example.com`, password: "fixture-password-only" }) }));
    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});
