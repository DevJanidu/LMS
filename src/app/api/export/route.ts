import { requireLearner } from "@/lib/auth";
import { getDb } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { eq, getTableColumns } from "drizzle-orm";
export async function GET() {
  const user = await requireLearner(), db = getDb();
  // Export all owned records, independent of UI batch/page limits. Auth tokens,
  // password hashes and verification/reset values are deliberately excluded.
  const [preferences, subjects, topics, resources, sessions, schedule, exceptions, notifications, timer] = await Promise.all([
    db.select().from(s.preferences).where(eq(s.preferences.userId, user.id)),
    db.select().from(s.subjects).where(eq(s.subjects.userId, user.id)),
    db.select(getTableColumns(s.topics)).from(s.topics).innerJoin(s.subjects, eq(s.topics.subjectId, s.subjects.id)).where(eq(s.subjects.userId, user.id)),
    db.select().from(s.resources).where(eq(s.resources.userId, user.id)),
    db.select().from(s.studySessions).where(eq(s.studySessions.userId, user.id)),
    db.select().from(s.scheduleBlocks).where(eq(s.scheduleBlocks.userId, user.id)),
    db.select(getTableColumns(s.scheduleExceptions)).from(s.scheduleExceptions).innerJoin(s.scheduleBlocks, eq(s.scheduleExceptions.blockId, s.scheduleBlocks.id)).where(eq(s.scheduleBlocks.userId, user.id)),
    db.select().from(s.notifications).where(eq(s.notifications.userId, user.id)),
    db.select().from(s.activeTimers).where(eq(s.activeTimers.userId, user.id)),
  ]);
  return Response.json({ user, preferences: preferences[0] ?? null, subjects, topics, resources, sessions, schedule, exceptions, notifications, timer: timer[0] ?? null }, { headers: { "Content-Disposition": "attachment; filename=acadence-data.json", "Cache-Control": "private, no-store" } });
}
