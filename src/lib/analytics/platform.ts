import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { localDay, shiftDay, weekStart } from "./index";

export interface PlatformSummary {
  today: string; totalUsers: number; activeUsers: number; newUsers: number; sessionsToday: number; totalHours: number; activeSubjects: number;
  daily: number; weekly: number; monthly: number; averageMinutes: number; subjectsCreated: number; topicsCompleted: number;
  growth: Record<string, number>; activeByDay: Record<string, number>; sessionsByDay: Record<string, number>; secondsByDay: Record<string, number>;
  storageByUser: Record<string, number>; totalStorageBytes: number; fileCount: number;
  storageOwners: { id: string; name: string; bytes: number }[];
}
/** Caller has already verified the current database account's super_admin role. */
export async function platformAnalytics(timezone: string, firstDay: 0 | 1): Promise<PlatformSummary> {
  const db = getDb(), today = localDay(Date.now(), timezone), week = weekStart(today, firstDay), from = shiftDay(today, -89);
  const [counts, activity, growth, storage] = await Promise.all([
    db.execute<Record<string, string>>(sql`
      SELECT
        (SELECT count(*) FROM users WHERE role = 'learner')::text AS total_users,
        (SELECT count(*) FROM users u WHERE role = 'learner' AND status = 'active' AND
          (last_active_at >= now() - interval '7 days' OR EXISTS (SELECT 1 FROM study_sessions ss WHERE ss.user_id = u.id AND ss.status = 'valid' AND ss.started_at >= now() - interval '7 days')))::text AS active_users,
        (SELECT count(*) FROM users WHERE role = 'learner' AND (created_at AT TIME ZONE ${timezone})::date >= ${week}::date)::text AS new_users,
        (SELECT count(*) FROM study_sessions WHERE status = 'valid' AND (started_at AT TIME ZONE ${timezone})::date = ${today}::date)::text AS sessions_today,
        (SELECT coalesce(sum(duration_seconds), 0) FROM study_sessions WHERE status = 'valid')::text AS seconds,
        (SELECT count(*) FROM study_sessions WHERE status = 'valid')::text AS sessions,
        (SELECT count(*) FROM subjects WHERE status = 'active')::text AS active_subjects,
        (SELECT count(*) FROM subjects)::text AS subjects,
        (SELECT count(*) FROM topics WHERE status = 'completed' AND NOT archived)::text AS topics,
        (SELECT count(distinct user_id) FROM study_sessions WHERE status = 'valid' AND started_at >= now() - interval '1 day')::text AS daily,
        (SELECT count(distinct user_id) FROM study_sessions WHERE status = 'valid' AND started_at >= now() - interval '7 days')::text AS weekly,
        (SELECT count(distinct user_id) FROM study_sessions WHERE status = 'valid' AND started_at >= now() - interval '30 days')::text AS monthly
    `),
    db.execute<{ day: string; active: string; sessions: string; seconds: string }>(sql`
      SELECT (started_at AT TIME ZONE ${timezone})::date::text AS day,
        count(distinct user_id)::text AS active, count(*)::text AS sessions, sum(duration_seconds)::text AS seconds
      FROM study_sessions WHERE status = 'valid' AND (started_at AT TIME ZONE ${timezone})::date >= ${from}::date
      GROUP BY 1
    `),
    db.execute<{ day: string; total: string }>(sql`
      SELECT d::date::text AS day, count(u.id)::text AS total
      FROM generate_series(${from}::date::timestamp, ${today}::date::timestamp, interval '1 day') d
      LEFT JOIN users u ON u.role = 'learner' AND (u.created_at AT TIME ZONE ${timezone})::date <= d::date
      GROUP BY d
    `),
    db.execute<{ user_id: string; name: string; bytes: string; files: string }>(sql`
      SELECT r.user_id, u.name, coalesce(sum(r.size_bytes), 0)::text AS bytes, count(*)::text AS files
      FROM resources r JOIN users u ON u.id = r.user_id WHERE r.type = 'file' GROUP BY r.user_id, u.name ORDER BY sum(r.size_bytes) DESC
    `),
  ]);
  const c = counts.rows[0];
  return { today, totalUsers: Number(c.total_users), activeUsers: Number(c.active_users), newUsers: Number(c.new_users), sessionsToday: Number(c.sessions_today), totalHours: Math.round(Number(c.seconds) / 3600), activeSubjects: Number(c.active_subjects), daily: Number(c.daily), weekly: Number(c.weekly), monthly: Number(c.monthly), averageMinutes: Number(c.sessions) ? Math.round(Number(c.seconds) / Number(c.sessions) / 60) : 0, subjectsCreated: Number(c.subjects), topicsCompleted: Number(c.topics), growth: Object.fromEntries(growth.rows.map(r => [r.day, Number(r.total)])), activeByDay: Object.fromEntries(activity.rows.map(r => [r.day, Number(r.active)])), sessionsByDay: Object.fromEntries(activity.rows.map(r => [r.day, Number(r.sessions)])), secondsByDay: Object.fromEntries(activity.rows.map(r => [r.day, Number(r.seconds)])), storageByUser: Object.fromEntries(storage.rows.map(r => [r.user_id, Number(r.bytes)])), storageOwners: storage.rows.map(r => ({ id: r.user_id, name: r.name, bytes: Number(r.bytes) })), totalStorageBytes: storage.rows.reduce((sum, r) => sum + Number(r.bytes), 0), fileCount: storage.rows.reduce((sum, r) => sum + Number(r.files), 0) };
}
