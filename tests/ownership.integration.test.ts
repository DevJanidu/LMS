import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { Operation } from "@/lib/validation/operations";

const background = vi.hoisted(() => [] as (() => Promise<void>)[]);
vi.mock("next/server", () => ({ after: (task: () => Promise<void>) => background.push(task) }));
vi.mock("next-intl/server", () => ({ getLocale: async () => "en" }));
vi.mock("@/i18n/navigation", () => ({ redirect: () => { throw new Error("unauthorized redirect"); } }));
const enabled = Boolean(process.env.TEST_DATABASE_URL) && (process.env.TEST_DATABASE_ISOLATED === "true" || process.env.TEST_DATABASE_FIXTURES_ONLY === "true");
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
  afterEach(async () => { for (const task of background.splice(0)) await task(); });
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
  }, 120000);
  it("returns only private-content-free admin statistics", async () => {
    const { loadWorkspace } = await import("@/lib/services/workspace");
    const data = JSON.stringify(await loadWorkspace(ids.admin));
    for (const secret of ["private subject", "private description", "private topic", "private resource", "private session note", "private plan"]) expect(data).not.toContain(secret);
  });
  it("preserves measured paused time when only a timer session note is edited", async () => {
    await db.update(schema.studySessions).set({ durationSeconds: 1800, source: "timer" }).where(eq(schema.studySessions.id, ids.session));
    const operation = fixtures.find(value => value.kind === "session")!;
    await mutate(ids.b, [{ ...operation, value: { ...operation.value, note: "private session note corrected" } }]);
    const [saved] = await db.select({ duration: schema.studySessions.durationSeconds, source: schema.studySessions.source, end: schema.studySessions.endedAt }).from(schema.studySessions).where(eq(schema.studySessions.id, ids.session));
    expect(saved.duration).toBe(1800);
    expect(saved.source).toBe("timer");
    expect(saved.end.toISOString()).toBe("2026-01-01T11:00:00.000Z");
  });
  it("returns committed rows and rejects stale preimages atomically", async () => {
    const id = crypto.randomUUID();
    const value = { id, title: "Confirmed", description: "", color: "brand" as const, status: "active" as const };
    const created = await mutate(ids.a, [{ kind: "subject", value }]);
    const row = created.changes.subjects![0];
    const [persisted] = await db.select().from(schema.subjects).where(eq(schema.subjects.id, id));
    expect(row.createdAt).toBe(persisted.createdAt.toISOString());
    expect(row.updatedAt).toBe(persisted.updatedAt.toISOString());
    const condition = { kind: "subject" as const, id, values: { title: row.title, updatedAt: row.updatedAt } };
    const updated = await mutate(ids.a, [{ kind: "subject", value: { ...value, title: "New value" } }], [condition]);
    expect(updated.changes.subjects![0].title).toBe("New value");
    await expect(mutate(ids.a, [{ kind: "subject", value: { ...value, title: "Stale overwrite" } }], [condition])).rejects.toThrow("recordConflict");
    expect((await db.select().from(schema.subjects).where(eq(schema.subjects.id, id)))[0].title).toBe("New value");
    const deleted = await mutate(ids.a, [{ kind: "delete", entity: "subject", id }]);
    expect(deleted.changes.deleted).toEqual([{ kind: "delete", entity: "subject", id }]);
    expect(await db.select().from(schema.subjects).where(eq(schema.subjects.id, id))).toHaveLength(0);
  });
  it("batches 200 topic inserts and reordering while enforcing the topic limit", async () => {
    const subjectId = crypto.randomUUID();
    await mutate(ids.a, [{ kind: "subject", value: { id: subjectId, title: "Bulk fixture", description: "", color: "brand", status: "active" } }]);
    const topics: Operation[] = Array.from({ length: 200 }, (_, index) => ({ kind: "topic", value: { id: crypto.randomUUID(), subjectId, title: `Topic ${index}`, status: "notStarted", sortOrder: index } }));
    const { queryCount } = await import("@/lib/db/metrics");
    const before = queryCount();
    await mutate(ids.a, topics);
    expect(queryCount() - before).toBeLessThanOrEqual(10);
    await expect(mutate(ids.a, [{ kind: "topic", value: { id: crypto.randomUUID(), subjectId, title: "Beyond limit", status: "notStarted", sortOrder: 199 } }])).rejects.toThrow("topicLimit");
    const reordered = topics.map(op => { if (op.kind !== "topic") throw new Error("Invalid fixture"); return { ...op, value: { ...op.value, sortOrder: 199 - op.value.sortOrder } }; });
    const reorderBefore = queryCount();
    await mutate(ids.a, reordered);
    expect(queryCount() - reorderBefore).toBeLessThanOrEqual(10);
    const rows = await db.select({ order: schema.topics.sortOrder }).from(schema.topics).where(eq(schema.topics.subjectId, subjectId));
    expect(rows.map(row => row.order).sort((a,b) => a-b)).toEqual(Array.from({length:200},(_,i)=>i));
  }, 120000);
  it("clears deleted topic references from preserved calendar exception JSON", async () => {
    const subjectId = crypto.randomUUID(), topicId = crypto.randomUUID(), blockId = crypto.randomUUID();
    await mutate(ids.a, [
      { kind: "subject", value: { id: subjectId, title: "Exception fixture", description: "", color: "brand", status: "active" } },
      { kind: "topic", value: { id: topicId, subjectId, title: "Exception topic", status: "notStarted", sortOrder: 0 } },
      { kind: "block", value: { id: blockId, subjectId, topicId, title: "Exception plan", startsAt: "2026-01-01T10:00:00Z", endsAt: "2026-01-01T11:00:00Z", repeat: "weekly", weekdays: [4], timezone: "UTC", color: "brand", exceptions: [{ date: "2026-01-08", cancelled: false, subjectId, topicId, overrides: { topicId } }] } },
    ]);
    await mutate(ids.a, [{ kind: "delete", entity: "topic", id: topicId }]);
    const [exception] = await db.select().from(schema.scheduleExceptions).where(eq(schema.scheduleExceptions.blockId, blockId));
    expect(exception.newTopicId).toBeNull();
    expect(exception.overrides?.topicId).toBeNull();
    const [block] = await db.select().from(schema.scheduleBlocks).where(eq(schema.scheduleBlocks.id, blockId));
    expect(block.topicId).toBeNull();
    expect(block.subjectId).toBe(subjectId);
  });
  it("clears legacy subject-only JSON references while preserving another subject's calendar plan", async () => {
    const removed = crypto.randomUUID(), kept = crypto.randomUUID(), blockId = crypto.randomUUID();
    await mutate(ids.a, [
      { kind: "subject", value: { id: removed, title: "Removed exception subject", description: "", color: "brand", status: "active" } },
      { kind: "subject", value: { id: kept, title: "Kept exception subject", description: "", color: "brand", status: "active" } },
      { kind: "block", value: { id: blockId, subjectId: kept, title: "Kept plan", startsAt: "2026-01-01T10:00:00Z", endsAt: "2026-01-01T11:00:00Z", repeat: "weekly", weekdays: [4], timezone: "UTC", color: "brand", exceptions: [] } },
    ]);
    // Reproduce a legacy record whose JSON override was not copied to FK columns.
    await db.insert(schema.scheduleExceptions).values({ blockId, date: "2026-01-08", newSubjectId: null, overrides: { subjectId: removed, topicId: null } });
    const [before] = await db.select().from(schema.scheduleBlocks).where(eq(schema.scheduleBlocks.id, blockId));
    await mutate(ids.a, [{ kind: "delete", entity: "subject", id: removed }]);
    expect(await db.select().from(schema.scheduleExceptions).where(eq(schema.scheduleExceptions.blockId, blockId))).toHaveLength(0);
    const [after] = await db.select().from(schema.scheduleBlocks).where(eq(schema.scheduleBlocks.id, blockId));
    expect(after.subjectId).toBe(kept);
    expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
  });
  it("permits only one timer and deletes cascaded records without orphans", async () => {
    await mutate(ids.b, [{ kind: "timer", value: { command: "discard" } }]);
    const results = await Promise.allSettled([mutate(ids.b, [{ kind: "timer", value: { command: "start", subjectId: ids.subject } }]), mutate(ids.b, [{ kind: "timer", value: { command: "start", subjectId: ids.subject } }])]);
    expect(results.filter(row => row.status === "fulfilled")).toHaveLength(1);
    await expect(mutate(ids.b, [{ kind: "timer", value: { command: "pause" } }], [{ kind: "timer", id: ids.b, values: { startedAt: "2000-01-01T00:00:00.000Z" } }])).rejects.toThrow("recordConflict");
    await mutate(ids.b, [{ kind: "delete", entity: "subject", id: ids.subject }]);
    expect(await db.select().from(schema.topics).where(eq(schema.topics.id, ids.topic))).toHaveLength(0);
    expect(await db.select().from(schema.resources).where(eq(schema.resources.id, ids.resource))).toHaveLength(0);
    expect(await db.select().from(schema.studySessions).where(eq(schema.studySessions.id, ids.session))).toHaveLength(0);
    expect(await db.select().from(schema.scheduleBlocks).where(eq(schema.scheduleBlocks.id, ids.block))).toHaveLength(0);
    expect(await db.select().from(schema.activeTimers).where(eq(schema.activeTimers.userId, ids.b))).toHaveLength(0);
    const [preferences] = await db.select().from(schema.preferences).where(eq(schema.preferences.userId, ids.b));
    expect(preferences.highestStreak).toBeGreaterThanOrEqual(1);
    const [revisionBefore] = await db.select({ updatedAt: schema.users.updatedAt }).from(schema.users).where(eq(schema.users.id, ids.b));
    await mutate(ids.b, [{ kind: "profile", value: { name: "B", timezone: "Asia/Colombo", weeklyTargetMinutes: 60, theme: "auto", weekStartDay: 1, reminders: true } }]);
    const [revisionAfter] = await db.select({ updatedAt: schema.users.updatedAt }).from(schema.users).where(eq(schema.users.id, ids.b));
    expect(revisionAfter.updatedAt.getTime()).toBeGreaterThan(revisionBefore.updatedAt.getTime());
  });
  it("preserves the same longest streak as analytics across DST, pauses and deletion", async () => {
    const subjectId = crypto.randomUUID(), sessionId = crypto.randomUUID();
    await mutate(ids.a, [{ kind: "profile", value: { name: "A", timezone: "America/New_York", weeklyTargetMinutes: 0, theme: "auto", weekStartDay: 1, reminders: true } },
      { kind: "subject", value: { id: subjectId, title: "Streak fixture", description: "", color: "brand", status: "active" } }]);
    const { getSettings } = await import("@/lib/services/workspace");
    const threshold = (await getSettings()).streakMinutes;
    // Three local days include the 23-hour spring DST day. Paused duration is
    // deliberately much shorter than the recorded wall-time interval.
    const value = { id: sessionId, subjectId, startedAt: "2026-03-07T05:00:00Z", endedAt: "2026-03-10T04:00:00Z" };
    await db.insert(schema.studySessions).values({ ...value, userId: ids.a, startedAt: new Date(value.startedAt), endedAt: new Date(value.endedAt), durationSeconds: threshold * 6 * 60, source: "timer", status: "valid" });
    await mutate(ids.a, [{ kind: "session", value: { ...value, note: "Keep measured duration" } }]);
    const { learnerAnalytics } = await import("@/lib/analytics/server");
    const summary = await learnerAnalytics(ids.a, "America/New_York", 1, threshold);
    const [saved] = await db.select().from(schema.preferences).where(eq(schema.preferences.userId, ids.a));
    expect(summary.longestStreak).toBe(3);
    expect(saved.highestStreak).toBe(summary.longestStreak);
    await mutate(ids.a, [{ kind: "delete", entity: "session", id: sessionId }]);
    const [after] = await db.select().from(schema.preferences).where(eq(schema.preferences.userId, ids.a));
    expect(after.highestStreak).toBe(3);
  }, 120000);
  it("rejects deactivated accounts", async () => {
    const [before] = await db.select({ updatedAt: schema.users.updatedAt }).from(schema.users).where(eq(schema.users.id, ids.a));
    const condition = { kind: "userStatus" as const, id: ids.a, values: { status: "active", updatedAt: before.updatedAt.toISOString() } };
    await mutate(ids.admin, [{ kind: "userStatus", id: ids.a, status: "inactive" }], [condition]);
    await expect(mutate(ids.admin, [{ kind: "userStatus", id: ids.a, status: "active" }], [condition])).rejects.toThrow("recordConflict");
    await expect(mutate(ids.a, [{ kind: "profile", value: { name: "A", timezone: "UTC", weeklyTargetMinutes: 0, theme: "auto", weekStartDay: 1, reminders: true } }])).rejects.toThrow("accountInactive");
    const response = await auth.handler(new Request("http://localhost:3000/api/auth/sign-in/email", { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" }, body: JSON.stringify({ email: `${ids.a}@example.com`, password: "fixture-password-only" }) }));
    expect(response.status).toBeGreaterThanOrEqual(400);
    const { loadWorkspace } = await import("@/lib/services/workspace");
    await expect(loadWorkspace(ids.a)).rejects.toThrow("Account unavailable");
    const { deleteAccount } = await import("@/lib/services/mutations");
    await expect(deleteAccount(ids.a)).rejects.toThrow("accountInactive");
  });
});
