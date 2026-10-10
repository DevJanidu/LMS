import "server-only";
import { cache } from "react";
import { and, asc, desc, eq, inArray, sql, getTableColumns } from "drizzle-orm";
import { getDb } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { after } from "next/server";
import { learnerAnalytics } from "@/lib/analytics/server";
import { subjectStatistics } from "./subject-statistics";
import { platformAnalytics } from "@/lib/analytics/platform";
import type { Workspace, User, SubjectColor, Notification, AuditLog } from "@/types";
import { timed } from "@/lib/perf";

const iso = (value: Date) => value.toISOString();
const preferenceRowsFor = cache((userId: string) => getDb().select().from(s.preferences).where(eq(s.preferences.userId, userId)));
const timerRowsFor = cache((userId: string) => getDb().select().from(s.activeTimers).where(eq(s.activeTimers.userId, userId)));
const notificationRowsFor = cache((userId: string) => getDb().select().from(s.notifications).where(eq(s.notifications.userId, userId)).orderBy(desc(s.notifications.scheduledFor)).limit(20));
export { invalidateSettings } from "@/lib/cache";
// Quotas and registration policy are a tiny authoritative table. Request-local
// memoization avoids duplicates without trusting optional Redis invalidation.
export const getSettings = cache(async () => {
  const values = Object.fromEntries((await getDb().select().from(s.appSettings)).map(row => [row.key, row.value]));
  const value = { streakMinutes: Number(values.streakMinutes ?? 10), maxFileSizeMB: Number(values.maxFileSizeMB ?? 10), storagePerUserMB: Number(values.storagePerUserMB ?? 100), minimumAge: Number(values.minimumAge ?? 0) };
  return value;
});
export async function loadWorkspace(userId: string, options: { adminTargetId?: string; account?: typeof s.users.$inferSelect } = {}): Promise<Workspace> {
  const db = getDb();
  const account = options.account?.id === userId ? options.account : (await db.select().from(s.users).where(eq(s.users.id, userId)))[0];
  if (!account || account.status !== "active") throw new Error("Account unavailable.");
  const admin = account.role === "super_admin";
  if (options.adminTargetId && !admin) throw new Error("Account unavailable.");
  const target = options.adminTargetId;
  // Start reads that do not depend on the subject list or preferences now.
  // Neon round trips dominate the audited workspace load, so they must not
  // wait behind the first group of queries.
  const sessionRowsRead = admin && !target ? Promise.resolve([]) : db.select({ id: s.studySessions.id, userId: s.studySessions.userId, subjectId: s.studySessions.subjectId, topicId: s.studySessions.topicId, startedAt: s.studySessions.startedAt, endedAt: s.studySessions.endedAt, durationSeconds: s.studySessions.durationSeconds, status: s.studySessions.status, source: s.studySessions.source, createdAt: s.studySessions.createdAt }).from(s.studySessions).where(eq(s.studySessions.userId, target ?? userId)).orderBy(desc(s.studySessions.startedAt)).limit(20);
  const blockRowsRead = admin ? Promise.resolve([]) : db.select().from(s.scheduleBlocks).where(eq(s.scheduleBlocks.userId, userId)).limit(10000);
  const notificationRowsRead = admin ? Promise.resolve([]) : notificationRowsFor(userId);
  const auditRowsRead = admin ? db.select().from(s.auditLogs).orderBy(desc(s.auditLogs.createdAt)).limit(100) : Promise.resolve([]);
  const timerRowsRead = admin ? Promise.resolve([]) : timerRowsFor(userId);
  const resourceTotalsRead = admin ? Promise.resolve([]) : db.select({ subjectId: s.resources.subjectId, count: sql<number>`count(*)::integer`, bytes: sql<string>`coalesce(sum(${s.resources.sizeBytes}), 0)::text` }).from(s.resources).where(eq(s.resources.userId, userId)).groupBy(s.resources.subjectId);
  const ranked = db.select({ ...getTableColumns(s.studySessions), rank: sql<number>`row_number() over (partition by ${s.studySessions.subjectId} order by ${s.studySessions.startedAt} desc)`.as("rank") }).from(s.studySessions).where(eq(s.studySessions.userId, userId)).as("recent_subject_sessions");
  const subjectRecentRead = admin ? Promise.resolve([]) : db.select().from(ranked).where(sql`${ranked.rank} <= 3`);
  const [userRows, preferenceRows, subjectRows, settings] = await timed("workspace.base", () => Promise.all([
    admin ? db.select().from(s.users).where(target ? eq(s.users.id, target) : eq(s.users.role, "learner")).orderBy(desc(s.users.createdAt)).limit(20) : Promise.resolve([account]),
    admin ? db.select().from(s.preferences).where(target ? inArray(s.preferences.userId, [userId, target]) : eq(s.preferences.userId, userId)) : preferenceRowsFor(userId),
    admin && !target ? Promise.resolve([]) : db.select({ id: s.subjects.id, userId: s.subjects.userId, title: admin ? s.subjects.id : s.subjects.title, description: admin ? s.subjects.id : s.subjects.description, displayColor: s.subjects.displayColor, targetDate: s.subjects.targetDate, status: s.subjects.status, createdAt: s.subjects.createdAt, updatedAt: s.subjects.updatedAt }).from(s.subjects).where(eq(s.subjects.userId, target ?? userId)).orderBy(desc(s.subjects.createdAt)).limit(10000),
    getSettings(),
  ]));
  const subjectIds = subjectRows.map(row => row.id);
  const ownerPreferences = preferenceRows.find(p => p.userId === userId);
  const targetAccount = target ? userRows.find(row => row.id === target) : undefined;
  const targetPrefs = target ? preferenceRows.find(row => row.userId === target) : undefined;
  const analyticsRead = admin ? Promise.resolve(undefined) : learnerAnalytics(userId, account.timezone, (ownerPreferences?.weekStartDay ?? 1) as 0 | 1, settings.streakMinutes, undefined, ownerPreferences?.highestStreak ?? 0, account.updatedAt.toISOString());
  const statisticsRead = admin && !target ? Promise.resolve({}) : subjectStatistics(target ?? userId, false, targetAccount?.updatedAt.toISOString() ?? account.updatedAt.toISOString());
  const platformRead = admin && !target ? platformAnalytics(account.timezone, (ownerPreferences?.weekStartDay ?? 1) as 0 | 1, !options.account) : Promise.resolve(undefined);
  const targetAnalyticsRead = targetAccount ? learnerAnalytics(targetAccount.id, targetAccount.timezone, (targetPrefs?.weekStartDay ?? 1) as 0 | 1, settings.streakMinutes, undefined, targetPrefs?.highestStreak ?? 0, targetAccount.updatedAt.toISOString()) : Promise.resolve(undefined);
  const [topicRows, resourceRows, sessionRows, blockRows, notificationRows, auditRows, timerRows, summaries, resourceTotals] = await timed("workspace.details", () => Promise.all([
    subjectIds.length ? db.select({ id: s.topics.id, subjectId: s.topics.subjectId, title: admin ? s.topics.id : s.topics.title, description: admin ? s.topics.id : s.topics.description, status: s.topics.status, targetDate: s.topics.targetDate, sortOrder: s.topics.sortOrder, completedAt: s.topics.completedAt, archived: s.topics.archived, createdAt: s.topics.createdAt, updatedAt: s.topics.updatedAt }).from(s.topics).where(inArray(s.topics.subjectId, subjectIds)).orderBy(asc(s.topics.sortOrder)) : Promise.resolve([]),
    admin ? Promise.resolve([]) : db.select({ id: s.resources.id, userId: s.resources.userId, subjectId: s.resources.subjectId, topicId: s.resources.topicId, type: s.resources.type, title: s.resources.title, url: s.resources.url, mimeType: s.resources.mimeType, sizeBytes: s.resources.sizeBytes, createdAt: s.resources.createdAt }).from(s.resources).where(eq(s.resources.userId, userId)).orderBy(desc(s.resources.createdAt), desc(s.resources.id)).limit(20),
    sessionRowsRead,
    blockRowsRead,
    notificationRowsRead,
    auditRowsRead,
    timerRowsRead,
    Promise.all([analyticsRead, statisticsRead, platformRead, targetAnalyticsRead]),
    resourceTotalsRead,
  ]));
  const exceptions = blockRows.length ? await db.select().from(s.scheduleExceptions).where(inArray(s.scheduleExceptions.blockId, blockRows.map(row => row.id))) : [];
  // Recent subject history needs three rows per subject, not the whole year.
  const subjectRecent = await subjectRecentRead;
  const recentSessionRows = [...new Map([...sessionRows, ...subjectRecent].map(row => [row.id, row])).values()].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  const mapUser = (row: typeof account): User => {
    const prefs = preferenceRows.find(p => p.userId === row.id);
    return { id: row.id, name: row.name, email: row.email, role: row.role === "super_admin" ? "admin" : "learner", status: row.status === "active" ? "active" : "inactive", timezone: row.timezone, learningContext: row.learningContext ?? undefined, createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt), lastActiveAt: iso(row.lastActiveAt), weeklyTargetMinutes: prefs?.weeklyTargetMinutes ?? 0, theme: (prefs?.theme ?? "auto") as User["theme"], weekStartDay: (prefs?.weekStartDay ?? 1) as 0 | 1, reminders: prefs?.reminders ?? true, longestStreak: prefs?.highestStreak ?? 0 };
  };
  const timer = timerRows[0];
  const [analytics, statistics, platform, adminLearnerAnalytics] = summaries;
  if (analytics && analytics.longestStreak > (ownerPreferences?.highestStreak ?? 0)) after(async () => { try { await db.transaction(async tx => {
    const [owner] = await tx.select({ id: s.users.id }).from(s.users).where(and(eq(s.users.id, userId), eq(s.users.status, "active"))).for("update");
    if (owner) await tx.insert(s.preferences).values({ userId, highestStreak: analytics.longestStreak }).onConflictDoUpdate({ target: s.preferences.userId, set: { highestStreak: sql`greatest(${s.preferences.highestStreak}, ${analytics.longestStreak})` } });
  }); } catch { console.warn(JSON.stringify({ event: "streak_preservation_failed" })); } });
  return {
    loadedAt: new Date().toISOString(),
    scope: target ? `admin:${target}` : admin ? "admin" : "learner",
    resourceCounts: Object.fromEntries(resourceTotals.map(row => [row.subjectId, row.count])),
    storageBytes: resourceTotals.reduce((sum, row) => sum + Number(row.bytes), 0),
    adminLearnerAnalytics,
    analytics,
    subjectStatistics: statistics,
    platform,
    user: mapUser(account), users: userRows.map(mapUser), settings,
    subjects: subjectRows.map(r => ({ id: r.id, userId: r.userId, title: admin ? "" : r.title, description: admin ? "" : r.description, color: r.displayColor as SubjectColor, targetDate: r.targetDate ?? undefined, status: r.status, createdAt: iso(r.createdAt), updatedAt: iso(r.updatedAt) })),
    topics: topicRows.map(r => ({ id: r.id, subjectId: r.subjectId, title: admin ? "" : r.title, description: admin ? undefined : r.description ?? undefined, status: r.status === "not_started" ? "notStarted" : r.status === "in_progress" ? "inProgress" : "completed", targetDate: r.targetDate ?? undefined, sortOrder: r.sortOrder, completedAt: r.completedAt ? iso(r.completedAt) : undefined, archived: r.archived, createdAt: iso(r.createdAt), updatedAt: iso(r.updatedAt) })),
    resources: resourceRows.map(r => ({ id: r.id, userId: r.userId, subjectId: r.subjectId, topicId: r.topicId ?? undefined, type: r.type, title: admin ? "" : r.title, url: admin ? undefined : r.url ?? undefined, mimeType: r.mimeType ?? undefined, sizeBytes: r.sizeBytes, createdAt: iso(r.createdAt) })),
    sessions: recentSessionRows.map(r => ({ id: r.id, userId: r.userId, subjectId: r.subjectId, topicId: r.topicId ?? undefined, startedAt: iso(r.startedAt), endedAt: iso(r.endedAt), durationSeconds: r.durationSeconds, status: r.status, source: r.source, createdAt: iso(r.createdAt) })),
    blocks: blockRows.map(r => ({ id: r.id, userId: r.userId, subjectId: r.subjectId ?? undefined, topicId: r.topicId ?? undefined, title: r.title, startsAt: iso(r.startsAt), endsAt: iso(r.endsAt), repeat: r.recurrenceRule ? "weekly" : "once", weekdays: r.recurrenceRule?.weekdays ?? [], recurrenceUntil: r.recurrenceRule?.until, timezone: r.timezone, note: r.note ?? undefined, color: r.displayColor as SubjectColor, exceptions: exceptions.filter(e => e.blockId === r.id).map(e => ({ date: e.date, cancelled: e.isCancelled, overrides: e.overrides ?? undefined, title: e.newTitle ?? undefined, note: e.newNote ?? undefined, color: (e.newColor ?? undefined) as SubjectColor | undefined, subjectId: e.newSubjectId ?? undefined, topicId: e.newTopicId ?? undefined, startsAt: e.newStartsAt ? iso(e.newStartsAt) : undefined, endsAt: e.newEndsAt ? iso(e.newEndsAt) : undefined })), createdAt: iso(r.createdAt), updatedAt: iso(r.updatedAt) })),
    notifications: notificationRows.map(r => ({ ...r, type: r.type as Notification["type"], scheduledFor: iso(r.scheduledFor), readAt: r.readAt ? iso(r.readAt) : undefined, createdAt: iso(r.createdAt) })),
    auditLogs: auditRows.map(r => ({ id: r.id, actorUserId: r.actorUserId ?? "", action: r.action as AuditLog["action"], targetType: r.targetType as AuditLog["targetType"], targetId: r.targetId, createdAt: iso(r.createdAt) })),
    timer: timer ? { subjectId: timer.subjectId, topicId: timer.topicId ?? undefined, startedAt: iso(timer.startedAt), pausedAt: timer.pausedAt ? iso(timer.pausedAt) : undefined, pausedTotalSeconds: timer.pausedTotalSeconds, confirmedUntilSeconds: timer.confirmedUntilSeconds, focusGoal: timer.focusGoal ?? undefined } : null,
  };
}
export const getWorkspace = cache(async () => { const account = await requireUser(); return loadWorkspace(account.id, { account }); });

