import "server-only";
import { and, count, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import * as s from "@/lib/db/schema";
import type { Operation } from "@/lib/validation/operations";
import { timerElapsed } from "@/lib/analytics";
import { finishSnapshot } from "@/lib/timer";
import { editedSessionInterval } from "@/lib/timer/session-edit";
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
    const topicIds = [...new Set(operations.flatMap(op => op.kind === "topic" ? [op.value.id] : []))];
    const existingTopics = topicIds.length ? await tx.select({ id: s.topics.id, subjectId: s.topics.subjectId, completedAt: s.topics.completedAt }).from(s.topics).where(inArray(s.topics.id, topicIds)) : [];
    const topicMetadata = new Map(existingTopics.map(row => [row.id, row]));
    const subjectReads = new Map<string, Promise<{ id: string; status: "active" | "archived" } | undefined>>();
    const topicReads = new Map<string, Promise<{ subjectId: string } | undefined>>();
    const topicCounts = new Map<string, number>();
    const pendingTopics = new Map<string, typeof s.topics.$inferInsert>();
    const flushTopics = async () => {
      if (!pendingTopics.size) return;
      const rows = await tx.insert(s.topics).values([...pendingTopics.values()]).onConflictDoUpdate({ target: s.topics.id,
        set: { title: sql`excluded.title`, description: sql`excluded.description`, status: sql`excluded.status`, targetDate: sql`excluded.target_date`, sortOrder: sql`excluded.sort_order`, archived: sql`excluded.archived`, completedAt: sql`excluded.completed_at`, updatedAt: sql`excluded.updated_at` },
        // A different account may race to insert the same client-supplied UUID.
        // Never update a conflicting row under a different subject.
        setWhere: sql`${s.topics.subjectId} = excluded.subject_id`,
      }).returning({ id: s.topics.id });
      if (rows.length !== pendingTopics.size) throw new DomainError("recordUnavailable");
      pendingTopics.clear();
    };
    const ownSubject = async (subjectId: string, topicId?: string) => {
      let read = subjectReads.get(subjectId);
      if (!read) { read = tx.select({ id: s.subjects.id, status: s.subjects.status }).from(s.subjects).where(and(eq(s.subjects.id, subjectId), eq(s.subjects.userId, userId))).then(rows => rows[0]); subjectReads.set(subjectId, read); }
      const subject = await read;
      if (!subject) throw new DomainError("recordUnavailable");
      if (topicId) {
        const topic = topicMetadata.get(topicId);
        if (!topic) {
          let readTopic = topicReads.get(topicId);
          if (!readTopic) { readTopic = tx.select({ subjectId: s.topics.subjectId }).from(s.topics).where(eq(s.topics.id, topicId)).then(rows => rows[0]); topicReads.set(topicId, readTopic); }
          const value = await readTopic;
          if (!value || value.subjectId !== subjectId) throw new DomainError("recordUnavailable");
        } else if (topic.subjectId !== subjectId) throw new DomainError("recordUnavailable");
      }
      return subject;
    };
    for (const operation of operations) {
      if (operation.kind !== "topic") await flushTopics();
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
          subjectReads.delete(v.id);
          break;
        }
        case "topic": {
          const v = operation.value;
          await ownSubject(v.subjectId);
          const existing = topicMetadata.get(v.id);
          if (existing) { await ownSubject(existing.subjectId); if (existing.subjectId !== v.subjectId) throw new DomainError("recordUnavailable"); }
          else {
            let total = topicCounts.get(v.subjectId);
            if (total === undefined) { const [row] = await tx.select({ count: count() }).from(s.topics).where(eq(s.topics.subjectId, v.subjectId)); total = row.count; }
            if (total >= 200) throw new DomainError("topicLimit");
            topicCounts.set(v.subjectId, total + 1);
          }
          const status = v.status === "notStarted" ? "not_started" : v.status === "inProgress" ? "in_progress" : "completed";
          const value = { subjectId: v.subjectId, title: v.title, description: v.description ?? null, status: status as "not_started" | "in_progress" | "completed", targetDate: v.targetDate ?? null, sortOrder: v.sortOrder, archived: v.archived ?? false, completedAt: status === "completed" ? existing?.completedAt ?? now : null, updatedAt: now };
          pendingTopics.set(v.id, { ...value, id: v.id });
          topicMetadata.set(v.id, { id: v.id, subjectId: v.subjectId, completedAt: value.completedAt });
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
          const { durationSeconds, source } = editedSessionInterval(existing, v.startedAt, v.endedAt);
          if (durationSeconds < 60) throw new DomainError("sessionTooShort");
          const value = { subjectId: v.subjectId, topicId: v.topicId ?? null, startedAt: new Date(v.startedAt), endedAt: new Date(v.endedAt), durationSeconds, note: v.note ?? null, source, status: "valid" as const };
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
            topicMetadata.delete(operation.id); topicReads.delete(operation.id);
            if (topicCounts.has(row.subjectId)) topicCounts.set(row.subjectId, topicCounts.get(row.subjectId)! - 1);
          } else {
            const table = { subject: s.subjects, resource: s.resources, session: s.studySessions, block: s.scheduleBlocks }[operation.entity];
            const rows = await tx.delete(table).where(and(eq(table.id, operation.id), eq(table.userId, userId))).returning({ id: table.id });
            if (!rows.length) throw new DomainError("recordUnavailable");
            if (operation.entity === "subject") { subjectReads.delete(operation.id); topicCounts.delete(operation.id); for (const [id, topic] of topicMetadata) if (topic.subjectId === operation.id) topicMetadata.delete(id); topicReads.clear(); }
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
    await flushTopics();
    // The live account revision also fences cache entries if Redis invalidation
    // fails on one instance. Existing updated_at advances at least one millisecond.
    await tx.update(s.users).set({ lastActiveAt: new Date(), updatedAt: sql`greatest(${s.users.updatedAt} + interval '1 millisecond', clock_timestamp())` }).where(eq(s.users.id, userId));
    if (changesHistory) await preserveHighestStreak();
  });
  await invalidateUser(userId, ["analytics", "subjects", "calendar"]);
  if (operations.some(operation => operation.kind === "settings")) await invalidateSettings();
  for (const operation of operations) if (operation.kind === "userStatus") await invalidateUser(operation.id, ["analytics", "subjects", "calendar"]);
  return { timerResult };
}

export async function deleteAccount(userId: string) {
  await getDb().transaction(async tx => {
    const [actor] = await tx.select({ status: s.users.status, role: s.users.role }).from(s.users).where(eq(s.users.id, userId)).for("update");
    if (!actor || actor.status !== "active" || actor.role !== "learner") throw new DomainError("accountInactive");
    await tx.delete(s.users).where(eq(s.users.id, userId));
  });
  await invalidateUser(userId, ["analytics", "subjects", "calendar"]);
}
/** Deliberate content inspection is outside the MVP. */
export async function inspectLearnerContent(): Promise<never> { throw new DomainError("recordUnavailable"); }
