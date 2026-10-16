import "server-only";
import { and, count, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { getBillingOverview } from "@/lib/billing/entitlements";
import { getBillingProvider } from "@/lib/billing/provider";
import { entitlementsFor } from "@/lib/billing/subscription";
import { getAvenPreferences } from "@/lib/aven/preferences";
import type { NotificationPreferences, AiPreferences } from "@/lib/aven/validation";
import type { PlanId } from "@/lib/billing/plans";

/** Everything the Settings page shows beyond the workspace store, read in parallel. */
export interface SettingsOverview {
  account: { image: string | null; emailVerified: boolean; memberSince: string };
  plan: { id: PlanId; status: string; renewsAt: string | null; cancelAtPeriodEnd: boolean; checkoutAvailable: boolean } | null;
  usage: { storageBytes: number; subjects: number; aiUsedUsd: number; aiBudgetUsd: number } | null;
  reminders: { notifications: NotificationPreferences; ai: AiPreferences; emailConfigured: boolean; pushConfigured: boolean } | null;
}

export async function settingsOverview(user: { id: string; image: string | null; emailVerified: boolean; createdAt: Date }): Promise<SettingsOverview> {
  const db = getDb();
  // Each source fails on its own: an unavailable section shows an error state, not a broken page.
  const [billing, storage, subjects, aven] = await Promise.all([
    getBillingOverview(user.id).catch(() => null),
    db.select({ bytes: sql<number>`coalesce(sum(${s.resources.sizeBytes}), 0)::bigint`.mapWith(Number) }).from(s.resources).where(eq(s.resources.userId, user.id)).then(rows => rows[0]?.bytes ?? 0).catch(() => null),
    db.select({ total: count() }).from(s.subjects).where(and(eq(s.subjects.userId, user.id), eq(s.subjects.status, "active"))).then(rows => rows[0]?.total ?? 0).catch(() => null),
    getAvenPreferences(user.id).catch(() => null),
  ]);
  return {
    account: { image: user.image, emailVerified: user.emailVerified, memberSince: user.createdAt.toISOString() },
    plan: billing ? {
      id: billing.plan, status: billing.state.status, renewsAt: billing.state.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: billing.state.cancelAtPeriodEnd, checkoutAvailable: getBillingProvider() !== null,
    } : null,
    usage: storage !== null && subjects !== null ? {
      storageBytes: storage, subjects,
      aiUsedUsd: aven ? Number(aven.usage.costMicros) / 1e6 : 0,
      aiBudgetUsd: billing ? entitlementsFor(billing.state).aiMonthlyBudgetUsd : 0,
    } : null,
    reminders: aven ? { notifications: aven.notifications, ai: aven.ai, emailConfigured: aven.emailConfigured, pushConfigured: aven.pushConfigured } : null,
  };
}
