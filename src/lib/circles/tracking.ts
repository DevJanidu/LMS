import "server-only";
import { and, eq, gte, inArray, isNull, isNotNull, lt, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { shiftDay } from "@/lib/analytics";
import {
  competitionDay, creditableSpan, creditSession, HEARTBEAT_GRACE_SECONDS, HEARTBEAT_LEASE_SECONDS, subtractSpans, verifiedStreak,
  type CreditPiece,
} from "./policy";

type Database = ReturnType<typeof getDb>;
/** A transaction from `getDb().transaction` (or the database itself for single statements). */
export type Writer = Parameters<Parameters<Database["transaction"]>[0]>[0] | Database;

/**
 * Server-observed timer spans. All times are the server clock; the browser can
 * only send commands and heartbeats, never durations or timestamps.
 */
export async function openSegment(tx: Writer, userId: string, timerStartedAt: Date, now: Date) {
  await tx.insert(s.studyTimerSegments).values({ userId, timerStartedAt, startedAt: now, lastSeenAt: now }).onConflictDoNothing();
}

/** Close the open span at the earlier of now and its last heartbeat plus grace. */
export async function closeSegment(tx: Writer, userId: string, now: Date) {
  await tx.update(s.studyTimerSegments)
    .set({ endedAt: sql`least(${now}::timestamptz, ${s.studyTimerSegments.lastSeenAt} + ${HEARTBEAT_GRACE_SECONDS} * interval '1 second')` })
    .where(and(eq(s.studyTimerSegments.userId, userId), isNull(s.studyTimerSegments.endedAt)));
}

/**
 * Extend the open span. After a silence longer than the lease, the old span is
 * closed at its last heartbeat (plus grace) and a new one starts now, so the
 * silent gap earns nothing. Returns whether a running timer was found.
 */
export async function recordHeartbeat(userId: string, now = new Date()) {
  return getDb().transaction(async tx => {
    const [timer] = await tx.select({ startedAt: s.activeTimers.startedAt, pausedAt: s.activeTimers.pausedAt }).from(s.activeTimers).where(eq(s.activeTimers.userId, userId)).for("update");
    if (!timer || timer.pausedAt) return { running: false as const };
    const [open] = await tx.select().from(s.studyTimerSegments).where(and(eq(s.studyTimerSegments.userId, userId), isNull(s.studyTimerSegments.endedAt)));
    if (open && open.timerStartedAt.getTime() === timer.startedAt.getTime() && now.getTime() - open.lastSeenAt.getTime() <= HEARTBEAT_LEASE_SECONDS * 1000) {
      await tx.update(s.studyTimerSegments).set({ lastSeenAt: now }).where(eq(s.studyTimerSegments.id, open.id));
      return { running: true as const, resumed: false };
    }
    if (open) await closeSegment(tx, userId, now);
    await openSegment(tx, userId, timer.startedAt, now);
    return { running: true as const, resumed: true };
  });
}

export interface CreditResult { pieces: CreditPiece[]; creditedSeconds: number; weekTotals: Record<string, number> }

/**
 * Credit a finished timer from its spans. Idempotent: ledger pieces are keyed by
 * (user, timer start, piece start), so a replayed or concurrent finish inserts
 * nothing and adds nothing to weekly scores.
 */
export async function creditTimer(tx: Writer, input: { userId: string; timerStartedAt: Date; sessionId: string | null; subjectId: string }, now: Date): Promise<CreditResult> {
  await closeSegment(tx, input.userId, now);
  const segments = await tx.select().from(s.studyTimerSegments)
    .where(and(eq(s.studyTimerSegments.userId, input.userId), eq(s.studyTimerSegments.timerStartedAt, input.timerStartedAt)));
  const observed = segments.map(segment => creditableSpan(segment, now.getTime())).filter((span): span is NonNullable<typeof span> => span !== null);
  if (!observed.length) return { pieces: [], creditedSeconds: 0, weekTotals: {} };
  // Time already credited to another session (e.g. a second device) is never credited again.
  const from = new Date(Math.min(...observed.map(span => span.start))), to = new Date(Math.max(...observed.map(span => span.end)));
  const taken = await tx.select({ start: s.verifiedStudyIntervals.startedAt, end: s.verifiedStudyIntervals.endedAt }).from(s.verifiedStudyIntervals)
    .where(and(eq(s.verifiedStudyIntervals.userId, input.userId), eq(s.verifiedStudyIntervals.status, "counted"), sql`${s.verifiedStudyIntervals.creditedSeconds} > 0`, sql`${s.verifiedStudyIntervals.timerStartedAt} <> ${input.timerStartedAt}`, lt(s.verifiedStudyIntervals.startedAt, to), sql`${s.verifiedStudyIntervals.endedAt} > ${from}`));
  const spans = subtractSpans(observed, taken.map(row => ({ start: row.start.getTime(), end: row.end.getTime() })));
  if (!spans.length) return { pieces: [], creditedSeconds: 0, weekTotals: {} };
  const days = [...new Set(spans.flatMap(span => [competitionDay(span.start), competitionDay(span.end - 1)]))];
  const [earned, finalized] = await Promise.all([
    tx.select({ day: s.verifiedStudyIntervals.localDay, seconds: sql<number>`sum(${s.verifiedStudyIntervals.creditedSeconds})::int` })
      .from(s.verifiedStudyIntervals)
      .where(and(eq(s.verifiedStudyIntervals.userId, input.userId), eq(s.verifiedStudyIntervals.status, "counted"), inArray(s.verifiedStudyIntervals.localDay, days)))
      .groupBy(s.verifiedStudyIntervals.localDay),
    tx.select({ week: s.competitionWeeks.weekStart }).from(s.competitionWeeks).where(isNotNull(s.competitionWeeks.finalizedAt)),
  ]);
  const byDay = new Map(earned.map(row => [row.day, Number(row.seconds)]));
  const pieces = creditSession(spans, { creditedToday: day => byDay.get(day) ?? 0, finalizedWeeks: new Set(finalized.map(row => row.week)) });
  const inserted = await tx.insert(s.verifiedStudyIntervals).values(pieces.map(piece => ({
    userId: input.userId, studySessionId: input.sessionId, subjectId: input.subjectId, timerStartedAt: input.timerStartedAt,
    startedAt: new Date(piece.start), endedAt: new Date(piece.end), localDay: piece.day, weekStart: piece.week,
    creditedSeconds: piece.creditedSeconds, excludedSeconds: piece.excludedSeconds, exclusionReason: piece.exclusionReason,
  }))).onConflictDoNothing().returning({ week: s.verifiedStudyIntervals.weekStart, seconds: s.verifiedStudyIntervals.creditedSeconds });
  const weekTotals: Record<string, number> = {};
  for (const row of inserted) weekTotals[row.week] = (weekTotals[row.week] ?? 0) + row.seconds;
  for (const [week, seconds] of Object.entries(weekTotals)) {
    await tx.insert(s.weeklyScores).values({ userId: input.userId, weekStart: week, creditedSeconds: seconds, sessions: 1 })
      .onConflictDoUpdate({ target: [s.weeklyScores.userId, s.weeklyScores.weekStart], set: { creditedSeconds: sql`${s.weeklyScores.creditedSeconds} + ${seconds}`, sessions: sql`${s.weeklyScores.sessions} + 1`, updatedAt: now } });
  }
  const creditedSeconds = inserted.reduce((sum, row) => sum + row.seconds, 0);
  if (creditedSeconds > 0) await recordProgress(tx, input.userId, { creditedSeconds, subjectId: input.subjectId, timerStartedAt: input.timerStartedAt, weeks: Object.keys(weekTotals) }, now);
  return { pieces, creditedSeconds, weekTotals };
}

/** Activity feed entries and achievements that follow from real credited time. */
async function recordProgress(tx: Writer, userId: string, credit: { creditedSeconds: number; subjectId: string; timerStartedAt: Date; weeks: string[] }, now: Date) {
  const today = competitionDay(now.getTime());
  const activities: (typeof s.socialActivities.$inferInsert)[] = [
    { userId, kind: "session", subjectId: credit.subjectId, value: credit.creditedSeconds, deduplicationKey: `session:${credit.timerStartedAt.toISOString()}` },
  ];
  const [weekly] = await tx.select({ seconds: s.weeklyScores.creditedSeconds }).from(s.weeklyScores).where(and(eq(s.weeklyScores.userId, userId), eq(s.weeklyScores.weekStart, credit.weeks.at(-1)!)));
  const weekHours = Math.floor((weekly?.seconds ?? 0) / 3600);
  for (const milestone of [5, 10, 15, 20]) if (weekHours >= milestone) activities.push({ userId, kind: "weeklyHours", value: milestone, deduplicationKey: `weeklyHours:${credit.weeks.at(-1)}:${milestone}` });
  const recent = await tx.select({ day: s.verifiedStudyIntervals.localDay, seconds: sql<number>`sum(${s.verifiedStudyIntervals.creditedSeconds})::int` })
    .from(s.verifiedStudyIntervals)
    .where(and(eq(s.verifiedStudyIntervals.userId, userId), eq(s.verifiedStudyIntervals.status, "counted"), gte(s.verifiedStudyIntervals.localDay, shiftDay(today, -60))))
    .groupBy(s.verifiedStudyIntervals.localDay);
  const streak = verifiedStreak(new Map(recent.map(row => [row.day, Number(row.seconds)])), today, 600);
  for (const milestone of [3, 7, 14, 30]) if (streak >= milestone) activities.push({ userId, kind: "streak", value: milestone, deduplicationKey: `streak:${milestone}:${shiftDay(today, -(streak - milestone))}` });
  await tx.insert(s.socialActivities).values(activities).onConflictDoNothing();
  const [lifetime] = await tx.select({ seconds: sql<number>`coalesce(sum(${s.weeklyScores.creditedSeconds}), 0)::int` }).from(s.weeklyScores).where(eq(s.weeklyScores.userId, userId));
  const keys = ["firstVerifiedSession", ...(Number(lifetime?.seconds ?? 0) >= 5 * 3600 ? ["fiveHours"] : []), ...(streak >= 7 ? ["sevenDayStreak"] : []), ...(recent.filter(row => row.day >= shiftDay(today, -6) && Number(row.seconds) >= 600).length >= 5 ? ["consistentLearner"] : [])];
  await tx.insert(s.achievements).values(keys.map(key => ({ userId, key }))).onConflictDoNothing();
}

/** Abandoned timers: close spans whose client went silent, so nothing accrues while away. */
export async function closeSilentSegments(now = new Date()) {
  const rows = await getDb().update(s.studyTimerSegments)
    .set({ endedAt: sql`${s.studyTimerSegments.lastSeenAt} + ${HEARTBEAT_GRACE_SECONDS} * interval '1 second'` })
    .where(and(isNull(s.studyTimerSegments.endedAt), lt(s.studyTimerSegments.lastSeenAt, new Date(now.getTime() - HEARTBEAT_LEASE_SECONDS * 1000))))
    .returning({ id: s.studyTimerSegments.id });
  return rows.length;
}
