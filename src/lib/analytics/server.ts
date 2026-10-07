import "server-only";
import { sql, and, eq, count } from "drizzle-orm";
import { getDb } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { localDay, shiftDay, weekStart } from "./index";
import { cachedUser, untilLocalMidnight } from "@/lib/cache";

export interface AnalyticsSummary {
  sessionCount: number;
  subjectDaily: Record<string, Record<string, number>>;
  daily: Record<string, number>;
  todaySeconds: number;
  weekSeconds: number;
  monthSeconds: number;
  totalSeconds: number;
  currentStreak: number;
  longestStreak: number;
  topicsCompletedThisMonth: number;
  subjectSeconds: Record<string, { week: number; month: number; allTime: number }>;
}
export async function learnerAnalytics(userId: string, timezone: string, firstDay: 0 | 1, thresholdMinutes: number, database?: Pick<ReturnType<typeof getDb>, "execute" | "select">, historicalLongest = 0): Promise<AnalyticsSummary> {
  const db = database ?? getDb(); const today = localDay(Date.now(), timezone), startWeek = weekStart(today, firstDay), startMonth = `${today.slice(0, 7)}-01`;
  if (!database) return cachedUser(userId, "analytics", `${timezone}:${firstDay}:${thresholdMinutes}:${historicalLongest}:${today}`, Math.min(120, untilLocalMidnight(timezone)), () => learnerAnalytics(userId, timezone, firstDay, thresholdMinutes, db, historicalLongest));
  const completedPromise = db.select({ count: count() }).from(s.topics).innerJoin(s.subjects, eq(s.topics.subjectId, s.subjects.id)).where(and(eq(s.subjects.userId, userId), eq(s.topics.archived, false), sql`(${s.topics.completedAt} AT TIME ZONE ${timezone})::date >= ${startMonth}::date`, sql`(${s.topics.completedAt} AT TIME ZONE ${timezone})::date <= ${today}::date`));
  const totalPromise = db.select({ count: count() }).from(s.studySessions).where(and(eq(s.studySessions.userId, userId), eq(s.studySessions.status, "valid"), sql`${s.studySessions.durationSeconds} >= 60`));
  // Split each session at local midnights; AT TIME ZONE respects 23/25-hour days.
  // Paused time is distributed proportionally across its recorded UTC interval.
  const result = await db.execute<{ day: string; subject_id: string; seconds: string }>(sql`
    WITH owned AS (
      SELECT subject_id, started_at, ended_at, duration_seconds
      FROM study_sessions WHERE user_id = ${userId}::uuid AND status = 'valid' AND duration_seconds >= 60
    ), fragments AS (
      SELECT subject_id, d::date::text AS day,
        duration_seconds * EXTRACT(EPOCH FROM (
          LEAST(ended_at, (d + INTERVAL '1 day') AT TIME ZONE ${timezone})
          - GREATEST(started_at, d AT TIME ZONE ${timezone})
        )) / NULLIF(EXTRACT(EPOCH FROM (ended_at - started_at)), 0) AS seconds
      FROM owned CROSS JOIN LATERAL generate_series(
        date_trunc('day', started_at AT TIME ZONE ${timezone}),
        date_trunc('day', ended_at AT TIME ZONE ${timezone}), INTERVAL '1 day'
      ) AS d
    ) SELECT day, subject_id, SUM(GREATEST(seconds, 0))::text AS seconds
      FROM fragments GROUP BY day, subject_id ORDER BY day
  `);
  const daily: Record<string, number> = {}, subjectSeconds: AnalyticsSummary["subjectSeconds"] = {}, subjectDaily: AnalyticsSummary["subjectDaily"] = {};
  let todaySeconds = 0, weekSeconds = 0, monthSeconds = 0, totalSeconds = 0;
  for (const row of result.rows) {
    const seconds = Number(row.seconds); daily[row.day] = (daily[row.day] ?? 0) + seconds;
    const subject = subjectSeconds[row.subject_id] ??= { week: 0, month: 0, allTime: 0 };
    const subjectDays = subjectDaily[row.subject_id] ??= {};
    subjectDays[row.day] = (subjectDays[row.day] ?? 0) + seconds;
    totalSeconds += seconds; subject.allTime += seconds;
    if (row.day === today) todaySeconds += seconds;
    if (row.day >= startWeek && row.day <= today) { weekSeconds += seconds; subject.week += seconds; }
    if (row.day >= startMonth && row.day <= today) { monthSeconds += seconds; subject.month += seconds; }
  }
  const valid = Object.keys(daily).filter(day => day <= today && daily[day] >= thresholdMinutes * 60).sort();
  let longestStreak = historicalLongest, run = 0, previous = "";
  for (const day of valid) { run = previous && shiftDay(previous, 1) === day ? run + 1 : 1; longestStreak = Math.max(longestStreak, run); previous = day; }
  let cursor = daily[today] >= thresholdMinutes * 60 ? today : shiftDay(today, -1), currentStreak = 0;
  while (daily[cursor] >= thresholdMinutes * 60) { currentStreak++; cursor = shiftDay(cursor, -1); }
  const [[completed], [sessionTotal]] = await Promise.all([completedPromise, totalPromise]);
  return { sessionCount: sessionTotal.count, subjectDaily, daily, todaySeconds, weekSeconds, monthSeconds, totalSeconds, currentStreak, longestStreak, topicsCompletedThisMonth: completed.count, subjectSeconds };
}