/** Onboarding only needs the authenticated profile; analytics and workspace
 * history would add several database round trips before the first screen. */
export const getOnboardingWorkspace = cache(async () => {
  const account = await requireUser();
  return shellBaseWorkspace(account);
});

/** The authorized shell needs only the account record to render its stable frame. */
export function shellBaseWorkspace(account: typeof s.users.$inferSelect): Workspace {
  const admin = account.role === "super_admin";
  const user: User = {
    id: account.id, name: account.name, email: account.email,
    role: admin ? "admin" : "learner", status: "active", timezone: account.timezone,
    learningContext: account.learningContext ?? undefined,
    createdAt: iso(account.createdAt), updatedAt: iso(account.updatedAt), lastActiveAt: iso(account.lastActiveAt),
    weeklyTargetMinutes: 0, theme: "auto", weekStartDay: 1, reminders: true, longestStreak: 0,
  };
  return {
    shellOnly: true, shellPending: true, scope: admin ? "admin" : "learner", user, users: [user],
    subjects: [], topics: [], resources: [], sessions: [], blocks: [], notifications: [], auditLogs: [], timer: null,
    settings: { streakMinutes: 10, maxFileSizeMB: 10, storagePerUserMB: 100, minimumAge: 0 },
  };
}

/** Persistent chrome can stream before the feature workspace and analytics finish. */
export const getShellWorkspace = cache(async (authorizedAccount?: typeof s.users.$inferSelect): Promise<Workspace> => {
  const account = authorizedAccount ?? await requireUser(), admin = account.role === "super_admin";
  const result = await timed("shell.data", () => getDb().execute<{
    prefs: { weeklyTargetMinutes: number; theme: User["theme"]; weekStartDay: number; reminders: boolean; highestStreak: number } | null;
    subjects: Array<{ id: string; title: string; displayColor: string; targetDate: string | null;
      status: "active" | "archived"; createdAt: string; updatedAt: string }>;
    timer: { subjectId: string; topicId: string | null; startedAt: string; pausedAt: string | null;
      pausedTotalSeconds: number; confirmedUntilSeconds: number; focusGoal: string | null } | null;
    notifications: Array<{ id: string; type: string; title: string; body: string;
      scheduledFor: string; readAt: string | null; createdAt: string }>;
    settings: Record<string, number>;
  }>(sql`
    SELECT
      (SELECT jsonb_build_object('weeklyTargetMinutes', weekly_target_minutes,
        'theme', theme, 'weekStartDay', week_start_day, 'reminders', reminders,
        'highestStreak', highest_streak)
        FROM user_preferences WHERE user_id = ${account.id}::uuid) AS prefs,
      (SELECT coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'title', q.title,
        'displayColor', q.display_color, 'targetDate', q.target_date,
        'status', q.status, 'createdAt', q.created_at, 'updatedAt', q.updated_at)), '[]'::jsonb)
        FROM (SELECT id, title, display_color, target_date, status, created_at, updated_at
          FROM subjects WHERE user_id = ${account.id}::uuid AND status = 'active'
          ORDER BY created_at DESC LIMIT 50) q) AS subjects,
      (SELECT jsonb_build_object('subjectId', subject_id, 'topicId', topic_id,
        'startedAt', started_at, 'pausedAt', paused_at,
        'pausedTotalSeconds', paused_total_seconds, 'confirmedUntilSeconds', confirmed_until_seconds,
        'focusGoal', focus_goal)
        FROM active_timers WHERE user_id = ${account.id}::uuid) AS timer,
      (SELECT coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'type', q.type,
        'title', q.title, 'body', q.body, 'scheduledFor', q.scheduled_for,
        'readAt', q.read_at, 'createdAt', q.created_at)), '[]'::jsonb)
        FROM (SELECT id, type, title, body, scheduled_for, read_at, created_at
          FROM notifications WHERE user_id = ${account.id}::uuid
          ORDER BY scheduled_for DESC LIMIT 20) q) AS notifications,
      (SELECT coalesce(jsonb_object_agg(key, value), '{}'::jsonb) FROM app_settings) AS settings
  `));
  const row = result.rows[0], prefs = row.prefs, timer = row.timer;
  const user: User = { id: account.id, name: account.name, email: account.email,
    role: admin ? "admin" : "learner", status: "active", timezone: account.timezone,
    learningContext: account.learningContext ?? undefined, createdAt: iso(account.createdAt),
    updatedAt: iso(account.updatedAt), lastActiveAt: iso(account.lastActiveAt),
    weeklyTargetMinutes: Number(prefs?.weeklyTargetMinutes ?? 0), theme: prefs?.theme ?? "auto",
    weekStartDay: prefs?.weekStartDay === 0 ? 0 : 1, reminders: prefs?.reminders ?? true,
    longestStreak: Number(prefs?.highestStreak ?? 0) };
  return { shellOnly: true, scope: admin ? "admin" : "learner", user, users: [user],
    subjects: admin ? [] : row.subjects.map(item => ({ id: item.id, userId: account.id,
      title: item.title, description: "", color: item.displayColor as SubjectColor,
      targetDate: item.targetDate ?? undefined, status: item.status,
      createdAt: iso(new Date(item.createdAt)), updatedAt: iso(new Date(item.updatedAt)) })),
    topics: [], resources: [], sessions: [], blocks: [],
    notifications: admin ? [] : row.notifications.map(item => ({ id: item.id, userId: account.id,
      type: item.type as Notification["type"], title: item.title, body: item.body,
      scheduledFor: iso(new Date(item.scheduledFor)), readAt: item.readAt ? iso(new Date(item.readAt)) : undefined,
      createdAt: iso(new Date(item.createdAt)) })), auditLogs: [],
    settings: { streakMinutes: Number(row.settings.streakMinutes ?? 10),
      maxFileSizeMB: Number(row.settings.maxFileSizeMB ?? 10),
      storagePerUserMB: Number(row.settings.storagePerUserMB ?? 100),
      minimumAge: Number(row.settings.minimumAge ?? 0) },
    timer: admin || !timer ? null : { subjectId: timer.subjectId, topicId: timer.topicId ?? undefined,
      startedAt: iso(new Date(timer.startedAt)), pausedAt: timer.pausedAt ? iso(new Date(timer.pausedAt)) : undefined,
      pausedTotalSeconds: timer.pausedTotalSeconds, confirmedUntilSeconds: timer.confirmedUntilSeconds,
      focusGoal: timer.focusGoal ?? undefined } };
});

export async function ownedSubject(userId: string, subjectId: string) {
  const [subject] = await getDb().select().from(s.subjects).where(and(eq(s.subjects.id, subjectId), eq(s.subjects.userId, userId)));
  if (!subject) throw new Error("Record unavailable.");
  return subject;
}
