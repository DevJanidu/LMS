import "server-only";
import { and, eq, inArray, sql, getTableColumns } from "drizzle-orm";
import { getDb } from "@/lib/db";
import * as s from "@/lib/db/schema";
import type { ScheduleBlock, ScheduleException, SubjectColor } from "@/types";
import type { CalendarMutation } from "@/lib/validation/calendar";
import { applyCalendarCommand, type CalendarChange } from "@/lib/calendar/model";

export class CalendarError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
const exceptionProjection = sql<ScheduleException[]>`(SELECT coalesce(jsonb_agg(jsonb_build_object(
  'date', e.date, 'cancelled', e.is_cancelled, 'startsAt', e.new_starts_at, 'endsAt', e.new_ends_at,
  'title', e.new_title, 'subjectId', e.new_subject_id, 'topicId', e.new_topic_id, 'note', e.new_note,
  'color', e.new_color, 'overrides', e.overrides)), '[]'::jsonb)
  FROM schedule_exceptions e WHERE e.block_id = schedule_blocks.id)`;
const normalizeExceptions = (items: ScheduleException[]) => items.map(item => ({
  ...Object.fromEntries(Object.entries(item).filter(([, value]) => value !== null)),
  date: item.date, cancelled: item.cancelled,
  startsAt: item.startsAt ? new Date(item.startsAt).toISOString() : undefined,
  endsAt: item.endsAt ? new Date(item.endsAt).toISOString() : undefined,
} as ScheduleException));
function toBlock(row: typeof s.scheduleBlocks.$inferSelect, exceptions: ScheduleException[]): ScheduleBlock {
  return { id: row.id, userId: row.userId, subjectId: row.subjectId ?? undefined, topicId: row.topicId ?? undefined,
    title: row.title, startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString(), timezone: row.timezone,
    repeat: row.recurrenceRule ? "weekly" : "once", weekdays: row.recurrenceRule?.weekdays ?? [], recurrenceUntil: row.recurrenceRule?.until,
    note: row.note ?? undefined, color: row.displayColor as SubjectColor, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), exceptions };
}
export async function getCalendarBlock(userId: string, id: string) {
  const db = getDb();
  const rows = await db.select({ ...getTableColumns(s.scheduleBlocks), exceptions: exceptionProjection }).from(s.scheduleBlocks)
    .where(and(eq(s.scheduleBlocks.id, id), eq(s.scheduleBlocks.userId, userId)));
  if (!rows[0]) throw new CalendarError("recordUnavailable", 404);
  return toBlock(rows[0], normalizeExceptions(rows[0].exceptions));
}
const blockValues = (block: ScheduleBlock) => ({
  subjectId: block.subjectId ?? null, topicId: block.topicId ?? null, title: block.title,
  startsAt: new Date(block.startsAt), endsAt: new Date(block.endsAt), timezone: block.timezone,
  recurrenceRule: block.repeat === "weekly" ? { weekdays: [...new Set(block.weekdays)], until: block.recurrenceUntil } : null,
  note: block.note ?? null, displayColor: block.color, updatedAt: new Date(block.updatedAt),
});

