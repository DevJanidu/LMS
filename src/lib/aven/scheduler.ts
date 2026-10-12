import "server-only";
import { and, asc, desc, eq, inArray, lte, sql } from "drizzle-orm";
import { getDb, type DbTransaction } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { localDay, shiftDay, wallTime, zonedToUtc } from "@/lib/analytics";
import { getOccurrences } from "@/lib/schedule";
import { getScheduleBlocksInRange } from "@/lib/services/lists";
import { getTranslations } from "next-intl/server";
import { aiPreferenceSchema, notificationPreferenceSchema } from "./validation";
import {
  dueLocalTime,
  mayNotify,
  missedStart,
  randomCheckInTime,
  sessionReminderDue,
  candidateEnabled,
} from "./scheduler-model";
import { deliverNotifications } from "./delivery";
import { appendProactiveMessage } from "./proactive-conversations";
interface Candidate {
  kind: string;
  key: string;
  title: string;
  body: string;
  jobId?: string;
  action?: (typeof s.notificationActions.$inferInsert)["value"];
}

export async function enqueueNotification(
  tx: DbTransaction,
  userId: string,
  key: string,
  title: string,
  body: string,
  channels: { email: boolean; push: boolean; inApp?: boolean },
  action?: Candidate["action"],
) {
  const [notification] = await tx
    .insert(s.notifications)
    .values({
      userId,
      type: "aven",
      title,
      body,
      deduplicationKey: `aven:${key}`,
      scheduledFor: new Date(),
    })
    .onConflictDoNothing()
    .returning();
  if (!notification) return null;
  const context = action ?? { kind: "checkIn" };
  const conversationId = await appendProactiveMessage(
    tx,
    userId,
    notification,
    context,
    title,
  );
  await tx.insert(s.notificationActions).values({
    notificationId: notification.id,
    value: { ...context, conversationId },
  });
  const deliveries = [
    ...(channels.inApp !== false ? ["inApp"] : []),
    ...(channels.email ? ["email"] : []),
    ...(channels.push ? ["push"] : []),
  ];
  if (deliveries.length)
    await tx.insert(s.notificationDeliveries).values(
      deliveries.map((channel) => ({
        notificationId: notification.id,
        channel,
        status: channel === "inApp" ? "delivered" : "pending",
        deliveredAt: channel === "inApp" ? new Date() : null,
      })),
    );
  return notification.id;
}
export async function processAvenUser(userId: string, now: number) {
  const db = getDb();
  const [
    [user],
    [preference],
    [ai],
    [timer],
    evidence,
    goals,
    tasks,
    [studySummary],
  ] = await Promise.all([
    db.select().from(s.users).where(eq(s.users.id, userId)),
    db
      .select()
      .from(s.notificationPreferences)
      .where(eq(s.notificationPreferences.userId, userId)),
    db
      .select()
      .from(s.aiUserPreferences)
      .where(eq(s.aiUserPreferences.userId, userId)),
    db.select().from(s.activeTimers).where(eq(s.activeTimers.userId, userId)),
    db
      .select()
      .from(s.studySessions)
      .where(
        and(
          eq(s.studySessions.userId, userId),
          sql`${s.studySessions.startedAt} > ${new Date(now - 8 * 86400000)}`,
        ),
      )
      .orderBy(desc(s.studySessions.startedAt))
      .limit(500),
    db
      .select()
      .from(s.goals)
      .where(
        and(
          eq(s.goals.userId, userId),
          inArray(s.goals.status, ["active", "planned", "missedTarget"]),
          eq(s.goals.reminders, true),
        ),
      )
      .orderBy(asc(s.goals.targetDate))
      .limit(100),
    db
      .select({
        id: s.goalTasks.id,
        title: s.goalTasks.title,
        dueDate: s.goalTasks.dueDate,
        goalId: s.goals.id,
        status: s.goalTasks.status,
      })
      .from(s.goalTasks)
      .innerJoin(s.goals, eq(s.goals.id, s.goalTasks.goalId))
      .where(
        and(
          eq(s.goals.userId, userId),
          eq(s.goals.status, "active"),
          eq(s.goals.reminders, true),
          sql`${s.goalTasks.status} NOT IN ('completed','cancelled')`,
        ),
      )
      .orderBy(asc(s.goalTasks.dueDate))
      .limit(100),
    db
      .select({
        hours: sql<number>`coalesce(sum(${s.studySessions.durationSeconds}) FILTER (WHERE ${s.studySessions.startedAt} >= ${new Date(now - 7 * 86400000)} AND ${s.studySessions.startedAt} <= ${new Date(now)}),0)::float / 3600`,
        latest: sql<string | null>`max(${s.studySessions.startedAt})::text`,
      })
      .from(s.studySessions)
      .where(
        and(
          eq(s.studySessions.userId, userId),
          eq(s.studySessions.status, "valid"),
        ),
      ),
  ]);
  if (!user || user.status !== "active" || !preference) return 0;
  const prefs = notificationPreferenceSchema.parse(preference.value),
    aiPrefs = aiPreferenceSchema.parse(ai?.value ?? {}),
    today = localDay(now, user.timezone);
  if (!mayNotify(prefs, now, user.timezone, 0)) return 0;
  const t = await getTranslations({
    locale: aiPrefs.locale,
    namespace: "aven.notifications",
  });
  const blocks = await getScheduleBlocksInRange(
    userId,
    { from: shiftDay(today, -1), to: shiftDay(today, 2) },
    user.timezone,
  );
  const occurrences = getOccurrences(
    blocks,
    shiftDay(today, -1),
    shiftDay(today, 1),
  );
  const queued = await db
    .select()
    .from(s.scheduledCheckIns)
    .where(
      and(
        eq(s.scheduledCheckIns.userId, userId),
        eq(s.scheduledCheckIns.status, "pending"),
        lte(s.scheduledCheckIns.dueAt, new Date(now)),
      ),
    )
    .orderBy(asc(s.scheduledCheckIns.dueAt))
    .limit(20);
  const candidates: Candidate[] = queued.map((job) => ({
    kind: job.kind,
    key: job.deduplicationKey,
    title: job.value.title ?? t("checkInTitle"),
    body: job.value.body ?? "",
    jobId: job.id,
  }));
  for (const item of occurrences) {
    const start = Date.parse(item.startsAt);
    const action = {
      kind: "session",
      blockId: item.block.id,
      date: item.date,
      subjectId: item.block.subjectId,
      topicId: item.block.topicId,
      startsAt: item.startsAt,
      endsAt: item.endsAt,
    };
    if (
      prefs.sessionReminders &&
      sessionReminderDue(now, start, prefs.leadMinutes)
    )
      candidates.push({
        kind: "session",
        key: `session:${item.block.id}:${item.date}`,
        title: t("sessionTitle"),
        body: t("sessionBody", {
          title: item.title,
          minutes: Math.max(0, Math.ceil((start - now) / 60000)),
        }),
        action,
      });
    if (
      prefs.missedSessions &&
      !(timer && !timer.pausedAt) &&
      item.block.subjectId &&
      missedStart(
        item.startsAt,
        item.endsAt,
        item.block.subjectId,
        evidence,
        timer,
        now,
        prefs.graceMinutes,
      )
    )
      candidates.push({
        kind: "missed",
        key: `missed:${item.block.id}:${item.date}`,
        title: t("missedTitle"),
        body: t("missedBody", { title: item.title }),
        action,
      });
  }
  const dailyAction = { kind: "goals", goalId: goals[0]?.id };
  if (
    prefs.goalReminders &&
    dueLocalTime(now, user.timezone, prefs.morningTime)
  ) {
    for (const goal of goals
      .filter((goal) => goal.targetDate <= shiftDay(today, 3))
      .slice(0, 2))
      candidates.push({
        kind: "goalDeadline",
        key: `goalDeadline:${goal.id}:${today}`,
        title: t("goalDeadlineTitle"),
        body: t("goalDeadlineBody", {
          title: goal.title,
          date: goal.targetDate,
        }),
        action: { kind: "goals", goalId: goal.id },
      });
    for (const task of tasks
      .filter((task) => task.dueDate && task.dueDate <= shiftDay(today, 1))
      .slice(0, 2))
      candidates.push({
        kind: "taskDeadline",
        key: `taskDeadline:${task.id}:${today}`,
        title: t("goalDeadlineTitle"),
        body: t("taskDeadlineBody", { title: task.title, date: task.dueDate! }),
        action: { kind: "goals", goalId: task.goalId },
      });
  }
  const todaySessions = occurrences.filter(
    (o) => localDay(o.startsAt, user.timezone) === today,
  );
  const [recentNotification] = await db
    .select({ createdAt: s.notifications.createdAt })
    .from(s.notifications)
    .where(
      and(eq(s.notifications.userId, userId), eq(s.notifications.type, "aven")),
    )
    .orderBy(desc(s.notifications.createdAt))
    .limit(1);
  const activeStudy =
    Boolean(timer && !timer.pausedAt) ||
    evidence.some(
      (item) =>
        item.status === "valid" &&
        item.endedAt.getTime() > now - 30 * 60000 &&
        item.endedAt.getTime() <= now,
    );
  const first = tasks[0]?.title ?? todaySessions[0]?.title ?? t("firstStep");
  if (prefs.morning && dueLocalTime(now, user.timezone, prefs.morningTime))
    candidates.push({
      kind: "morning",
      key: `morning:${today}`,
      title: t("morningTitle"),
      body: t("morningBody", {
        sessions: todaySessions.length,
        tasks: tasks.filter((task) => task.dueDate && task.dueDate <= today)
          .length,
        action: first,
      }),
      action: dailyAction,
    });
  if (prefs.evening && dueLocalTime(now, user.timezone, prefs.eveningTime))
    candidates.push({
      kind: "evening",
      key: `evening:${today}`,
      title: t("eveningTitle"),
      body: t("eveningBody"),
      action: dailyAction,
    });
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  if (
    prefs.weekly &&
    weekday === prefs.weeklyDay &&
    dueLocalTime(now, user.timezone, prefs.eveningTime)
  ) {
    const [{ completed }] = await db
      .select({ completed: sql<number>`count(*)::int` })
      .from(s.goalTasks)
      .innerJoin(s.goals, eq(s.goals.id, s.goalTasks.goalId))
      .where(
        and(
          eq(s.goals.userId, userId),
          eq(s.goalTasks.status, "completed"),
          sql`${s.goalTasks.completedAt} >= ${new Date(now - 7 * 86400000)}`,
        ),
      );
    candidates.push({
      kind: "weekly",
      key: `weekly:${today}`,
      title: t("weeklyTitle"),
      body: t("weeklyBody", {
        hours: Number(studySummary.hours).toFixed(1),
        goals: goals.length,
        completed,
        deadlines: tasks.filter(
          (task) => task.dueDate && task.dueDate <= shiftDay(today, 7),
        ).length,
      }),
      action: dailyAction,
    });
  }
  const clock = wallTime(new Date(now).toISOString(), user.timezone).slice(
    11,
    16,
  );
  const randomTime = randomCheckInTime(
    userId,
    today,
    prefs.allowedStart,
    prefs.allowedEnd,
  );
  if (
    prefs.randomized &&
    !activeStudy &&
    (!recentNotification ||
      now - recentNotification.createdAt.getTime() >= 60 * 60000) &&
    clock >= prefs.allowedStart &&
    clock < prefs.allowedEnd &&
    dueLocalTime(now, user.timezone, randomTime)
  )
    candidates.push({
      kind: "checkIn",
      key: `checkIn:${today}`,
      title: t("checkInTitle"),
      body: (() => {
        const upcoming = todaySessions.find(
          (session) => Date.parse(session.startsAt) > now,
        );
        const recorded = evidence
          .filter(
            (item) =>
              item.status === "valid" &&
              localDay(item.startedAt.getTime(), user.timezone) === today &&
              item.endedAt.getTime() <= now,
          )
          .reduce((total, item) => total + item.durationSeconds, 0);
        if (recorded > 0)
          return t("checkInProgress", {
            minutes: Math.floor(recorded / 60),
            title: goals[0]?.title ?? t("learning"),
          });
        if (upcoming)
          return t("checkInUpcoming", {
            title: upcoming.title,
            time: wallTime(upcoming.startsAt, user.timezone).slice(11, 16),
          });
        return t("checkInBody", { title: goals[0]?.title ?? t("learning") });
      })(),
      action: dailyAction,
    });
  const latestStudy = studySummary.latest
    ? new Date(studySummary.latest)
    : null;
  if (
    prefs.goalReminders &&
    prefs.morning &&
    (goals.length > 0 || tasks.length > 0) &&
    !activeStudy &&
    dueLocalTime(now, user.timezone, prefs.morningTime) &&
    (!latestStudy ||
      now - latestStudy.getTime() >= prefs.inactivityDays * 86400000)
  )
    candidates.push({
      kind: "recovery",
      key: `recovery:${today}`,
      title: t("recoveryTitle"),
      body: t("recoveryBody"),
      action: dailyAction,
    });
  return db.transaction(async (tx) => {
    // Account lock serializes daily caps, duplicate events, and overlapping worker runs.
    const [actor] = await tx
      .select()
      .from(s.users)
      .where(eq(s.users.id, userId))
      .for("update");
    const [current] = await tx
      .select()
      .from(s.notificationPreferences)
      .where(eq(s.notificationPreferences.userId, userId));
    if (actor?.status !== "active" || !current) return 0;
    const effective = notificationPreferenceSchema.parse(current.value);
    const [currentTimer] = await tx
      .select()
      .from(s.activeTimers)
      .where(eq(s.activeTimers.userId, userId));
    const from = zonedToUtc(`${today}T00:00`, user.timezone),
      to = zonedToUtc(`${shiftDay(today, 1)}T00:00`, user.timezone);
    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(s.notifications)
      .where(
        and(
          eq(s.notifications.userId, userId),
          sql`${s.notifications.deduplicationKey} LIKE 'aven:%'`,
          sql`${s.notifications.createdAt} >= ${from}::timestamptz AND ${s.notifications.createdAt} < ${to}::timestamptz`,
        ),
      );
    let delivered = 0;
    for (const candidate of candidates) {
      if (!candidateEnabled(candidate.kind, effective)) continue;
      if (
        (candidate.kind === "checkIn" || candidate.kind === "missed") &&
        ((currentTimer && !currentTimer.pausedAt) || delivered > 0)
      )
        continue;
      if (!mayNotify(effective, now, actor.timezone, count + delivered)) break;
      if (!effective.inApp && !effective.email && !effective.push) break;
      const [job] = candidate.jobId
        ? await tx
            .update(s.scheduledCheckIns)
            .set({ status: "delivered" })
            .where(
              and(
                eq(s.scheduledCheckIns.id, candidate.jobId),
                eq(s.scheduledCheckIns.userId, userId),
                eq(s.scheduledCheckIns.status, "pending"),
              ),
            )
            .returning({ id: s.scheduledCheckIns.id })
        : await tx
            .insert(s.scheduledCheckIns)
            .values({
              userId,
              kind: candidate.kind,
              deduplicationKey: candidate.key,
              dueAt: new Date(now),
              value: { title: candidate.title, body: candidate.body },
              status: "delivered",
            })
            .onConflictDoNothing()
            .returning({ id: s.scheduledCheckIns.id });
      if (!job) continue;
      const id = await enqueueNotification(
        tx,
        userId,
        candidate.key,
        candidate.title,
        candidate.body,
        effective,
        candidate.action,
      );
      if (id) delivered++;
    }
    return delivered;
  });
}
export async function runAvenScheduler() {
  const started = Date.now(),
    db = getDb();
  let generated = 0,
    processed = 0,
    failed = 0;
  const claimed = await db.transaction(async (tx) => {
    const rows = await tx
      .select({ userId: s.notificationPreferences.userId })
      .from(s.notificationPreferences)
      .where(
        and(
          lte(s.notificationPreferences.nextCheckAt, new Date()),
          sql`${s.notificationPreferences.value}->>'enabled' = 'true'`,
        ),
      )
      .orderBy(asc(s.notificationPreferences.nextCheckAt))
      .limit(12)
      .for("update", { skipLocked: true });
    if (rows.length)
      await tx
        .update(s.notificationPreferences)
        .set({ nextCheckAt: new Date(Date.now() + 300000) })
        .where(
          inArray(
            s.notificationPreferences.userId,
            rows.map((row) => row.userId),
          ),
        );
    return rows;
  });
  for (const row of claimed) {
    if (Date.now() - started > 18000) {
      await db
        .update(s.notificationPreferences)
        .set({ nextCheckAt: new Date() })
        .where(eq(s.notificationPreferences.userId, row.userId));
      continue;
    }
    try {
      generated += await processAvenUser(row.userId, Date.now());
      processed++;
    } catch {
      failed++;
      await db
        .update(s.notificationPreferences)
        .set({ nextCheckAt: new Date(Date.now() + 60000) })
        .where(eq(s.notificationPreferences.userId, row.userId));
    }
  }
  const deliveries =
    Date.now() - started < 20000
      ? await deliverNotifications(4, undefined, started + 26000)
      : { delivered: 0, failed: 0 };
  return {
    ok: failed === 0 && deliveries.failed === 0,
    processed,
    generated,
    failed,
    deliveries,
    remaining: claimed.length === 12,
  };
}
