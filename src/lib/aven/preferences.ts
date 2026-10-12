import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { GoalError } from "@/lib/goals/service";
import {
  aiPreferenceSchema,
  notificationPreferenceSchema,
  type preferenceMutationSchema,
} from "./validation";
import { avenStatus, avenConfig } from "./config";
import type { z } from "zod";
export async function getAvenPreferences(userId: string) {
  const db = getDb();
  const [[ai], [notifications], memory, usage, [account], globalUsage] =
    await Promise.all([
      db
        .select()
        .from(s.aiUserPreferences)
        .where(eq(s.aiUserPreferences.userId, userId)),
      db
        .select()
        .from(s.notificationPreferences)
        .where(eq(s.notificationPreferences.userId, userId)),
      db
        .select({
          id: s.aiMemory.id,
          content: s.aiMemory.content,
          source: s.aiMemory.source,
        })
        .from(s.aiMemory)
        .where(eq(s.aiMemory.userId, userId))
        .orderBy(desc(s.aiMemory.updatedAt))
        .limit(50),
      db.execute<{ tokens: number; costMicros: number; hadUsage: boolean }>(
        sql`SELECT coalesce(sum(input_tokens+output_tokens),0)::int AS tokens, coalesce(sum(cost_micros),0)::int AS "costMicros" , EXISTS(SELECT 1 FROM ai_usage_records older WHERE older.user_id=${userId}::uuid) AS "hadUsage" FROM ai_usage_records WHERE user_id=${userId}::uuid AND day >= date_trunc('month',now())::date`,
      ),
      db
        .select({ timezone: s.users.timezone })
        .from(s.users)
        .where(eq(s.users.id, userId)),
      db.execute<{ costMicros: number }>(
        sql`SELECT coalesce(sum(cost_micros),0)::bigint AS "costMicros" FROM ai_usage_records WHERE day>=date_trunc('month',now())::date`,
      ),
    ]);
  const status = avenStatus(),
    config = status.configured ? avenConfig() : null;
  return {
    timezone: account?.timezone ?? "UTC",
    ai: aiPreferenceSchema.parse({
      ...ai?.value,
      onboardingComplete: Boolean(
        ai?.value.onboardingComplete ||
        ai?.value.consent ||
        usage.rows[0].hadUsage,
      ),
    }),
    notifications: notificationPreferenceSchema.parse(
      notifications?.value ?? {},
    ),
    memory,
    usage: usage.rows[0],
    budget: {
      monthlyUsd: config?.globalMonthlyBudget ?? 5,
      usedUsd: Number(globalUsage.rows[0].costMicros) / 1e6,
      dailyLimitEnabled: Boolean(config?.dailyBudget || config?.dailyTokens),
    },
    configured: avenStatus().configured,
    configurationError: avenStatus().code,
    pushConfigured: Boolean(
      process.env.VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY &&
      process.env.VAPID_SUBJECT,
    ),
    emailConfigured: Boolean(
      process.env.RESEND_API_KEY && process.env.EMAIL_FROM,
    ),
    publicPushKey: process.env.VAPID_PUBLIC_KEY ?? "",
  };
}
export async function changeAvenPreferences(
  userId: string,
  input: z.infer<typeof preferenceMutationSchema>,
) {
  const db = getDb();
  await db.transaction(async (tx) => {
    const [user] = await tx
      .select()
      .from(s.users)
      .where(eq(s.users.id, userId))
      .for("update");
    if (user?.status !== "active" || user.role !== "learner")
      throw new GoalError("authenticationFailed", 403);
    if (input.kind === "enableAven" || input.kind === "onboard") {
      const [existing] = await tx
        .select()
        .from(s.aiUserPreferences)
        .where(eq(s.aiUserPreferences.userId, userId));
      const value = {
        ...aiPreferenceSchema.parse(existing?.value ?? {}),
        consent: true,
        onboardingComplete: true,
        ...(input.kind === "onboard" && input.locale
          ? { locale: input.locale }
          : {}),
      };
      await tx
        .insert(s.aiUserPreferences)
        .values({ userId, value })
        .onConflictDoUpdate({
          target: s.aiUserPreferences.userId,
          set: { value, updatedAt: new Date() },
        });
      if (input.kind === "onboard" && input.reminders) {
        const [existingNotifications] = await tx
          .select()
          .from(s.notificationPreferences)
          .where(eq(s.notificationPreferences.userId, userId));
        const notifications = notificationPreferenceSchema.parse({
          ...existingNotifications?.value,
          enabled: true,
          inApp: true,
          morning: true,
          evening: true,
          weekly: true,
          randomized: true,
          dailyLimit: 6,
        });
        await tx
          .insert(s.notificationPreferences)
          .values({ userId, value: notifications })
          .onConflictDoUpdate({
            target: s.notificationPreferences.userId,
            set: {
              value: notifications,
              nextCheckAt: new Date(),
              updatedAt: new Date(),
            },
          });
      }
    } else if (input.kind === "enableReminders") {
      const [existing] = await tx
        .select()
        .from(s.notificationPreferences)
        .where(eq(s.notificationPreferences.userId, userId));
      const value = notificationPreferenceSchema.parse({
        ...existing?.value,
        enabled: true,
        inApp: true,
        morning: true,
        sessionReminders: true,
        missedSessions: true,
        goalReminders: true,
        randomized: true,
        evening: true,
        weekly: true,
        dailyLimit: 6,
        snoozedUntil: null,
      });
      await tx
        .insert(s.notificationPreferences)
        .values({ userId, value })
        .onConflictDoUpdate({
          target: s.notificationPreferences.userId,
          set: { value, nextCheckAt: new Date(), updatedAt: new Date() },
        });
    } else if (input.kind === "preferences") {
      const [currentAi] = await tx
        .select()
        .from(s.aiUserPreferences)
        .where(eq(s.aiUserPreferences.userId, userId));
      const aiValue = {
        ...input.ai,
        onboardingComplete: Boolean(
          input.ai.onboardingComplete ||
          currentAi?.value.onboardingComplete ||
          currentAi?.value.consent,
        ),
      };
      await tx
        .insert(s.aiUserPreferences)
        .values({ userId, value: aiValue })
        .onConflictDoUpdate({
          target: s.aiUserPreferences.userId,
          set: { value: aiValue, updatedAt: new Date() },
        });
      await tx
        .insert(s.notificationPreferences)
        .values({ userId, value: input.notifications })
        .onConflictDoUpdate({
          target: s.notificationPreferences.userId,
          set: { value: input.notifications, updatedAt: new Date() },
        });
    } else if (input.kind === "memory") {
      const [existing] = await tx
        .select()
        .from(s.aiMemory)
        .where(eq(s.aiMemory.id, input.id));
      if (existing && existing.userId !== userId)
        throw new GoalError("recordUnavailable", 404);
      const [{ count }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(s.aiMemory)
        .where(eq(s.aiMemory.userId, userId));
      if (!existing && count >= 50) throw new GoalError("limitReached");
      await tx
        .insert(s.aiMemory)
        .values({
          id: input.id,
          userId,
          content: input.content,
          source: "user",
        })
        .onConflictDoUpdate({
          target: s.aiMemory.id,
          set: {
            content: input.content,
            source: "user",
            updatedAt: new Date(),
          },
        });
    } else if (input.kind === "summary") {
      const [conversation] = await tx
        .select()
        .from(s.aiConversations)
        .where(
          and(
            eq(s.aiConversations.id, input.id),
            eq(s.aiConversations.userId, userId),
          ),
        )
        .for("update");
      if (!conversation) throw new GoalError("recordUnavailable", 404);
      if (conversation.lockedUntil && conversation.lockedUntil > new Date())
        throw new GoalError("conversationBusy", 409);
      await tx
        .update(s.aiConversations)
        .set({ summary: input.content })
        .where(eq(s.aiConversations.id, input.id));
    } else if (input.kind === "deleteMemory")
      await tx
        .delete(s.aiMemory)
        .where(and(eq(s.aiMemory.id, input.id), eq(s.aiMemory.userId, userId)));
    else if (input.kind === "deleteAllMemory") {
      await tx.delete(s.aiMemory).where(eq(s.aiMemory.userId, userId));
      await tx
        .update(s.aiConversations)
        .set({ summary: "", summaryMessageCount: 0 })
        .where(eq(s.aiConversations.userId, userId));
    } else if (input.kind === "deleteConversation")
      await tx
        .delete(s.aiConversations)
        .where(
          and(
            eq(s.aiConversations.id, input.id),
            eq(s.aiConversations.userId, userId),
          ),
        );
  });
  return getAvenPreferences(userId);
}