/** No workspace reload, analytics, Redis call or route revalidation on this path. */
export async function mutateCalendar(userId: string, input: CalendarMutation): Promise<CalendarChange> {
  return getDb().transaction(async tx => {
    // Unique request IDs serialize retries. A rolled-back operation leaves no receipt.
    const receiptState = await tx.execute<{ authorized: boolean; inserted: boolean }>(sql`
      WITH actor AS (SELECT id, status, role FROM users WHERE id = ${userId}::uuid FOR SHARE),
      inserted AS (INSERT INTO calendar_mutations (id, user_id)
        SELECT ${input.operationId}::uuid, id FROM actor WHERE status = 'active' AND role = 'learner'
        ON CONFLICT DO NOTHING RETURNING id)
      SELECT EXISTS(SELECT 1 FROM actor WHERE status = 'active' AND role = 'learner') AS authorized,
        EXISTS(SELECT 1 FROM inserted) AS inserted
    `);
    if (!receiptState.rows[0].authorized) throw new CalendarError("accountInactive", 403);
    if (!receiptState.rows[0].inserted) {
      const [receipt] = await tx.select().from(s.calendarMutations).where(and(eq(s.calendarMutations.id, input.operationId), eq(s.calendarMutations.userId, userId)));
      if (!receipt?.result) throw new CalendarError("recordUnavailable", 404);
      return receipt.result;
    }
    const command = input.command;
    let original: ScheduleBlock | undefined;
    if (command.kind !== "create") {
      const [row] = await tx.select({ ...getTableColumns(s.scheduleBlocks), exceptions: exceptionProjection }).from(s.scheduleBlocks)
        .where(and(eq(s.scheduleBlocks.id, command.id), eq(s.scheduleBlocks.userId, userId))).for("update");
      if (!row) throw new CalendarError("recordUnavailable", 404);
      if (!input.expectedUpdatedAt || row.updatedAt.getTime() !== Date.parse(input.expectedUpdatedAt)) throw new CalendarError("planner.conflict", 409);
      original = toBlock(row, normalizeExceptions(row.exceptions));
    }
    const timestamp = new Date(Math.max(Date.now(), original ? Date.parse(original.updatedAt) + 1 : 0)).toISOString();
    const change = applyCalendarCommand(original, command, userId, timestamp);
    // Batch ownership validation, including exception fields. FKs enforce the same subject/topic pairing at commit.
    const references = change.blocks.flatMap(b => [{ subjectId: b.subjectId, topicId: b.topicId }, ...b.exceptions.map(e => ({ subjectId: e.overrides?.subjectId ?? e.subjectId, topicId: e.overrides?.topicId ?? e.topicId }))]);
    const subjects = [...new Set(references.map(r => r.subjectId).filter((id): id is string => Boolean(id)))];
    if (subjects.length) {
      const owned = await tx.select({ id: s.subjects.id }).from(s.subjects).where(and(eq(s.subjects.userId, userId), inArray(s.subjects.id, subjects))).for("share");
      if (owned.length !== subjects.length) throw new CalendarError("recordUnavailable", 404);
    }
    const topicRefs = references.filter(r => r.topicId);
    if (topicRefs.length) {
      const rows = await tx.select({ id: s.topics.id, subjectId: s.topics.subjectId }).from(s.topics).where(inArray(s.topics.id, [...new Set(topicRefs.map(r => r.topicId!))])).for("share");
      if (topicRefs.some(r => !r.subjectId || !rows.some(t => t.id === r.topicId && t.subjectId === r.subjectId))) throw new CalendarError("recordUnavailable", 404);
    }
    for (const id of change.removed) await tx.delete(s.scheduleBlocks).where(and(eq(s.scheduleBlocks.id, id), eq(s.scheduleBlocks.userId, userId)));
    for (const block of change.blocks) {
      if (block.id === original?.id) await tx.update(s.scheduleBlocks).set(blockValues(block)).where(and(eq(s.scheduleBlocks.id, block.id), eq(s.scheduleBlocks.userId, userId)));
      else await tx.insert(s.scheduleBlocks).values({ ...blockValues(block), id: block.id, userId });
      const previous = block.id === original?.id ? original.exceptions : [];
      const deleted = previous.filter(e => !block.exceptions.some(next => next.date === e.date)).map(e => e.date);
      if (deleted.length) await tx.delete(s.scheduleExceptions).where(and(eq(s.scheduleExceptions.blockId, block.id), inArray(s.scheduleExceptions.date, deleted)));
      const changed = block.exceptions.filter(e => JSON.stringify(previous.find(old => old.date === e.date)) !== JSON.stringify(e));
      if (changed.length) await tx.insert(s.scheduleExceptions).values(changed.map(e => ({
        blockId: block.id, date: e.date, isCancelled: e.cancelled, newStartsAt: e.startsAt ? new Date(e.startsAt) : null,
        newEndsAt: e.endsAt ? new Date(e.endsAt) : null, newTitle: e.title ?? null, newNote: e.note ?? null,
        newColor: e.color ?? null,
        newSubjectId: e.overrides && "subjectId" in e.overrides ? e.overrides.subjectId ?? null : e.subjectId ?? null,
        newTopicId: e.overrides && "topicId" in e.overrides ? e.overrides.topicId ?? null : e.topicId ?? null,
        overrides: e.overrides ?? null,
      }))).onConflictDoUpdate({ target: [s.scheduleExceptions.blockId, s.scheduleExceptions.date], set: {
        isCancelled: sql`excluded.is_cancelled`, newStartsAt: sql`excluded.new_starts_at`, newEndsAt: sql`excluded.new_ends_at`,
        newTitle: sql`excluded.new_title`, newNote: sql`excluded.new_note`, newColor: sql`excluded.new_color`,
        newSubjectId: sql`excluded.new_subject_id`, newTopicId: sql`excluded.new_topic_id`, overrides: sql`excluded.overrides`,
      } });
    }
    await tx.update(s.calendarMutations).set({ result: change }).where(and(eq(s.calendarMutations.id, input.operationId), eq(s.calendarMutations.userId, userId)));
    return change;
  });
}
