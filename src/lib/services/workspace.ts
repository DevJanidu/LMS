import "server-only";
import { cache } from "react";
import { and, asc, desc, eq, inArray, sql, getTableColumns } from "drizzle-orm";
import { getDb } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { learnerAnalytics } from "@/lib/analytics/server";
import { subjectStatistics } from "./subject-statistics";
import { platformAnalytics } from "@/lib/analytics/platform";
import type { Workspace, User, SubjectColor, Notification, AuditLog } from "@/types";

const iso = (value: Date) => value.toISOString();
let cachedSettings: { value: Workspace["settings"]; until: number } | undefined;
export function invalidateSettings() { cachedSettings = undefined; }
export async function getSettings() {
  if (cachedSettings && cachedSettings.until > Date.now()) return cachedSettings.value;
  const values = Object.fromEntries((await getDb().select().from(s.appSettings)).map(row => [row.key, row.value]));
  const value = { streakMinutes: Number(values.streakMinutes ?? 10), maxFileSizeMB: Number(values.maxFileSizeMB ?? 10), storagePerUserMB: Number(values.storagePerUserMB ?? 100), minimumAge: Number(values.minimumAge ?? 0) };
  cachedSettings = { value, until: Date.now() + 60000 };
  return value;
}
export async function loadWorkspace(userId: string, options: { adminTargetId?: string } = {}): Promise<Workspace> {
  const db = getDb();
  const [account] = await db.select().from(s.users).where(eq(s.users.id, userId));
  if (!account || account.status !== "active") throw new Error("Account unavailable.");
  const admin = account.role === "super_admin";
  if (options.adminTargetId && !admin) throw new Error("Account unavailable.");
  const target = options.adminTargetId;
  const [userRows, preferenceRows, subjectRows, settings] = await Promise.all([
    admin ? db.select().from(s.users).where(target ? eq(s.users.id, target) : undefined).orderBy(desc(s.users.createdAt)).limit(1000) : Promise.resolve([account]),
    admin ? db.select().from(s.preferences).where(target ? inArray(s.preferences.userId, [userId, target]) : undefined).limit(1000) : db.select().from(s.preferences).where(eq(s.preferences.userId, userId)),
    db.select({ id: s.subjects.id, userId: s.subjects.userId, title: admin ? s.subjects.id : s.subjects.title, description: admin ? s.subjects.id : s.subjects.description, displayColor: s.subjects.displayColor, targetDate: s.subjects.targetDate, status: s.subjects.status, createdAt: s.subjects.createdAt, updatedAt: s.subjects.updatedAt }).from(s.subjects).where(admin ? target ? eq(s.subjects.userId, target) : undefined : eq(s.subjects.userId, userId)).orderBy(desc(s.subjects.createdAt)).limit(10000),
    getSettings(),
  ]);
  const subjectIds = subjectRows.map(row => row.id);
  const [topicRows, resourceRows, sessionRows, blockRows, notificationRows, auditRows, timerRows] = await Promise.all([
    subjectIds.length ? db.select({ id: s.topics.id, subjectId: s.topics.subjectId, title: admin ? s.topics.id : s.topics.title, description: admin ? s.topics.id : s.topics.description, status: s.topics.status, targetDate: s.topics.targetDate, sortOrder: s.topics.sortOrder, completedAt: s.topics.completedAt, archived: s.topics.archived, createdAt: s.topics.createdAt, updatedAt: s.topics.updatedAt }).from(s.topics).where(inArray(s.topics.subjectId, subjectIds)).orderBy(asc(s.topics.sortOrder)) : Promise.resolve([]),
    db.select({ id: s.resources.id, userId: s.resources.userId, subjectId: s.resources.subjectId, topicId: s.resources.topicId, type: s.resources.type, title: admin ? s.resources.id : s.resources.title, url: admin ? s.resources.id : s.resources.url, textContent: admin ? s.resources.id : s.resources.textContent, mimeType: s.resources.mimeType, sizeBytes: s.resources.sizeBytes, createdAt: s.resources.createdAt }).from(s.resources).where(admin ? undefined : eq(s.resources.userId, userId)).limit(10000),
    db.select({ id: s.studySessions.id, userId: s.studySessions.userId, subjectId: s.studySessions.subjectId, topicId: s.studySessions.topicId, startedAt: s.studySessions.startedAt, endedAt: s.studySessions.endedAt, durationSeconds: s.studySessions.durationSeconds, status: s.studySessions.status, source: s.studySessions.source, createdAt: s.studySessions.createdAt, note: admin ? s.studySessions.id : s.studySessions.note }).from(s.studySessions).where(admin ? target ? eq(s.studySessions.userId, target) : undefined : eq(s.studySessions.userId, userId)).orderBy(desc(s.studySessions.startedAt)).limit(admin && !target ? 50000 : 200),
    admin ? Promise.resolve([]) : db.select().from(s.scheduleBlocks).where(eq(s.scheduleBlocks.userId, userId)).limit(10000),
    admin ? Promise.resolve([]) : db.select().from(s.notifications).where(eq(s.notifications.userId, userId)).orderBy(desc(s.notifications.scheduledFor)).limit(100),
    admin ? db.select().from(s.auditLogs).orderBy(desc(s.auditLogs.createdAt)).limit(100) : Promise.resolve([]),
    admin ? Promise.resolve([]) : db.select().from(s.activeTimers).where(eq(s.activeTimers.userId, userId)),
  ]);
  const exceptions = blockRows.length ? await db.select().from(s.scheduleExceptions).where(inArray(s.scheduleExceptions.blockId, blockRows.map(row => row.id))) : [];
  // Recent subject history needs three rows per subject, not the whole year.
  const ranked = db.select({ ...getTableColumns(s.studySessions), rank: sql<number>`row_number() over (partition by ${s.studySessions.subjectId} order by ${s.studySessions.startedAt} desc)`.as("rank") }).from(s.studySessions).where(eq(s.studySessions.userId, userId)).as("recent_subject_sessions");
  const subjectRecent = admin ? [] : await db.select().from(ranked).where(sql`${ranked.rank} <= 3`);
  const recentSessionRows = [...new Map([...sessionRows, ...subjectRecent].map(row => [row.id, row])).values()].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  const mapUser = (row: typeof account): User => {
    const prefs = preferenceRows.find(p => p.userId === row.id);
    return { id: row.id, name: row.name, email: row.email, role: row.role === "super_admin" ? "admin" : "learner", status: row.status === "active" ? "active" : "inactive", timezone: row.timezone, learningContext: row.learningContext ?? undefined, createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt), lastActiveAt: iso(row.lastActiveAt), weeklyTargetMinutes: prefs?.weeklyTargetMinutes ?? 0, theme: (prefs?.theme ?? "auto") as User["theme"], weekStartDay: (prefs?.weekStartDay ?? 1) as 0 | 1, reminders: prefs?.reminders ?? true, longestStreak: prefs?.highestStreak ?? 0 };
  };
  const timer = timerRows[0];
  const ownerPreferences = preferenceRows.find(p => p.userId === userId);
  const analytics = admin ? undefined : await learnerAnalytics(userId, account.timezone, (ownerPreferences?.weekStartDay ?? 1) as 0 | 1, settings.streakMinutes, undefined, ownerPreferences?.highestStreak ?? 0);
  if (analytics && analytics.longestStreak > (ownerPreferences?.highestStreak ?? 0)) await db.transaction(async tx => {
    const [owner] = await tx.select({ id: s.users.id }).from(s.users).where(and(eq(s.users.id, userId), eq(s.users.status, "active"))).for("update");
    if (owner) await tx.insert(s.preferences).values({ userId, highestStreak: analytics.longestStreak }).onConflictDoUpdate({ target: s.preferences.userId, set: { highestStreak: sql`greatest(${s.preferences.highestStreak}, ${analytics.longestStreak})` } });
  });
  const statistics = await subjectStatistics(userId, admin);
  const platform = admin ? await platformAnalytics(account.timezone, (ownerPreferences?.weekStartDay ?? 1) as 0 | 1) : undefined;
  const targetAccount = target ? userRows.find(row => row.id === target) : undefined;
  const targetPrefs = target ? preferenceRows.find(row => row.userId === target) : undefined;
  const adminLearnerAnalytics = targetAccount ? await learnerAnalytics(targetAccount.id, targetAccount.timezone, (targetPrefs?.weekStartDay ?? 1) as 0 | 1, settings.streakMinutes, undefined, targetPrefs?.highestStreak ?? 0) : undefined;
  return {
    scope: target ? `admin:${target}` : admin ? "admin" : "learner",
    adminLearnerAnalytics,
    analytics,
    subjectStatistics: statistics,
    platform,
    user: mapUser(account), users: userRows.map(mapUser), settings,
    subjects: subjectRows.map(r => ({ id: r.id, userId: r.userId, title: admin ? "" : r.title, description: admin ? "" : r.description, color: r.displayColor as SubjectColor, targetDate: r.targetDate ?? undefined, status: r.status, createdAt: iso(r.createdAt), updatedAt: iso(r.updatedAt) })),
    topics: topicRows.map(r => ({ id: r.id, subjectId: r.subjectId, title: admin ? "" : r.title, description: admin ? undefined : r.description ?? undefined, status: r.status === "not_started" ? "notStarted" : r.status === "in_progress" ? "inProgress" : "completed", targetDate: r.targetDate ?? undefined, sortOrder: r.sortOrder, completedAt: r.completedAt ? iso(r.completedAt) : undefined, archived: r.archived, createdAt: iso(r.createdAt), updatedAt: iso(r.updatedAt) })),
    resources: resourceRows.map(r => ({ id: r.id, userId: r.userId, subjectId: r.subjectId, topicId: r.topicId ?? undefined, type: r.type, title: admin ? "" : r.title, url: admin ? undefined : r.url ?? undefined, textContent: admin ? undefined : r.textContent ?? undefined, mimeType: r.mimeType ?? undefined, sizeBytes: r.sizeBytes, createdAt: iso(r.createdAt) })),
    sessions: recentSessionRows.map(r => ({ id: r.id, userId: r.userId, subjectId: r.subjectId, topicId: r.topicId ?? undefined, startedAt: iso(r.startedAt), endedAt: iso(r.endedAt), durationSeconds: r.durationSeconds, status: r.status, source: r.source, note: admin ? undefined : r.note ?? undefined, createdAt: iso(r.createdAt) })),
    blocks: blockRows.map(r => ({ id: r.id, userId: r.userId, subjectId: r.subjectId ?? undefined, topicId: r.topicId ?? undefined, title: r.title, startsAt: iso(r.startsAt), endsAt: iso(r.endsAt), repeat: r.recurrenceRule ? "weekly" : "once", weekdays: r.recurrenceRule?.weekdays ?? [], recurrenceUntil: r.recurrenceRule?.until, timezone: r.timezone, note: r.note ?? undefined, color: r.displayColor as SubjectColor, exceptions: exceptions.filter(e => e.blockId === r.id).map(e => ({ date: e.date, cancelled: e.isCancelled, title: e.newTitle ?? undefined, note: e.newNote ?? undefined, color: (e.newColor ?? undefined) as SubjectColor | undefined, subjectId: e.newSubjectId ?? undefined, topicId: e.newTopicId ?? undefined, startsAt: e.newStartsAt ? iso(e.newStartsAt) : undefined, endsAt: e.newEndsAt ? iso(e.newEndsAt) : undefined })), createdAt: iso(r.createdAt), updatedAt: iso(r.updatedAt) })),
    notifications: notificationRows.map(r => ({ ...r, type: r.type as Notification["type"], scheduledFor: iso(r.scheduledFor), readAt: r.readAt ? iso(r.readAt) : undefined, createdAt: iso(r.createdAt) })),
    auditLogs: auditRows.map(r => ({ id: r.id, actorUserId: r.actorUserId ?? "", action: r.action as AuditLog["action"], targetType: r.targetType as AuditLog["targetType"], targetId: r.targetId, createdAt: iso(r.createdAt) })),
    timer: timer ? { subjectId: timer.subjectId, topicId: timer.topicId ?? undefined, startedAt: iso(timer.startedAt), pausedAt: timer.pausedAt ? iso(timer.pausedAt) : undefined, pausedTotalSeconds: timer.pausedTotalSeconds, confirmedUntilSeconds: timer.confirmedUntilSeconds, focusGoal: timer.focusGoal ?? undefined } : null,
  };
}
export const getWorkspace = cache(async () => loadWorkspace((await requireUser()).id));

export async function ownedSubject(userId: string, subjectId: string) {
  const [subject] = await getDb().select().from(s.subjects).where(and(eq(s.subjects.id, subjectId), eq(s.subjects.userId, userId)));
  if (!subject) throw new Error("Record unavailable.");
  return subject;
}
