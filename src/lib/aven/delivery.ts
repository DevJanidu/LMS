import "server-only";
import { and, eq, inArray, lte, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { notificationPreferenceSchema } from "./validation";
import { inQuietHours, retryAt } from "./scheduler-model";
import { wallTime } from "@/lib/analytics";
import { sendPush } from "./push";
export async function deliverNotifications(
  limit = 4,
  owner?: string,
  deadline = Date.now() + 25000,
) {
  const db = getDb();
  let delivered = 0,
    failed = 0;
  const claimed = await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(s.notificationDeliveries)
      .where(
        and(
          inArray(s.notificationDeliveries.status, [
            "pending",
            "retry",
            "sending",
          ]),
          owner
            ? sql`EXISTS(SELECT 1 FROM notifications n WHERE n.id=${s.notificationDeliveries.notificationId} AND n.user_id=${owner}::uuid)`
            : undefined,
          lte(s.notificationDeliveries.nextAttemptAt, new Date()),
          or(
            sql`${s.notificationDeliveries.leaseUntil} IS NULL`,
            lte(s.notificationDeliveries.leaseUntil, new Date()),
          ),
        ),
      )
      .limit(limit)
      .for("update", { skipLocked: true });
    if (rows.length)
      await tx
        .update(s.notificationDeliveries)
        .set({ status: "sending", leaseUntil: new Date(Date.now() + 60000) })
        .where(
          inArray(
            s.notificationDeliveries.id,
            rows.map((row) => row.id),
          ),
        );
    return rows;
  });
  for (const row of claimed) {
    if (Date.now() >= deadline) break;
    let status = "delivered",
      error: string | null = null;
    try {
      const [notification] = await db
        .select()
        .from(s.notifications)
        .where(eq(s.notifications.id, row.notificationId));
      if (!notification) continue;
      const [[user], [preference]] = await Promise.all([
        db.select().from(s.users).where(eq(s.users.id, notification.userId)),
        db
          .select()
          .from(s.notificationPreferences)
          .where(eq(s.notificationPreferences.userId, notification.userId)),
      ]);
      const prefs = notificationPreferenceSchema.parse(preference?.value ?? {});
      if (
        !user ||
        user.status !== "active" ||
        !prefs.enabled ||
        (row.channel === "email" && !prefs.email) ||
        (row.channel === "push" && !prefs.push)
      )
        status = "cancelled";
      else if (
        inQuietHours(
          wallTime(new Date().toISOString(), user.timezone).slice(11, 16),
          prefs.quietStart,
          prefs.quietEnd,
        ) ||
        (prefs.snoozedUntil && Date.parse(prefs.snoozedUntil) > Date.now())
      ) {
        await db
          .update(s.notificationDeliveries)
          .set({
            status: "retry",
            leaseUntil: null,
            nextAttemptAt: new Date(Date.now() + 300000),
          })
          .where(eq(s.notificationDeliveries.id, row.id));
        continue;
      } else if (row.channel === "email") {
        if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM)
          throw new Error("emailNotConfigured");
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
            "Idempotency-Key": `aven/${notification.id}`,
          },
          body: JSON.stringify({
            from: process.env.EMAIL_FROM,
            to: user.email,
            subject: notification.title,
            text: `${notification.body}\n\n${process.env.APP_URL ?? process.env.BETTER_AUTH_URL}/aven?notification=${notification.id}`,
          }),
          signal: AbortSignal.timeout(4000),
        });
        if (!response.ok) throw new Error("emailDeliveryFailed");
      } else if (row.channel === "push") {
        const subscriptions = await db
          .select()
          .from(s.pushSubscriptions)
          .where(eq(s.pushSubscriptions.userId, user.id));
        if (!subscriptions.length) status = "cancelled";
        await Promise.all(
          subscriptions.map(async (subscription) => {
            const response = await sendPush(
              subscription,
              JSON.stringify({
                id: notification.id,
                title: notification.title,
                body: notification.body,
                url: `/aven?notification=${notification.id}`,
              }),
            );
            if (response.status === 404 || response.status === 410)
              await db
                .delete(s.pushSubscriptions)
                .where(eq(s.pushSubscriptions.id, subscription.id));
            else if (!response.ok) throw new Error("pushDeliveryFailed");
          }),
        );
      }
      if (status === "delivered") delivered++;
    } catch (cause) {
      error =
        cause instanceof Error &&
        [
          "pushNotConfigured",
          "emailNotConfigured",
          "pushDeliveryFailed",
          "emailDeliveryFailed",
        ].includes(cause.message)
          ? cause.message
          : "deliveryUnavailable";
      status = row.attempts + 1 >= 8 ? "failed" : "retry";
      failed++;
    }
    await db
      .update(s.notificationDeliveries)
      .set({
        status,
        attempts: row.attempts + 1,
        leaseUntil: null,
        nextAttemptAt: retryAt(row.attempts + 1, Date.now()),
        lastError: error,
        deliveredAt: status === "delivered" ? new Date() : null,
      })
      .where(eq(s.notificationDeliveries.id, row.id));
  }
  return { delivered, failed };
}
