import "server-only";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { studySessions, scheduleBlocks, scheduleExceptions } from "@/lib/db/schema";
import { getOccurrences } from "@/lib/schedule";
import { ownedSubject } from "./workspace";
import type { ScheduleBlock, StudySession, SubjectColor } from "@/types";
export const sessionFilterSchema = z.object({ page: z.number().int().min(1).max(100000).default(1), subjectId: z.string().uuid().optional(), topicId: z.string().uuid().optional(), from: z.iso.date().optional(), to: z.iso.date().optional() });
export async function listSessions(userId: string, timezone: string, filter: z.infer<typeof sessionFilterSchema>) {
  if (filter.subjectId) await ownedSubject(userId, filter.subjectId);
  const where = and(eq(studySessions.userId, userId), filter.subjectId ? eq(studySessions.subjectId, filter.subjectId) : undefined, filter.topicId ? eq(studySessions.topicId, filter.topicId) : undefined, filter.from ? sql`(${studySessions.startedAt} AT TIME ZONE ${timezone})::date >= ${filter.from}::date` : undefined, filter.to ? sql`(${studySessions.startedAt} AT TIME ZONE ${timezone})::date <= ${filter.to}::date` : undefined);
  const db = getDb();
  const [rows, [total]] = await Promise.all([db.select().from(studySessions).where(where).orderBy(desc(studySessions.startedAt), desc(studySessions.id)).limit(20).offset((filter.page - 1) * 20), db.select({ count: count() }).from(studySessions).where(where)]);
  return { total: total.count, rows: rows.map((row): StudySession => ({ id: row.id, userId: row.userId, subjectId: row.subjectId, topicId: row.topicId ?? undefined, startedAt: row.startedAt.toISOString(), endedAt: row.endedAt.toISOString(), durationSeconds: row.durationSeconds, status: row.status, source: row.source, note: row.note ?? undefined, createdAt: row.createdAt.toISOString() })) };
}
export const rangeSchema = z.object({ from: z.iso.date(), to: z.iso.date() }).refine(value => value.to >= value.from && Date.parse(value.to) - Date.parse(value.from) <= 366 * 86400000);
export async function getBlocksInRange(userId: string, range: z.infer<typeof rangeSchema>) {
  const db = getDb();
  const rows = await db.select().from(scheduleBlocks).where(and(eq(scheduleBlocks.userId, userId), sql`${scheduleBlocks.recurrenceRule} IS NOT NULL OR (${scheduleBlocks.endsAt} >= ${range.from}::date - interval '1 day' AND ${scheduleBlocks.startsAt} < ${range.to}::date + interval '2 days')`));
  const exceptions = await db.select().from(scheduleExceptions).innerJoin(scheduleBlocks, eq(scheduleExceptions.blockId, scheduleBlocks.id)).where(eq(scheduleBlocks.userId, userId));
  const blocks: ScheduleBlock[] = rows.map(row => ({ id: row.id, userId, subjectId: row.subjectId ?? undefined, topicId: row.topicId ?? undefined, title: row.title, startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString(), repeat: row.recurrenceRule ? "weekly" : "once", weekdays: row.recurrenceRule?.weekdays ?? [], recurrenceUntil: row.recurrenceRule?.until, timezone: row.timezone, note: row.note ?? undefined, color: row.displayColor as SubjectColor, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), exceptions: exceptions.filter(e => e.schedule_exceptions.blockId === row.id).map(({ schedule_exceptions: e }) => ({ date: e.date, cancelled: e.isCancelled, title: e.newTitle ?? undefined, note: e.newNote ?? undefined, color: (e.newColor ?? undefined) as SubjectColor | undefined, subjectId: e.newSubjectId ?? undefined, topicId: e.newTopicId ?? undefined, startsAt: e.newStartsAt?.toISOString(), endsAt: e.newEndsAt?.toISOString() })) }));
  return getOccurrences(blocks, range.from, range.to);
}
