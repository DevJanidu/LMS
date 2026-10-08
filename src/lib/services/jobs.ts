import "server-only";
import { and, eq, lt, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { deleteObject } from "@/lib/storage";
import { localDay, shiftDay, zonedToUtc } from "@/lib/analytics";
import { getOccurrences } from "@/lib/schedule";
import type { ScheduleBlock, SubjectColor } from "@/types";

export async function sweepTimers() {
  const rows = await getDb().update(s.activeTimers).set({
    pausedAt: sql`${s.activeTimers.startedAt} + (${s.activeTimers.confirmedUntilSeconds} + ${s.activeTimers.pausedTotalSeconds}) * interval '1 second'`, needsConfirmation: true,
  }).where(and(sql`${s.activeTimers.pausedAt} IS NULL`, sql`now() > ${s.activeTimers.startedAt} + (${s.activeTimers.confirmedUntilSeconds} + ${s.activeTimers.pausedTotalSeconds}) * interval '1 second'`)).returning({ id: s.activeTimers.userId });
  return { swept: rows.length };
}
export async function cleanupStorage() {
  const db = getDb();
  await db.delete(s.pendingUploads).where(lt(s.pendingUploads.createdAt, new Date(Date.now() - 86400000)));
  const pending = await db.select().from(s.pendingObjectDeletions).where(lt(s.pendingObjectDeletions.createdAt, new Date(Date.now() - 3600000))).limit(100);
  let deleted = 0;
  for (const object of pending) {
    try {
      const [resource] = await db.select({ id: s.resources.id }).from(s.resources).where(eq(s.resources.storageKey, object.storageKey));
      if (!resource) await deleteObject(object.storageKey);
      await db.delete(s.pendingObjectDeletions).where(eq(s.pendingObjectDeletions.id, object.id));
      deleted++;
    } catch { await db.update(s.pendingObjectDeletions).set({ attempts: sql`${s.pendingObjectDeletions.attempts} + 1` }).where(eq(s.pendingObjectDeletions.id, object.id)); }
  }
  return { processed: deleted };
}
export async function retainData() {
  const db = getDb();
  await db.delete(s.calendarMutations).where(lt(s.calendarMutations.createdAt, new Date(Date.now() - 30 * 86400000)));
  await db.delete(s.verifications).where(lt(s.verifications.expiresAt, new Date()));
  await db.delete(s.authSessions).where(lt(s.authSessions.expiresAt, new Date()));
  await db.delete(s.notifications).where(lt(s.notifications.createdAt, new Date(Date.now() - 90 * 86400000)));
  await db.delete(s.rateLimits).where(lt(s.rateLimits.lastRequest, Date.now() - 86400000));
  return { ok: true };
}
export async function generateReminders() {
  const db = getDb(); const now = Date.now();
  const [userRows, prefs, subjects, topics, blocks, exceptions] = await Promise.all([
    db.select({ id: s.users.id, timezone: s.users.timezone }).from(s.users).where(and(eq(s.users.role, "learner"), eq(s.users.status, "active"))),
    db.select().from(s.preferences),
    db.select({ id: s.subjects.id, userId: s.subjects.userId, title: s.subjects.title, targetDate: s.subjects.targetDate }).from(s.subjects).where(and(eq(s.subjects.status, "active"), sql`${s.subjects.targetDate} IS NOT NULL`)),
    db.select({ id: s.topics.id, userId: s.subjects.userId, title: s.topics.title, targetDate: s.topics.targetDate }).from(s.topics).innerJoin(s.subjects, eq(s.topics.subjectId, s.subjects.id)).where(and(eq(s.topics.archived, false), sql`${s.topics.status} <> 'completed'`, eq(s.subjects.status, "active"), sql`${s.topics.targetDate} IS NOT NULL`)),
    db.select().from(s.scheduleBlocks).where(sql`${s.scheduleBlocks.endsAt} >= now() - interval '1 day' OR ${s.scheduleBlocks.recurrenceRule} IS NOT NULL`),
    db.select().from(s.scheduleExceptions),
  ]);
  let created = 0;
  for (const user of userRows) {
    if (prefs.find(row => row.userId === user.id)?.reminders === false) continue;
    const today = localDay(now, user.timezone), tomorrow = shiftDay(today, 1);
    const records: (typeof s.notifications.$inferInsert)[] = [];
    const plans: ScheduleBlock[] = blocks.filter(row => row.userId === user.id).map(row => ({ id: row.id, userId: row.userId, subjectId: row.subjectId ?? undefined, topicId: row.topicId ?? undefined, title: row.title, startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString(), repeat: row.recurrenceRule ? "weekly" : "once", weekdays: row.recurrenceRule?.weekdays ?? [], recurrenceUntil: row.recurrenceRule?.until, timezone: row.timezone, color: row.displayColor as SubjectColor, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), exceptions: exceptions.filter(e => e.blockId === row.id).map(e => ({ date: e.date, cancelled: e.isCancelled, overrides: e.overrides ?? undefined, title: e.newTitle ?? undefined, note: e.newNote ?? undefined, color: (e.newColor ?? undefined) as SubjectColor | undefined, subjectId: e.newSubjectId ?? undefined, topicId: e.newTopicId ?? undefined, startsAt: e.newStartsAt?.toISOString(), endsAt: e.newEndsAt?.toISOString() })) }));
    for (const occurrence of getOccurrences(plans, shiftDay(today, -1), tomorrow)) {
      if (Date.parse(occurrence.startsAt) < now || Date.parse(occurrence.startsAt) > now + 15 * 60000) continue;
      records.push({ userId: user.id, type: "block", title: occurrence.title, body: "", scheduledFor: new Date(occurrence.startsAt), deduplicationKey: `block:${occurrence.block.id}:${occurrence.date}` });
    }
    for (const [rows, type] of [[subjects, "subjectDeadline"], [topics, "topicDeadline"]] as const) for (const row of rows) {
      if (row.userId !== user.id || !row.targetDate || ![today, tomorrow].includes(row.targetDate)) continue;
      records.push({ userId: user.id, type, title: row.title, body: "", scheduledFor: new Date(zonedToUtc(`${row.targetDate}T09:00`, user.timezone)), deduplicationKey: `${type}:${row.id}:${today}` });
    }
    if (records.length) created += (await db.insert(s.notifications).values(records).onConflictDoNothing().returning({ id: s.notifications.id })).length;
  }
  return { created };
}
