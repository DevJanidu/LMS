import { recordAttendance } from "@/lib/study/attendance";
import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { getCalendarBlock } from "@/lib/services/calendar";
import { getOccurrences } from "@/lib/schedule";
import { localDay, shiftDay } from "@/lib/analytics";
import { GoalError } from "@/lib/goals/service";
import { notificationPreferenceSchema } from "./validation";
import { applyCalendarProposal } from "./calendar-actions";
export async function listAvenNotifications(userId: string, page = 1) {
  const db = getDb(),
    where = and(
      eq(s.notifications.userId, userId),
      eq(s.notifications.type, "aven"),
    );
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(s.notifications)
    .where(where);
  const current = Math.max(1, Math.min(page, Math.ceil(total / 20)));
  const rows = await db
    .select({
      id: s.notifications.id,
      title: s.notifications.title,
      body: s.notifications.body,
      readAt: s.notifications.readAt,
      createdAt: s.notifications.createdAt,
      action: s.notificationActions.value,
    })
    .from(s.notifications)
    .leftJoin(
      s.notificationActions,
      eq(s.notificationActions.notificationId, s.notifications.id),
    )
    .where(where)
    .orderBy(desc(s.notifications.createdAt))
    .limit(20)
    .offset((current - 1) * 20);
  const deliveries = rows.length
    ? await db
        .select({
          notificationId: s.notificationDeliveries.notificationId,
          channel: s.notificationDeliveries.channel,
          status: s.notificationDeliveries.status,
          attempts: s.notificationDeliveries.attempts,
        })
        .from(s.notificationDeliveries)
        .where(
          inArray(
            s.notificationDeliveries.notificationId,
            rows.map((row) => row.id),
          ),
        )
    : [];
  return {
    rows: rows.map((row) => ({
      ...row,
      readAt: row.readAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      deliveries: deliveries.filter((d) => d.notificationId === row.id),
    })),
    total,
    page: current,
  };
}
export async function notificationAction(
  userId: string,
  id: string,
  kind: "read" | "skip" | "reschedule" | "snooze",
  startsAt?: string,
  endsAt?: string,
) {
  return getDb().transaction(async (tx) => {
    const [user] = await tx
      .select()
      .from(s.users)
      .where(eq(s.users.id, userId))
      .for("update");
    if (user?.status !== "active" || user.role !== "learner")
      throw new GoalError("authenticationFailed", 403);
    const [notification] = await tx
      .select()
      .from(s.notifications)
      .where(
        and(
          eq(s.notifications.id, id),
          eq(s.notifications.userId, userId),
          eq(s.notifications.type, "aven"),
        ),
      )
      .for("update");
    if (!notification) throw new GoalError("recordUnavailable", 404);
    if (kind === "snooze") {
      const [current] = await tx
        .select()
        .from(s.notificationPreferences)
        .where(eq(s.notificationPreferences.userId, userId));
      const snoozedUntil = new Date(Date.now() + 3600000).toISOString();
      await tx
        .insert(s.notificationPreferences)
        .values({
          userId,
          value: notificationPreferenceSchema.parse({
            ...current?.value,
            snoozedUntil,
          }),
        })
        .onConflictDoUpdate({
          target: s.notificationPreferences.userId,
          set: {
            value: notificationPreferenceSchema.parse({
              ...current?.value,
              snoozedUntil,
            }),
            updatedAt: new Date(),
          },
        });
      return { resolved: "snooze", snoozedUntil };
    }
    if (kind !== "read") {
      const [action] = await tx
        .select()
        .from(s.notificationActions)
        .where(eq(s.notificationActions.notificationId, id));
      if (action?.value.resolved) return { resolved: action.value.resolved };
      if (!action?.value.blockId || !action.value.date)
        throw new GoalError("invalidInput");
      const block = await getCalendarBlock(userId, action.value.blockId);
      const occurrenceDay = localDay(action.value.startsAt!, user.timezone);
      const occurrence = getOccurrences(
        [block],
        shiftDay(occurrenceDay, -2),
        shiftDay(occurrenceDay, 2),
      ).find((item) => item.date === action.value.date);
      if (!occurrence || occurrence.startsAt !== action.value.startsAt)
        throw new GoalError("conflict", 409);
      if (
        kind === "reschedule" &&
        (!startsAt ||
          !endsAt ||
          Date.parse(endsAt) <= Date.parse(startsAt) ||
          Date.parse(startsAt) < Date.now())
      )
        throw new GoalError("invalidSchedule");
      if (kind === "reschedule")
        await applyCalendarProposal(tx, userId, user.timezone, {
          kind: "calendarChanges",
          explanation: "User rescheduled from notification",
          changes: [
            {
              action: "move",
              blockId: block.id,
              date: action.value.date,
              expectedUpdatedAt: block.updatedAt,
              startsAt: startsAt!,
              endsAt: endsAt!,
            },
          ],
        });
      else
        await recordAttendance(
          tx,
          userId,
          {
            blockId: block.id,
            date: action.value.date,
            expectedStartsAt: occurrence.startsAt,
          },
          "skipped",
        );
      await tx
        .update(s.notificationActions)
        .set({ value: { ...action.value, resolved: kind } })
        .where(eq(s.notificationActions.notificationId, id));
    }
    await tx
      .update(s.notifications)
      .set({ readAt: new Date() })
      .where(eq(s.notifications.id, id));
    return { resolved: kind };
  });
}
