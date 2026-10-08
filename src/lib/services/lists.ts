import "server-only";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { studySessions } from "@/lib/db/schema";
import { getOccurrences } from "@/lib/schedule";
import { zonedToUtc } from "@/lib/analytics";
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
export async function getScheduleBlocksInRange(userId: string, range: z.infer<typeof rangeSchema>, timezone = "UTC"): Promise<ScheduleBlock[]> {
  const fromUtc = zonedToUtc(`${range.from}T00:00`, timezone);
  const toUtc = zonedToUtc(`${range.to}T00:00`, timezone);
  const result = await getDb().execute<{
    id: string; subject_id: string | null; topic_id: string | null; title: string;
    starts_at: string; ends_at: string; recurrence_rule: { weekdays: number[]; until?: string } | null;
    timezone: string; note: string | null; display_color: string; created_at: string; updated_at: string;
    exceptions: Array<{ date: string; isCancelled: boolean; newTitle: string | null; newNote: string | null;
      newColor: string | null; newSubjectId: string | null; newTopicId: string | null;
      newStartsAt: string | null; newEndsAt: string | null; overrides: import("@/types").ScheduleException["overrides"] }>;
  }>(sql`
    SELECT b.id, b.subject_id, b.topic_id, b.title, b.starts_at, b.ends_at,
      b.recurrence_rule, b.timezone, b.note, b.display_color, b.created_at, b.updated_at,
      coalesce(e.items, '[]'::jsonb) AS exceptions
    FROM schedule_blocks b
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object('date', e.date, 'isCancelled', e.is_cancelled,
        'newTitle', e.new_title, 'newNote', e.new_note, 'newColor', e.new_color,
        'newSubjectId', e.new_subject_id, 'newTopicId', e.new_topic_id,
        'newStartsAt', e.new_starts_at, 'newEndsAt', e.new_ends_at, 'overrides', e.overrides)) AS items
      FROM schedule_exceptions e WHERE e.block_id = b.id AND (
        e.date BETWEEN ((${fromUtc}::timestamptz - (b.ends_at - b.starts_at)) AT TIME ZONE b.timezone)::date AND (${toUtc}::timestamptz AT TIME ZONE b.timezone)::date
        OR (e.new_starts_at < ${toUtc}::timestamptz AND e.new_ends_at > ${fromUtc}::timestamptz)
      )
    ) e ON true
    WHERE b.user_id = ${userId}::uuid
      AND ((b.starts_at < ${toUtc}::timestamptz AND (
        (b.recurrence_rule IS NULL AND b.ends_at > ${fromUtc}::timestamptz)
        OR (b.recurrence_rule IS NOT NULL AND EXISTS (
          SELECT 1 FROM generate_series(
            date_trunc('day', (${fromUtc}::timestamptz - (b.ends_at - b.starts_at)) AT TIME ZONE b.timezone),
            date_trunc('day', (${toUtc}::timestamptz - interval '1 microsecond') AT TIME ZONE b.timezone), interval '1 day') day
          WHERE day::date >= (b.starts_at AT TIME ZONE b.timezone)::date
            AND (b.recurrence_rule->>'until' IS NULL OR day::date <= (b.recurrence_rule->>'until')::date)
            AND (b.recurrence_rule->'weekdays') @> jsonb_build_array(extract(dow FROM day)::integer)
        ))
      )) OR EXISTS (SELECT 1 FROM schedule_exceptions moved WHERE moved.block_id = b.id
        AND NOT moved.is_cancelled AND moved.new_starts_at < ${toUtc}::timestamptz
        AND moved.new_ends_at > ${fromUtc}::timestamptz))
    ORDER BY b.starts_at
  `);
  return result.rows.map(row => ({ id: row.id, userId,
    subjectId: row.subject_id ?? undefined, topicId: row.topic_id ?? undefined, title: row.title,
    startsAt: new Date(row.starts_at).toISOString(), endsAt: new Date(row.ends_at).toISOString(),
    repeat: row.recurrence_rule ? "weekly" : "once", weekdays: row.recurrence_rule?.weekdays ?? [],
    recurrenceUntil: row.recurrence_rule?.until, timezone: row.timezone, note: row.note ?? undefined,
    color: row.display_color as SubjectColor, createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    exceptions: row.exceptions.map(e => ({ date: e.date, cancelled: e.isCancelled, overrides: e.overrides ?? undefined,
      title: e.newTitle ?? undefined, note: e.newNote ?? undefined, color: (e.newColor ?? undefined) as SubjectColor | undefined,
      subjectId: e.newSubjectId ?? undefined, topicId: e.newTopicId ?? undefined,
      startsAt: e.newStartsAt ? new Date(e.newStartsAt).toISOString() : undefined,
      endsAt: e.newEndsAt ? new Date(e.newEndsAt).toISOString() : undefined })) }));
}
export async function getBlocksInRange(userId: string, range: z.infer<typeof rangeSchema>) {
  return getOccurrences(await getScheduleBlocksInRange(userId, range), range.from, range.to);
}
