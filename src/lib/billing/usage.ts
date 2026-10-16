import "server-only";
import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { getSettings } from "@/lib/services/workspace";

/** This month's Aven spend and the learner's file storage, for the billing summary. */
export async function billingUsage(userId: string) {
  const db = getDb();
  const monthStart = sql`date_trunc('month', now())::date`;
  const [[ai], [storage], settings] = await Promise.all([
    db.select({ micros: sql<number>`coalesce(sum(${s.aiUsageRecords.costMicros}), 0)::bigint`.mapWith(Number) })
      .from(s.aiUsageRecords).where(and(eq(s.aiUsageRecords.userId, userId), gte(s.aiUsageRecords.day, monthStart))),
    db.select({ bytes: sql<number>`coalesce(sum(${s.resources.sizeBytes}), 0)::bigint`.mapWith(Number) })
      .from(s.resources).where(eq(s.resources.userId, userId)),
    getSettings(),
  ]);
  return { aiUsedUsd: (ai?.micros ?? 0) / 1e6, storageBytes: storage?.bytes ?? 0, storageLimitMB: settings.storagePerUserMB };
}
