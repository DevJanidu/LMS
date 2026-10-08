import "server-only";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import type { User } from "@/types";

export const adminUserFilterSchema = z.object({ page: z.number().int().min(1).max(100000).default(1), search: z.string().trim().max(100).default(""), status: z.enum(["active", "inactive"]).optional(), activity: z.enum(["recent", "none"]).optional(), joined: z.enum(["30", "90"]).optional(), sort: z.enum(["name", "email", "createdAt", "lastActiveAt", "studyTime", "status"]).default("name"), direction: z.enum(["asc", "desc"]).default("asc") });
export interface AdminUserRow { user: User; seconds: number }
export interface AdminUserPage { total: number; rows: AdminUserRow[] }
/** Caller is requireAdmin(); explicit columns and 20 rows, no learner text. */
export async function listAdminUsers(filter: z.infer<typeof adminUserFilterSchema>): Promise<AdminUserPage> {
  const db = getDb(), pattern = `%${filter.search.replace(/[\\%_]/g, "\\$&")}%`;
  const columns = { name: sql`u.name`, email: sql`u.email`, createdAt: sql`u.created_at`, lastActiveAt: sql`u.last_active_at`, studyTime: sql`coalesce(a.seconds,0)`, status: sql`u.status` };
  const direction = filter.direction === "asc" ? sql`asc` : sql`desc`;
  const where = sql`u.role = 'learner'
    ${filter.search ? sql`AND (u.name ILIKE ${pattern} OR u.email ILIKE ${pattern})` : sql``}
    ${filter.status ? sql`AND u.status = ${filter.status === "active" ? "active" : "deactivated"}::user_status` : sql``}
    ${filter.activity === "recent" ? sql`AND a.recent` : filter.activity === "none" ? sql`AND NOT coalesce(a.recent,false)` : sql``}
    ${filter.joined ? sql`AND u.created_at >= now() - ${Number(filter.joined)} * interval '1 day'` : sql``}`;
  const base = sql`WITH activity AS (SELECT user_id,sum(duration_seconds) AS seconds,bool_or(started_at BETWEEN now() - interval '7 days' AND now()) AS recent FROM study_sessions WHERE status='valid' AND duration_seconds>=60 GROUP BY user_id)`;
  type Row = { id: string; name: string; email: string; status: string; timezone: string; learning_context: string | null; created_at: Date; updated_at: Date; last_active_at: Date; seconds: string; weekly_target_minutes: number | null; theme: User["theme"] | null; week_start_day: 0 | 1 | null; reminders: boolean | null; highest_streak: number | null };
  const [result, total] = await Promise.all([
    db.execute<Row>(sql`${base} SELECT u.id,u.name,u.email,u.status,u.timezone,u.learning_context,u.created_at,u.updated_at,u.last_active_at,coalesce(a.seconds,0)::text AS seconds,p.weekly_target_minutes,p.theme,p.week_start_day,p.reminders,p.highest_streak FROM users u LEFT JOIN activity a ON a.user_id=u.id LEFT JOIN user_preferences p ON p.user_id=u.id WHERE ${where} ORDER BY ${columns[filter.sort]} ${direction},u.id LIMIT 20 OFFSET ${(filter.page - 1) * 20}`),
    db.execute<{ count: string }>(sql`${base} SELECT count(*)::text AS count FROM users u LEFT JOIN activity a ON a.user_id=u.id WHERE ${where}`),
  ]);
  return { total: Number(total.rows[0].count), rows: result.rows.map(row => ({ seconds: Number(row.seconds), user: { id: row.id, name: row.name, email: row.email, role: "learner", status: row.status === "active" ? "active" : "inactive", timezone: row.timezone, learningContext: row.learning_context ?? undefined, createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString(), lastActiveAt: new Date(row.last_active_at).toISOString(), weeklyTargetMinutes: row.weekly_target_minutes ?? 0, theme: row.theme ?? "auto", weekStartDay: row.week_start_day ?? 1, reminders: row.reminders ?? true, longestStreak: row.highest_streak ?? 0 } })) };
}
