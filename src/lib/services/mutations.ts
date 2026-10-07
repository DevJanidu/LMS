import "server-only";
import { and, count, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import * as s from "@/lib/db/schema";
import type { Operation } from "@/lib/validation/operations";
import { timerElapsed } from "@/lib/analytics";
import { finishSnapshot } from "@/lib/timer";
import { learnerAnalytics } from "@/lib/analytics/server";
import { sql } from "drizzle-orm";
import { invalidateUser, invalidateSettings } from "@/lib/cache";

export class DomainError extends Error {}
export async function mutate(userId: string, operations: Operation[]) {
  const db = getDb();
  let timerResult: "saved" | "discarded" | undefined;
  await db.transaction(async tx => {
    // Serialize all writes per account, including concurrent tabs and quota checks.
    const [actor] = await tx.select().from(s.users).where(eq(s.users.id, userId)).for("update");
    if (!actor || actor.status !== "active") throw new DomainError("accountInactive");
    const changesHistory = actor.role === "learner" && operations.some(op => op.kind === "session" || (op.kind === "profile" && op.value.timezone !== actor.timezone) || (op.kind === "delete" && ["session", "subject"].includes(op.entity)) || (op.kind === "timer" && op.value.command === "finish"));
    const preserveHighestStreak = async () => {
      const [prefs] = await tx.select().from(s.preferences).where(eq(s.preferences.userId, userId));
      const [setting] = await tx.select({ value: s.appSettings.value }).from(s.appSettings).where(eq(s.appSettings.key, "streakMinutes"));
      const [profile] = await tx.select({ timezone: s.users.timezone }).from(s.users).where(eq(s.users.id, userId));
      const summary = await learnerAnalytics(userId, profile.timezone, (prefs?.weekStartDay ?? 1) as 0 | 1, Number(setting?.value ?? 10), tx, prefs?.highestStreak ?? 0);
      await tx.insert(s.preferences).values({ userId, highestStreak: summary.longestStreak }).onConflictDoUpdate({ target: s.preferences.userId, set: { highestStreak: sql`greatest(${s.preferences.highestStreak}, ${summary.longestStreak})` } });
    };
    if (changesHistory) await preserveHighestStreak();
    const ownSubject = async (subjectId: string, topicId?: string) => {
      const [subject] = await tx.select().from(s.subjects).where(and(eq(s.subjects.id, subjectId), eq(s.subjects.userId, userId)));
      if (!subject) throw new DomainError("recordUnavailable");
      if (topicId) {
        const [topic] = await tx.select().from(s.topics).where(and(eq(s.topics.id, topicId), eq(s.topics.subjectId, subjectId)));
        if (!topic) throw new DomainError("recordUnavailable");
      }
      return subject;
    };
    for (const operation of operations) {
      const now = new Date();
      if (["settings", "userStatus"].includes(operation.kind)) {
        if (actor.role !== "super_admin") throw new DomainError("recordUnavailable");
      } else if (actor.role !== "learner" && operation.kind !== "profile") throw new DomainError("recordUnavailable");
      switch (operation.kind) {
        case "subject": {
          const v = operation.value;
          const [existing] = await tx.select().from(s.subjects).where(eq(s.subjects.id, v.id));
          if (existing && existing.userId !== userId) throw new DomainError("recordUnavailable");
          if (v.status === "active" && existing?.status !== "active") {
            const [total] = await tx.select({ count: count() }).from(s.subjects).where(and(eq(s.subjects.userId, userId), eq(s.subjects.status, "active")));
            if (total.count >= 50) throw new DomainError("subjectLimit");
          }
          const value = { title: v.title, description: v.description, displayColor: v.color, targetDate: v.targetDate ?? null, status: v.status, updatedAt: now };
          if (existing) await tx.update(s.subjects).set(value).where(and(eq(s.subjects.id, v.id), eq(s.subjects.userId, userId)));
          else await tx.insert(s.subjects).values({ ...value, id: v.id, userId });
          break;
        }
        case "topic": {
          const v = operation.value;
          await ownSubject(v.subjectId);
          const [existing] = await tx.select().from(s.topics).where(eq(s.topics.id, v.id));
          if (existing) { await ownSubject(existing.subjectId); if (existing.subjectId !== v.subjectId) throw new DomainError("recordUnavailable"); }
          else {
            const [total] = await tx.select({ count: count() }).from(s.topics).where(eq(s.topics.subjectId, v.subjectId));
            if (total.count >= 200) throw new DomainError("topicLimit");
          }
          const status = v.status === "notStarted" ? "not_started" : v.status === "inProgress" ? "in_progress" : "completed";
          const value = { subjectId: v.subjectId, title: v.title, description: v.description ?? null, status: status as "not_started" | "in_progress" | "completed", targetDate: v.targetDate ?? null, sortOrder: v.sortOrder, archived: v.archived ?? false, completedAt: status === "completed" ? existing?.completedAt ?? now : null, updatedAt: now };
          if (existing) await tx.update(s.topics).set(value).where(eq(s.topics.id, v.id));
          else await tx.insert(s.topics).values({ ...value, id: v.id });
          break;
        }
        case "resource": {
          const v = operation.value;
          await ownSubject(v.subjectId, v.topicId);
          const [existing] = await tx.select().from(s.resources).where(eq(s.resources.id, v.id));
          if (existing && existing.userId !== userId) throw new DomainError("recordUnavailable");
          if (v.type === "file" && (!existing || existing.type !== "file")) throw new DomainError("chooseFile");
          if (existing?.type === "file" && v.type !== "file") throw new DomainError("recordUnavailable");
          const value = { subjectId: v.subjectId, topicId: v.topicId ?? null, type: v.type, title: v.title, url: v.url ?? null, textContent: v.textContent ?? null };
          if (existing) await tx.update(s.resources).set(value).where(and(eq(s.resources.id, v.id), eq(s.resources.userId, userId)));
          else await tx.insert(s.resources).values({ ...value, id: v.id, userId });
          break;
        }
        case "session": {
          const v = operation.value;
          await ownSubject(v.subjectId, v.topicId);
          const [existing] = await tx.select().from(s.studySessions).where(eq(s.studySessions.id, v.id));
          if (existing && existing.userId !== userId) throw new DomainError("recordUnavailable");
          const durationSeconds = Math.floor((Date.parse(v.endedAt) - Date.parse(v.startedAt)) / 1000);
          if (durationSeconds < 60) throw new DomainError("sessionTooShort");
          const value = { subjectId: v.subjectId, topicId: v.topicId ?? null, startedAt: new Date(v.startedAt), endedAt: new Date(v.endedAt), durationSeconds, note: v.note ?? null, source: "manual" as const, status: "valid" as const };
          if (existing) await tx.update(s.studySessions).set(value).where(and(eq(s.studySessions.id, v.id), eq(s.studySessions.userId, userId)));
          else await tx.insert(s.studySessions).values({ ...value, id: v.id, userId });
          break;
        }
        case "block": {
          const v = operation.value;
          if (v.subjectId) await ownSubject(v.subjectId, v.topicId);
          for (const exception of v.exceptions) if (exception.subjectId) await ownSubject(exception.subjectId, exception.topicId);
          const [existing] = await tx.select().from(s.scheduleBlocks).where(eq(s.scheduleBlocks.id, v.id));
          if (existing && existing.userId !== userId) throw new DomainError("recordUnavailable");
          const value = { subjectId: v.subjectId ?? null, topicId: v.topicId ?? null, title: v.title, startsAt: new Date(v.startsAt), endsAt: new Date(v.endsAt), timezone: v.timezone, recurrenceRule: v.repeat === "weekly" ? { weekdays: [...new Set(v.weekdays)], until: v.recurrenceUntil } : null, note: v.note ?? null, displayColor: v.color, updatedAt: now };
          if (existing) await tx.update(s.scheduleBlocks).set(value).where(and(eq(s.scheduleBlocks.id, v.id), eq(s.scheduleBlocks.userId, userId)));
          else await tx.insert(s.scheduleBlocks).values({ ...value, id: v.id, userId });
          await tx.delete(s.scheduleExceptions).where(eq(s.scheduleExceptions.blockId, v.id));
          if (v.exceptions.length) await tx.insert(s.scheduleExceptions).values(v.exceptions.map(e => ({ blockId: v.id, date: e.date, isCancelled: e.cancelled, newStartsAt: e.startsAt ? new Date(e.startsAt) : null, newEndsAt: e.endsAt ? new Date(e.endsAt) : null, newTitle: e.title ?? null, newNote: e.note ?? null, newColor: e.color ?? null, newSubjectId: e.subjectId ?? null, newTopicId: e.topicId ?? null })));
          break;
        }
        case "delete": {
          if (operation.entity === "topic") {
            const [row] = await tx.select().from(s.topics).where(eq(s.topics.id, operation.id));
            if (!row) throw new DomainError("recordUnavailable");
            await ownSubject(row.subjectId);
            // Deleting a topic preserves its subject's history and materials.
            await tx.update(s.resources).set({ topicId: null }).where(and(eq(s.resources.topicId, operation.id), eq(s.resources.userId, userId)));
            await tx.update(s.studySessions).set({ topicId: null }).where(and(eq(s.studySessions.topicId, operation.id), eq(s.studySessions.userId, userId)));
            await tx.update(s.scheduleBlocks).set({ topicId: null }).where(and(eq(s.scheduleBlocks.topicId, operation.id), eq(s.scheduleBlocks.userId, userId)));
            await tx.update(s.activeTimers).set({ topicId: null }).where(and(eq(s.activeTimers.topicId, operation.id), eq(s.activeTimers.userId, userId)));
            await tx.update(s.pendingUploads).set({ topicId: null }).where(and(eq(s.pendingUploads.topicId, operation.id), eq(s.pendingUploads.userId, userId)));
            await tx.update(s.scheduleExceptions).set({ newTopicId: null }).where(eq(s.scheduleExceptions.newTopicId, operation.id));
            await tx.delete(s.topics).where(eq(s.topics.id, operation.id));
          } else {
            const table = { subject: s.subjects, resource: s.resources, session: s.studySessions, block: s.scheduleBlocks }[operation.entity];
            const rows = await tx.delete(table).where(and(eq(table.id, operation.id), eq(table.userId, userId))).returning({ id: table.id });
            if (!rows.length) throw new DomainError("recordUnavailable");
          }
          break;
        }
        case "profile": {
          const v = operation.value;
          await tx.update(s.users).set({ name: v.name, timezone: v.timezone, learningContext: v.learningContext ?? null, updatedAt: now }).where(eq(s.users.id, userId));
          await tx.insert(s.preferences).values({ userId, weeklyTargetMinutes: v.weeklyTargetMinutes, theme: v.theme, weekStartDay: v.weekStartDay, reminders: v.reminders }).onConflictDoUpdate({ target: s.preferences.userId, set: { weeklyTargetMinutes: v.weeklyTargetMinutes, theme: v.theme, weekStartDay: v.weekStartDay, reminders: v.reminders } });
          break;
        }
        case "settings": {
          for (const [key, value] of Object.entries(operation.value)) await tx.insert(s.appSettings).values({ key, value }).onConflictDoUpdate({ target: s.appSettings.key, set: { value } });
          await tx.insert(s.auditLogs).values({ actorUserId: userId, action: "settingsChanged", targetType: "settings", targetId: "platform" });
          break;
        }
        case "userStatus": {
          if (operation.id === userId) throw new DomainError("recordUnavailable");
          const [target] = await tx.update(s.users).set({ status: operation.status === "active" ? "active" : "deactivated", updatedAt: now }).where(and(eq(s.users.id, operation.id), eq(s.users.role, "learner"))).returning({ id: s.users.id });
          if (!target) throw new DomainError("recordUnavailable");
          await tx.delete(s.authSessions).where(eq(s.authSessions.userId, operation.id));
          await tx.insert(s.auditLogs).values({ actorUserId: userId, action: operation.status === "active" ? "reactivate" : "deactivate", targetType: "user", targetId: operation.id });
          break;
        }
        case "readNotification": {
          const rows = await tx.update(s.notifications).set({ readAt: now }).where(and(eq(s.notifications.id, operation.id), eq(s.notifications.userId, userId))).returning({ id: s.notifications.id });
          if (!rows.length) throw new DomainError("recordUnavailable");
          break;
        }
        case "timer": {
          const command = operation.value;
          const [timer] = await tx.select().from(s.activeTimers).where(eq(s.activeTimers.userId, userId)).for("update");
          if (command.command === "start") {
            const subject = await ownSubject(command.subjectId, command.topicId);
            if (subject.status !== "active") throw new DomainError("recordUnavailable");
            if (timer) throw new DomainError("timerAlreadyRunning");
            await tx.insert(s.activeTimers).values({ userId, subjectId: command.subjectId, topicId: command.topicId, focusGoal: command.focusGoal, startedAt: now });
            break;
          }
          if (!timer) throw new DomainError("recordUnavailable");
          const elapsed = timerElapsed({ ...timer, startedAt: timer.startedAt.toISOString(), pausedAt: timer.pausedAt?.toISOString(), topicId: timer.topicId ?? undefined, focusGoal: timer.focusGoal ?? undefined }, now.getTime());
          if (command.command === "pause" && !timer.pausedAt) await tx.update(s.activeTimers).set({ pausedAt: now }).where(eq(s.activeTimers.userId, userId));
          if (command.command === "resume" || command.command === "confirm") {
            await tx.update(s.activeTimers).set({ pausedAt: null, pausedTotalSeconds: timer.pausedTotalSeconds + (timer.pausedAt ? Math.floor((now.getTime() - timer.pausedAt.getTime()) / 1000) : 0) + (command.command === "confirm" ? Math.max(0, elapsed - timer.confirmedUntilSeconds) : 0), confirmedUntilSeconds: command.command === "confirm" ? Math.min(elapsed, timer.confirmedUntilSeconds) + 21600 : timer.confirmedUntilSeconds, needsConfirmation: false }).where(eq(s.activeTimers.userId, userId));
          }
          if (command.command === "finish" || command.command === "discard") {
            const { durationSeconds, endedAt, saved } = finishSnapshot({ subjectId: timer.subjectId, startedAt: timer.startedAt.toISOString(), pausedAt: timer.pausedAt?.toISOString(), pausedTotalSeconds: timer.pausedTotalSeconds, confirmedUntilSeconds: timer.confirmedUntilSeconds }, now.getTime());
            if (command.command === "finish" && saved) {
              await tx.insert(s.studySessions).values({ userId, subjectId: timer.subjectId, topicId: timer.topicId, startedAt: timer.startedAt, endedAt, durationSeconds, status: "valid", source: "timer", note: command.note });
              timerResult = "saved";
            } else timerResult = "discarded";
            await tx.delete(s.activeTimers).where(eq(s.activeTimers.userId, userId));
          }
          break;
        }
      }
    }
    await tx.update(s.users).set({ lastActiveAt: new Date() }).where(eq(s.users.id, userId));
    if (changesHistory) await preserveHighestStreak();
  });
  await invalidateUser(userId, ["analytics", "subjects", "calendar"]);
  if (operations.some(operation => operation.kind === "settings")) await invalidateSettings();
  for (const operation of operations) if (operation.kind === "userStatus") await invalidateUser(operation.id, ["analytics", "subjects", "calendar"]);
  return { timerResult };
}

export async function deleteAccount(userId: string) {
  await getDb().transaction(async tx => {
    await tx.select({ id: s.users.id }).from(s.users).where(eq(s.users.id, userId)).for("update");
    await tx.delete(s.users).where(eq(s.users.id, userId));
  });
  await invalidateUser(userId, ["analytics", "subjects", "calendar"]);
}
/** Deliberate content inspection is outside the MVP. */
export async function inspectLearnerContent(): Promise<never> { throw new DomainError("recordUnavailable"); }
