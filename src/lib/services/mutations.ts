import "server-only";
import { and, count, eq, inArray, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import * as s from "@/lib/db/schema";
import type { Operation } from "@/lib/validation/operations";
import { timerElapsed } from "@/lib/analytics";
import { finishSnapshot } from "@/lib/timer";
import { editedSessionInterval } from "@/lib/timer/session-edit";
import { sql } from "drizzle-orm";
import { invalidateUser, invalidateSettings } from "@/lib/cache";
import type { WorkspaceChanges } from "@/lib/workspace/confirmation";
import { subjectRecord, topicRecord, resourceRecord, sessionRecord, blockRecord, notificationRecord, timerRecord } from "./mutation-records";
import { matchesPrecondition, type Precondition } from "@/lib/workspace/preconditions";
import { blockAfterDeletion } from "@/lib/workspace/mutations";

export class DomainError extends Error {}
export async function mutate(userId: string, operations: Operation[], preconditions: Precondition[] = []) {
  const db = getDb();
  let timerResult: "saved" | "discarded" | undefined;
  let userUpdatedAt: string | undefined;
  let timezoneChanged = false;
  const changes: WorkspaceChanges = {};
  await db.transaction(async tx => {
    // Serialize all writes per account, including concurrent tabs and quota checks.
    const [actor] = await tx.select().from(s.users).where(eq(s.users.id, userId)).for("update");
    if (!actor || actor.status !== "active") throw new DomainError("accountInactive");
    const expected = new Map(preconditions.map(condition => [`${condition.kind}:${condition.id}`, condition]));
    const check = (kind: Precondition["kind"], id: string, current?: object) => {
      const condition = expected.get(`${kind}:${id}`);
      if (condition && !matchesPrecondition(condition, current)) throw new DomainError("recordConflict");
      expected.delete(`${kind}:${id}`);
    };
    timezoneChanged = operations.some(operation => operation.kind === "profile" && operation.value.timezone !== actor.timezone);
    const sessionIds = [...new Set(operations.flatMap(operation => operation.kind === "session" ? [operation.value.id] : []))];
    const existingSessionIds = new Set(sessionIds.length ? (await tx.select({ id: s.studySessions.id }).from(s.studySessions).where(and(eq(s.studySessions.userId, userId), inArray(s.studySessions.id, sessionIds)))).map(row => row.id) : []);
    // Creation cannot reduce a streak, and deletion cannot increase it. Preserve
    // the old maximum only for destructive edits, then recompute only for additions.
    const preserveBefore = actor.role === "learner" && operations.some(op => (op.kind === "session" && existingSessionIds.has(op.value.id)) || (op.kind === "profile" && op.value.timezone !== actor.timezone) || (op.kind === "delete" && ["session", "subject"].includes(op.entity)));
    const preserveAfter = actor.role === "learner" && operations.some(op => op.kind === "session" || (op.kind === "profile" && op.value.timezone !== actor.timezone) || (op.kind === "timer" && op.value.command === "finish"));
    const preserveHighestStreak = async () => {
      // Preserve one scalar in one round trip. Do not build or transfer the full
      // subject/day analytics payload while holding the account write lock.
      await tx.execute(sql`
        WITH config AS (
          SELECT timezone,
            coalesce((SELECT value::integer FROM app_settings WHERE key = 'streakMinutes'), 10) * 60 AS threshold
          FROM users WHERE id = ${userId}::uuid
        ), fragments AS (
          SELECT d::date AS day, c.threshold, c.timezone,
            ss.duration_seconds * EXTRACT(EPOCH FROM (
              LEAST(ss.ended_at, (d + INTERVAL '1 day') AT TIME ZONE c.timezone)
              - GREATEST(ss.started_at, d AT TIME ZONE c.timezone)
            )) / NULLIF(EXTRACT(EPOCH FROM (ss.ended_at - ss.started_at)), 0) AS seconds
          FROM study_sessions ss CROSS JOIN config c CROSS JOIN LATERAL generate_series(
            date_trunc('day', ss.started_at AT TIME ZONE c.timezone),
            date_trunc('day', ss.ended_at AT TIME ZONE c.timezone), INTERVAL '1 day'
          ) AS d
          WHERE ss.user_id = ${userId}::uuid AND ss.status = 'valid' AND ss.duration_seconds >= 60
        ), qualifying AS (
          SELECT day FROM fragments
          WHERE day <= (CURRENT_TIMESTAMP AT TIME ZONE timezone)::date
          GROUP BY day, threshold HAVING sum(greatest(seconds, 0)) >= threshold
        ), islands AS (
          SELECT day - (row_number() OVER (ORDER BY day))::integer AS streak FROM qualifying
        ), runs AS (
          SELECT count(*)::integer AS length FROM islands GROUP BY streak
        ) INSERT INTO user_preferences (user_id, highest_streak)
          VALUES (${userId}::uuid, coalesce((SELECT max(length) FROM runs), 0))
          ON CONFLICT (user_id) DO UPDATE SET highest_streak = greatest(user_preferences.highest_streak, excluded.highest_streak)
      `);
    };
    if (preserveBefore) await preserveHighestStreak();
    const topicIds = [...new Set(operations.flatMap(op => op.kind === "topic" ? [op.value.id] : []))];
    const existingTopics = topicIds.length ? await tx.select().from(s.topics).where(inArray(s.topics.id, topicIds)) : [];
    const topicMetadata = new Map(existingTopics.map(row => [row.id, { id: row.id, subjectId: row.subjectId, completedAt: row.completedAt }]));
    const subjectReads = new Map<string, Promise<{ id: string; status: "active" | "archived" } | undefined>>();
    const topicReads = new Map<string, Promise<{ subjectId: string } | undefined>>();
    const topicCounts = new Map<string, number>();
    const pendingTopics = new Map<string, typeof s.topics.$inferInsert>();
    const blockVersions = new Map<string, string>();
    const touchBlocks = async (ids: string[]) => {
      if (!ids.length) return;
      const rows = await tx.update(s.scheduleBlocks).set({ updatedAt: sql`greatest(${s.scheduleBlocks.updatedAt} + interval '1 millisecond', clock_timestamp())` })
        .where(and(eq(s.scheduleBlocks.userId, userId), inArray(s.scheduleBlocks.id, [...new Set(ids)]))).returning({ id: s.scheduleBlocks.id, updatedAt: s.scheduleBlocks.updatedAt });
      rows.forEach(row => blockVersions.set(row.id, row.updatedAt.toISOString()));
    };
    const flushTopics = async () => {
      if (!pendingTopics.size) return;
      const rows = await tx.insert(s.topics).values([...pendingTopics.values()]).onConflictDoUpdate({ target: s.topics.id,
        set: { title: sql`excluded.title`, description: sql`excluded.description`, status: sql`excluded.status`, targetDate: sql`excluded.target_date`, sortOrder: sql`excluded.sort_order`, archived: sql`excluded.archived`, completedAt: sql`excluded.completed_at`, updatedAt: sql`excluded.updated_at` },
        // A different account may race to insert the same client-supplied UUID.
        // Never update a conflicting row under a different subject.
        setWhere: sql`${s.topics.subjectId} = excluded.subject_id`,
      }).returning();
      if (rows.length !== pendingTopics.size) throw new DomainError("recordUnavailable");
      (changes.topics ??= []).push(...rows.map(topicRecord));
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
          check("subject", v.id, existing ? subjectRecord(existing) : undefined);
          if (v.status === "active" && existing?.status !== "active") {
            const [total] = await tx.select({ count: count() }).from(s.subjects).where(and(eq(s.subjects.userId, userId), eq(s.subjects.status, "active")));
            if (total.count >= 50) throw new DomainError("subjectLimit");
          }
          const value = { title: v.title, description: v.description, displayColor: v.color, targetDate: v.targetDate ?? null, status: v.status, updatedAt: now };
          const [saved] = existing ? await tx.update(s.subjects).set(value).where(and(eq(s.subjects.id, v.id), eq(s.subjects.userId, userId))).returning()
            : await tx.insert(s.subjects).values({ ...value, id: v.id, userId }).returning();
          (changes.subjects ??= []).push(subjectRecord(saved));
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
          const original = existingTopics.find(row => row.id === v.id);
          check("topic", v.id, original ? topicRecord(original) : undefined);
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
          check("resource", v.id, existing ? resourceRecord(existing) : undefined);
          if (existing?.type === "file" && v.type !== "file") throw new DomainError("recordUnavailable");
          const value = { subjectId: v.subjectId, topicId: v.topicId ?? null, type: v.type, title: v.title, url: v.url ?? null, textContent: v.textContent ?? null };
          const [saved] = existing ? await tx.update(s.resources).set(value).where(and(eq(s.resources.id, v.id), eq(s.resources.userId, userId))).returning()
            : await tx.insert(s.resources).values({ ...value, id: v.id, userId }).returning();
          (changes.resources ??= []).push(resourceRecord(saved));
          break;
        }
        case "session": {
          const v = operation.value;
          await ownSubject(v.subjectId, v.topicId);
          const [existing] = await tx.select().from(s.studySessions).where(eq(s.studySessions.id, v.id));
          if (existing && existing.userId !== userId) throw new DomainError("recordUnavailable");
          check("session", v.id, existing ? sessionRecord(existing) : undefined);
          const { durationSeconds, source } = editedSessionInterval(existing, v.startedAt, v.endedAt);
          if (durationSeconds < 60) throw new DomainError("sessionTooShort");
          const value = { subjectId: v.subjectId, topicId: v.topicId ?? null, startedAt: new Date(v.startedAt), endedAt: new Date(v.endedAt), durationSeconds, note: v.note ?? null, source, status: "valid" as const };
          const [saved] = existing ? await tx.update(s.studySessions).set(value).where(and(eq(s.studySessions.id, v.id), eq(s.studySessions.userId, userId))).returning()
            : await tx.insert(s.studySessions).values({ ...value, id: v.id, userId }).returning();
          (changes.sessions ??= []).push(sessionRecord(saved));
          break;
        }
        case "block": {
          const v = operation.value;
          if (v.subjectId) await ownSubject(v.subjectId, v.topicId);
          for (const exception of v.exceptions) {
            const subjectId = exception.overrides && "subjectId" in exception.overrides ? exception.overrides.subjectId ?? undefined : exception.subjectId ?? v.subjectId;
            const topicId = exception.overrides && "topicId" in exception.overrides ? exception.overrides.topicId ?? undefined : exception.topicId ?? v.topicId;
            if (topicId && !subjectId) throw new DomainError("recordUnavailable");
            if (subjectId) await ownSubject(subjectId, topicId);
          }
          const [existing] = await tx.select().from(s.scheduleBlocks).where(eq(s.scheduleBlocks.id, v.id));
          if (existing && existing.userId !== userId) throw new DomainError("recordUnavailable");
          check("block", v.id, existing ? { updatedAt: existing.updatedAt.toISOString() } : undefined);
          const value = { subjectId: v.subjectId ?? null, topicId: v.topicId ?? null, title: v.title, startsAt: new Date(v.startsAt), endsAt: new Date(v.endsAt), timezone: v.timezone, recurrenceRule: v.repeat === "weekly" ? { weekdays: [...new Set(v.weekdays)], until: v.recurrenceUntil } : null, note: v.note ?? null, displayColor: v.color, updatedAt: now };
          const [saved] = existing ? await tx.update(s.scheduleBlocks).set(value).where(and(eq(s.scheduleBlocks.id, v.id), eq(s.scheduleBlocks.userId, userId))).returning()
            : await tx.insert(s.scheduleBlocks).values({ ...value, id: v.id, userId }).returning();
          await tx.delete(s.scheduleExceptions).where(eq(s.scheduleExceptions.blockId, v.id));
          const exceptionRows = v.exceptions.map(e => {
            const newTopicId = e.overrides && "topicId" in e.overrides ? e.overrides.topicId ?? null : e.topicId ?? null;
            const newSubjectId = e.overrides && "subjectId" in e.overrides ? e.overrides.subjectId ?? null : e.subjectId ?? (newTopicId ? v.subjectId ?? null : null);
            return { blockId: v.id, date: e.date, overrides: e.overrides ?? null, isCancelled: e.cancelled, newStartsAt: e.startsAt ? new Date(e.startsAt) : null, newEndsAt: e.endsAt ? new Date(e.endsAt) : null, newTitle: e.title ?? null, newNote: e.note ?? null, newColor: e.color ?? null, newSubjectId, newTopicId };
          });
          if (exceptionRows.length) await tx.insert(s.scheduleExceptions).values(exceptionRows);
          (changes.blocks ??= []).push(blockRecord(saved, v.exceptions.map((e, index) => ({ ...e, subjectId: exceptionRows[index].newSubjectId ?? undefined, topicId: exceptionRows[index].newTopicId ?? undefined }))));
          break;
        }
        case "delete": {
          if (operation.entity === "topic") {
            const [row] = await tx.select().from(s.topics).where(eq(s.topics.id, operation.id));
            if (!row) throw new DomainError("recordUnavailable");
            await ownSubject(row.subjectId);
            check("topic", operation.id, topicRecord(row));
            // Deleting a topic preserves its subject's history and materials.
            await tx.update(s.resources).set({ topicId: null }).where(and(eq(s.resources.topicId, operation.id), eq(s.resources.userId, userId)));
            await tx.update(s.studySessions).set({ topicId: null }).where(and(eq(s.studySessions.topicId, operation.id), eq(s.studySessions.userId, userId)));
            const detachedBlocks = await tx.update(s.scheduleBlocks).set({ topicId: null, updatedAt: sql`greatest(${s.scheduleBlocks.updatedAt} + interval '1 millisecond', clock_timestamp())` }).where(and(eq(s.scheduleBlocks.topicId, operation.id), eq(s.scheduleBlocks.userId, userId))).returning({ id: s.scheduleBlocks.id, updatedAt: s.scheduleBlocks.updatedAt });
            detachedBlocks.forEach(row => blockVersions.set(row.id, row.updatedAt.toISOString()));
            await tx.update(s.activeTimers).set({ topicId: null }).where(and(eq(s.activeTimers.topicId, operation.id), eq(s.activeTimers.userId, userId)));
            await tx.update(s.pendingUploads).set({ topicId: null }).where(and(eq(s.pendingUploads.topicId, operation.id), eq(s.pendingUploads.userId, userId)));
            const changedExceptions = await tx.update(s.scheduleExceptions).set({ newTopicId: null,
              overrides: sql`CASE WHEN ${s.scheduleExceptions.overrides}->>'topicId' = ${operation.id} THEN jsonb_set(${s.scheduleExceptions.overrides}, '{topicId}', 'null'::jsonb) ELSE ${s.scheduleExceptions.overrides} END`,
            }).where(and(or(eq(s.scheduleExceptions.newTopicId, operation.id), sql`${s.scheduleExceptions.overrides}->>'topicId' = ${operation.id}`), sql`${s.scheduleExceptions.blockId} IN (SELECT id FROM schedule_blocks WHERE user_id = ${userId}::uuid)`)).returning({ blockId: s.scheduleExceptions.blockId });
            await touchBlocks(changedExceptions.map(row => row.blockId));
            await tx.delete(s.topics).where(eq(s.topics.id, operation.id));
            topicMetadata.delete(operation.id); topicReads.delete(operation.id);
            if (topicCounts.has(row.subjectId)) topicCounts.set(row.subjectId, topicCounts.get(row.subjectId)! - 1);
          } else {
            const table = { subject: s.subjects, resource: s.resources, session: s.studySessions, block: s.scheduleBlocks }[operation.entity];
            if (expected.has(`${operation.entity}:${operation.id}`)) {
              if (operation.entity === "subject") check("subject", operation.id, (await tx.select().from(s.subjects).where(and(eq(s.subjects.id, operation.id), eq(s.subjects.userId, userId)))).map(subjectRecord)[0]);
              if (operation.entity === "resource") check("resource", operation.id, (await tx.select().from(s.resources).where(and(eq(s.resources.id, operation.id), eq(s.resources.userId, userId)))).map(resourceRecord)[0]);
              if (operation.entity === "session") check("session", operation.id, (await tx.select().from(s.studySessions).where(and(eq(s.studySessions.id, operation.id), eq(s.studySessions.userId, userId)))).map(sessionRecord)[0]);
              if (operation.entity === "block") { const [block] = await tx.select({ updatedAt: s.scheduleBlocks.updatedAt }).from(s.scheduleBlocks).where(and(eq(s.scheduleBlocks.id, operation.id), eq(s.scheduleBlocks.userId, userId))); check("block", operation.id, block ? { updatedAt: block.updatedAt.toISOString() } : undefined); }
            }
            // Legacy exception JSON may lack FK columns. Clear it explicitly,
            // and advance surviving plan versions so range caches remove it.
            const removedExceptions = operation.entity === "subject" ? await tx.delete(s.scheduleExceptions).where(and(
              sql`${s.scheduleExceptions.blockId} IN (SELECT id FROM schedule_blocks WHERE user_id = ${userId}::uuid)`,
              or(eq(s.scheduleExceptions.newSubjectId, operation.id), sql`${s.scheduleExceptions.overrides}->>'subjectId' = ${operation.id}`,
                sql`${s.scheduleExceptions.overrides}->>'topicId' IN (SELECT id::text FROM topics WHERE subject_id = ${operation.id}::uuid)`),
            )).returning({ blockId: s.scheduleExceptions.blockId }) : [];
            const rows = await tx.delete(table).where(and(eq(table.id, operation.id), eq(table.userId, userId))).returning({ id: table.id });
            if (!rows.length) throw new DomainError("recordUnavailable");
            await touchBlocks(removedExceptions.map(row => row.blockId));
            if (operation.entity === "subject") { subjectReads.delete(operation.id); topicCounts.delete(operation.id); for (const [id, topic] of topicMetadata) if (topic.subjectId === operation.id) topicMetadata.delete(id); topicReads.clear(); }
          }
          (changes.deleted ??= []).push(operation);
          // A batch can create/edit then delete the same record. Do not return
          // an earlier RETURNING row as a surviving record after the deletion.
          for (const [field, entity] of [["subjects", "subject"], ["topics", "topic"], ["resources", "resource"], ["sessions", "session"], ["blocks", "block"]] as const) {
            const rows = changes[field];
            if (!rows) continue;
            Object.assign(changes, { [field]: rows.filter(row => !(operation.entity === entity && row.id === operation.id) && !(operation.entity === "subject" && "subjectId" in row && row.subjectId === operation.id)).map(row => "exceptions" in row ? blockAfterDeletion(row, operation)! : operation.entity === "topic" && "topicId" in row && row.topicId === operation.id ? { ...row, topicId: undefined } : row) });
          }
          break;
        }
        case "profile": {
          const v = operation.value;
          if (expected.has(`profile:${userId}`)) {
            const [prefs] = await tx.select().from(s.preferences).where(eq(s.preferences.userId, userId));
            check("profile", userId, { name: actor.name, timezone: actor.timezone, learningContext: actor.learningContext ?? undefined, weeklyTargetMinutes: prefs?.weeklyTargetMinutes ?? 0, theme: prefs?.theme ?? "auto", weekStartDay: prefs?.weekStartDay ?? 1, reminders: prefs?.reminders ?? true });
          }
          await tx.update(s.users).set({ name: v.name, timezone: v.timezone, learningContext: v.learningContext ?? null, updatedAt: now }).where(eq(s.users.id, userId));
          await tx.insert(s.preferences).values({ userId, weeklyTargetMinutes: v.weeklyTargetMinutes, theme: v.theme, weekStartDay: v.weekStartDay, reminders: v.reminders }).onConflictDoUpdate({ target: s.preferences.userId, set: { weeklyTargetMinutes: v.weeklyTargetMinutes, theme: v.theme, weekStartDay: v.weekStartDay, reminders: v.reminders } });
          changes.profile = { name: v.name, timezone: v.timezone, learningContext: v.learningContext ?? null, weeklyTargetMinutes: v.weeklyTargetMinutes, theme: v.theme, weekStartDay: v.weekStartDay, reminders: v.reminders };
          break;
        }
        case "settings": {
          if (expected.has(`settings:${userId}`)) {
            const rows = await tx.select().from(s.appSettings).orderBy(s.appSettings.key).for("update");
            const current = Object.fromEntries(rows.map(row => [row.key, row.value]));
            check("settings", userId, { streakMinutes: Number(current.streakMinutes ?? 10), maxFileSizeMB: Number(current.maxFileSizeMB ?? 10), storagePerUserMB: Number(current.storagePerUserMB ?? 100), minimumAge: Number(current.minimumAge ?? 0) });
          }
          await tx.insert(s.appSettings).values(Object.entries(operation.value).map(([key, value]) => ({ key, value })))
            .onConflictDoUpdate({ target: s.appSettings.key, set: { value: sql`excluded.value` } });
          await tx.insert(s.auditLogs).values({ actorUserId: userId, action: "settingsChanged", targetType: "settings", targetId: "platform" });
          const settings = Object.fromEntries((await tx.select().from(s.appSettings)).map(row => [row.key, row.value]));
          changes.settings = { streakMinutes: Number(settings.streakMinutes ?? 10), maxFileSizeMB: Number(settings.maxFileSizeMB ?? 10), storagePerUserMB: Number(settings.storagePerUserMB ?? 100), minimumAge: Number(settings.minimumAge ?? 0) };
          break;
        }
        case "userStatus": {
          if (operation.id === userId) throw new DomainError("recordUnavailable");
          if (expected.has(`userStatus:${operation.id}`)) {
            const [current] = await tx.select({ status: s.users.status, updatedAt: s.users.updatedAt }).from(s.users).where(and(eq(s.users.id, operation.id), eq(s.users.role, "learner"))).for("update");
            check("userStatus", operation.id, current ? { status: current.status === "active" ? "active" : "inactive", updatedAt: current.updatedAt.toISOString() } : undefined);
          }
          const [target] = await tx.update(s.users).set({ status: operation.status === "active" ? "active" : "deactivated", updatedAt: now }).where(and(eq(s.users.id, operation.id), eq(s.users.role, "learner"))).returning({ id: s.users.id, status: s.users.status, updatedAt: s.users.updatedAt });
          if (!target) throw new DomainError("recordUnavailable");
          (changes.users ??= []).push({ id: target.id, status: target.status === "active" ? "active" : "inactive", updatedAt: target.updatedAt.toISOString() });
          await tx.delete(s.authSessions).where(eq(s.authSessions.userId, operation.id));
          await tx.insert(s.auditLogs).values({ actorUserId: userId, action: operation.status === "active" ? "reactivate" : "deactivate", targetType: "user", targetId: operation.id });
          break;
        }
        case "readNotification": {
          const rows = await tx.update(s.notifications).set({ readAt: now }).where(and(eq(s.notifications.id, operation.id), eq(s.notifications.userId, userId))).returning();
          if (!rows.length) throw new DomainError("recordUnavailable");
          (changes.notifications ??= []).push(...rows.map(notificationRecord));
          break;
        }
        case "timer": {
          const command = operation.value;
          const [timer] = await tx.select().from(s.activeTimers).where(eq(s.activeTimers.userId, userId)).for("update");
          check("timer", userId, timer ? timerRecord(timer)! : undefined);
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
              const [session] = await tx.insert(s.studySessions).values({ userId, subjectId: timer.subjectId, topicId: timer.topicId, startedAt: timer.startedAt, endedAt, durationSeconds, status: "valid", source: "timer", note: command.note }).returning();
              (changes.sessions ??= []).push(sessionRecord(session));
              timerResult = "saved";
            } else timerResult = "discarded";
            await tx.delete(s.activeTimers).where(eq(s.activeTimers.userId, userId));
          }
          break;
        }
      }
    }
    await flushTopics();
    if (changes.blocks) changes.blocks = changes.blocks.map(row => ({ ...row, updatedAt: blockVersions.get(row.id) ?? row.updatedAt }));
    if (operations.some(operation => operation.kind === "timer")) changes.timer = timerRecord((await tx.select().from(s.activeTimers).where(eq(s.activeTimers.userId, userId)))[0]);
    // The live account revision also fences cache entries if Redis invalidation
    // fails on one instance. Existing updated_at advances at least one millisecond.
    const [revision] = await tx.update(s.users).set({ lastActiveAt: new Date(), updatedAt: sql`greatest(${s.users.updatedAt} + interval '1 millisecond', clock_timestamp())` }).where(eq(s.users.id, userId)).returning({ updatedAt: s.users.updatedAt });
    userUpdatedAt = revision.updatedAt.toISOString();
    if (preserveAfter) await preserveHighestStreak();
  });
  const scopes = new Set<import("@/lib/cache").UserCacheScope>();
  for (const operation of operations) {
    if (["subject", "topic", "session"].includes(operation.kind) || (operation.kind === "timer" && operation.value.command === "finish") || (operation.kind === "delete" && ["subject", "topic", "session"].includes(operation.entity))) { scopes.add("subjects"); scopes.add("analytics"); }
    if (operation.kind === "block" || (operation.kind === "delete" && ["block", "subject", "topic"].includes(operation.entity))) scopes.add("calendar");
    if (operation.kind === "profile" && timezoneChanged) { scopes.add("analytics"); scopes.add("calendar"); }
  }
  if (scopes.size) await invalidateUser(userId, [...scopes]);
  if (operations.some(operation => operation.kind === "settings")) await invalidateSettings();
  for (const operation of operations) if (operation.kind === "userStatus") await invalidateUser(operation.id, ["analytics", "subjects", "calendar"]);
  return { timerResult, userUpdatedAt, changes };
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
