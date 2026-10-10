import "server-only";
import { z } from "zod";
import type { users } from "@/lib/db/schema";
import { listSessions, sessionFilterSchema, getBlocksInRange, rangeSchema } from "./lists";
import { listResources, resourceFilterSchema } from "./resources";
import { listAdminUsers, adminUserFilterSchema } from "./admin-users";
import { timed } from "@/lib/perf";
type Account = typeof users.$inferSelect;
// Callers authorize the live account before invoking these scoped reads.
export async function querySessions(user: Account, input: unknown) {
  const parsed = sessionFilterSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalidInput" };
  try { return { ok: true as const, data: await listSessions(user.id, user.timezone, parsed.data) }; }
  catch { return { ok: false as const, error: "databaseUnavailable" }; }
}

export async function queryBlocks(user: Account, input: unknown) {
  const parsed = rangeSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalidInput" };
  try { return { ok: true as const, data: await timed("page.calendar.range", () => getBlocksInRange(user.id, parsed.data)) }; }
  catch { return { ok: false as const, error: "databaseUnavailable" }; }
}

export async function searchWorkspace(user: Account, input: unknown) {
  const parsed = z.string().trim().min(1).max(100).safeParse(input);
  if (!parsed.success) return { subjects: [], topics: [], resources: [] };
  const query = parsed.data;
  const { getDb } = await import("@/lib/db");
  const s = await import("@/lib/db/schema");
  const { and, eq, ilike } = await import("drizzle-orm");
  const escaped = query.replace(/[\\%_]/g, "\\$&");
  const pattern = `%${escaped}%`;
  const db = getDb();
  const [subjects, topics, resources] = await Promise.all([
    db.select({ id: s.subjects.id, title: s.subjects.title }).from(s.subjects).where(and(eq(s.subjects.userId, user.id), ilike(s.subjects.title, pattern))).limit(20),
    db.select({ id: s.topics.id, subjectId: s.topics.subjectId, title: s.topics.title }).from(s.topics).innerJoin(s.subjects, eq(s.topics.subjectId, s.subjects.id)).where(and(eq(s.subjects.userId, user.id), ilike(s.topics.title, pattern))).limit(20),
    db.select({ id: s.resources.id, title: s.resources.title }).from(s.resources).where(and(eq(s.resources.userId, user.id), ilike(s.resources.title, pattern))).limit(20),
  ]);
  return { subjects, topics, resources };
}

export async function resourceDetail(user: Account, input: unknown) {
  const id = z.string().uuid().safeParse(input);
  if (!id.success) return { ok: false as const, error: "invalidInput" };
  const { getDb } = await import("@/lib/db");
  const { resources } = await import("@/lib/db/schema");
  const { and, eq } = await import("drizzle-orm");
  try {
    const [resource] = await getDb().select({ textContent: resources.textContent }).from(resources).where(and(eq(resources.id, id.data), eq(resources.userId, user.id)));
    if (!resource) return { ok: false as const, error: "recordUnavailable" };
    return { ok: true as const, textContent: resource.textContent ?? undefined };
  } catch { return { ok: false as const, error: "databaseUnavailable" }; }
}

export async function queryResources(user: Account, input: unknown) {
  const parsed = resourceFilterSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalidInput" };
  try { return { ok: true as const, data: await listResources(user.id, parsed.data) }; }
  catch { return { ok: false as const, error: "databaseUnavailable" }; }
}

export async function queryAdminUsers(_user: Account, input: unknown) {
  const parsed = adminUserFilterSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalidInput" };
  try { return { ok: true as const, data: await listAdminUsers(parsed.data) }; }
  catch { return { ok: false as const, error: "databaseUnavailable" }; }
}
