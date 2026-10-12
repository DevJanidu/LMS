import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDb, type DbTransaction } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { GoalError } from "@/lib/goals/service";
import { getCalendarBlock, CalendarError } from "@/lib/services/calendar";
import { calendarOccurrences } from "@/lib/calendar/model";
import { localDay, shiftDay } from "@/lib/analytics";
export interface AttendanceInput {
  blockId: string;
  date: string;
  expectedStartsAt: string;
}
export type AttendanceRecord = Omit<
  typeof s.scheduleAttendance.$inferSelect,
  "userId" | "startsAt" | "endsAt" | "attendedAt" | "completedAt" | "updatedAt"
> & {
  startsAt: string;
  endsAt: string;
  attendedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
};
export const attendanceRecord = (
  row: typeof s.scheduleAttendance.$inferSelect,
): AttendanceRecord => ({
  id: row.id,
  blockId: row.blockId,
  date: row.date,
  title: row.title,
  status: row.status,
  sessionId: row.sessionId,
  startsAt: row.startsAt.toISOString(),
  endsAt: row.endsAt.toISOString(),
  attendedAt: row.attendedAt?.toISOString() ?? null,
  completedAt: row.completedAt?.toISOString() ?? null,
  updatedAt: row.updatedAt.toISOString(),
});
export async function attendanceList(userId: string) {
  return (
    await getDb()
      .select()
      .from(s.scheduleAttendance)
      .where(eq(s.scheduleAttendance.userId, userId))
      .orderBy(desc(s.scheduleAttendance.startsAt))
      .limit(1000)
  ).map(attendanceRecord);
}
/** Called inside the account write lock. Attendance is a user report, not evidence of focused minutes. */
export async function recordAttendance(
  tx: DbTransaction,
  userId: string,
  input: AttendanceInput,
  status: "attended" | "skipped",
  now = Date.now(),
) {
  const block = await getCalendarBlock(userId, input.blockId).catch((error) => {
    if (error instanceof CalendarError)
      throw new GoalError(error.message, error.status);
    throw error;
  });
  // A moved weekly occurrence retains its original date, even when moved months away.
  const displayDay = localDay(input.expectedStartsAt, block.timezone);
  const occurrence = calendarOccurrences(
    [block],
    { from: shiftDay(displayDay, -2), to: shiftDay(displayDay, 3) },
    block.timezone,
  ).find((item) => item.date === input.date);
  if (!occurrence) throw new GoalError("recordUnavailable", 404);
  if (Date.parse(input.expectedStartsAt) !== Date.parse(occurrence.startsAt))
    throw new GoalError("attendanceChanged", 409);
  if (
    status === "attended" &&
    (now < Date.parse(occurrence.startsAt) - 30 * 60000 ||
      now > Date.parse(occurrence.endsAt) + 86400000)
  )
    throw new GoalError("attendanceWindow", 409);
  const [existing] = await tx
    .select()
    .from(s.scheduleAttendance)
    .where(
      and(
        eq(s.scheduleAttendance.userId, userId),
        eq(s.scheduleAttendance.blockId, input.blockId),
        eq(s.scheduleAttendance.date, input.date),
      ),
    );
  const same = existing?.startsAt.getTime() === Date.parse(occurrence.startsAt);
  if (same && existing.status === "completed" && status === "skipped")
    throw new GoalError("attendanceComplete", 409);
  if (same && (existing.status === "completed" || existing.status === status))
    return { record: existing, occurrence };
  const [timer] = await tx
    .select()
    .from(s.activeTimers)
    .where(eq(s.activeTimers.userId, userId));
  if (
    existing &&
    timer?.attendanceId === existing.id &&
    (status === "skipped" || !same)
  )
    throw new GoalError("attendanceInProgress", 409);
  const value = {
    userId,
    blockId: block.id,
    date: occurrence.date,
    startsAt: new Date(occurrence.startsAt),
    endsAt: new Date(occurrence.endsAt),
    title: occurrence.title,
    status,
    attendedAt: status === "attended" ? new Date(now) : null,
    completedAt: null,
    sessionId: null,
    updatedAt: new Date(now),
  };
  const [record] = await tx
    .insert(s.scheduleAttendance)
    .values(value)
    .onConflictDoUpdate({
      target: [
        s.scheduleAttendance.userId,
        s.scheduleAttendance.blockId,
        s.scheduleAttendance.date,
      ],
      set: value,
    })
    .returning();
  await tx.insert(s.auditLogs).values({
    actorUserId: userId,
    action: `study.${status}`,
    targetType: "scheduleAttendance",
    targetId: record.id,
  });
  return { record, occurrence };
}
export async function reportAttendance(
  userId: string,
  input: AttendanceInput,
  status: "attended" | "skipped",
) {
  return getDb().transaction(async (tx) => {
    const [actor] = await tx
      .select()
      .from(s.users)
      .where(eq(s.users.id, userId))
      .for("update");
    if (actor?.status !== "active" || actor.role !== "learner")
      throw new GoalError("authenticationFailed", 403);
    const result = await recordAttendance(tx, userId, input, status);
    await tx
      .update(s.users)
      .set({ updatedAt: new Date() })
      .where(eq(s.users.id, userId));
    return { attendance: attendanceRecord(result.record) };
  });
}
