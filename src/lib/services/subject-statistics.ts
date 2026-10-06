import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
export interface SubjectStatistics { progress: number; completed: number; total: number; seconds: number; sessions: number }
export async function subjectStatistics(userId: string, admin = false) {
  const result = await getDb().execute<{ id: string; completed: string; total: string; seconds: string; sessions: string }>(sql`
    WITH owned AS (SELECT id FROM subjects WHERE ${admin ? sql`true` : sql`user_id = ${userId}::uuid`}),
    topic_totals AS (
      SELECT t.subject_id, count(*) FILTER (WHERE NOT t.archived) AS total,
        count(*) FILTER (WHERE NOT t.archived AND t.status = 'completed') AS completed
      FROM topics t JOIN owned o ON o.id = t.subject_id GROUP BY t.subject_id
    ), time_totals AS (
      SELECT ss.subject_id, sum(ss.duration_seconds) AS seconds, count(*) AS sessions
      FROM study_sessions ss JOIN owned o ON o.id = ss.subject_id
      WHERE ss.status = 'valid' AND ss.duration_seconds >= 60 GROUP BY ss.subject_id
    ) SELECT o.id, coalesce(t.completed, 0)::text AS completed, coalesce(t.total, 0)::text AS total,
        coalesce(st.seconds, 0)::text AS seconds, coalesce(st.sessions, 0)::text AS sessions FROM owned o
      LEFT JOIN topic_totals t ON t.subject_id = o.id LEFT JOIN time_totals st ON st.subject_id = o.id
  `);
  return Object.fromEntries(result.rows.map(row => [row.id, { completed: Number(row.completed), total: Number(row.total), seconds: Number(row.seconds), sessions: Number(row.sessions), progress: Number(row.total) ? Math.round(Number(row.completed) / Number(row.total) * 100) : 0 }]));
}
