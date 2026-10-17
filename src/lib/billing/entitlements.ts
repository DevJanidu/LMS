import "server-only";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { billingEvents, subscriptions } from "@/lib/db/schema";
import { GoalError } from "@/lib/goals/service";
import type { PlanEntitlements } from "./plans";
import {
  applyBillingEvent,
  effectivePlan,
  entitlementsFor,
  FREE_STATE,
  type BillingEvent,
  type SubscriptionState,
} from "./subscription";

/**
 * Plan restrictions apply only once billing is switched on. Until a payment
 * provider is live, learners keep today's access so nobody loses Aven without
 * a way to upgrade.
 */
export const billingEnforced = () => process.env.BILLING_ENFORCEMENT === "on";

export async function getSubscription(userId: string): Promise<SubscriptionState> {
  const [row] = await getDb().select().from(subscriptions).where(eq(subscriptions.userId, userId));
  if (!row) return FREE_STATE;
  return {
    plan: row.plan,
    status: row.status,
    currentPeriodEnd: row.currentPeriodEnd,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    lastEventAt: row.lastEventAt,
  };
}

export async function getBillingOverview(userId: string) {
  const state = await getSubscription(userId);
  return { state, plan: effectivePlan(state), enforced: billingEnforced() };
}

/**
 * Aven allowance for model selection and budgets. null = no plan restriction (billing off),
 * so learners keep today's access until a payment provider is live.
 */
export async function aiAllowance(userId: string): Promise<{
  models: PlanEntitlements["aiModels"] | null;
  monthlyBudgetUsd: number | null;
}> {
  if (!billingEnforced()) return { models: null, monthlyBudgetUsd: null };
  const entitlements = entitlementsFor(await getSubscription(userId));
  return { models: entitlements.aiModels, monthlyBudgetUsd: entitlements.aiMonthlyBudgetUsd };
}

/** Server-side gate. Hidden buttons are never the only protection. */
export async function assertEntitlement(userId: string, feature: keyof Omit<PlanEntitlements, "aiMonthlyBudgetUsd" | "proactive" | "aiModels">) {
  if (!billingEnforced()) return;
  const entitlements = entitlementsFor(await getSubscription(userId));
  if (!entitlements[feature]) throw new GoalError("planUpgradeRequired", 402);
}

/**
 * Apply a verified provider event exactly once. The ledger insert and the
 * subscription update share a transaction, so retries are harmless.
 */
export async function recordBillingEvent(event: BillingEvent, payload: Record<string, unknown>) {
  return getDb().transaction(async (tx) => {
    const inserted = await tx
      .insert(billingEvents)
      .values({ provider: event.provider, eventId: event.eventId, type: event.type, userId: event.userId, payload })
      .onConflictDoNothing()
      .returning({ eventId: billingEvents.eventId });
    if (!inserted.length) return { applied: false as const };
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`billing:${event.userId}`}))`);
    const [row] = await tx.select().from(subscriptions).where(eq(subscriptions.userId, event.userId));
    const current: SubscriptionState = row
      ? { plan: row.plan, status: row.status, currentPeriodEnd: row.currentPeriodEnd, cancelAtPeriodEnd: row.cancelAtPeriodEnd, lastEventAt: row.lastEventAt }
      : FREE_STATE;
    const next = applyBillingEvent(current, event);
    if (next === current) return { applied: false as const };
    const values = {
      ...next,
      provider: event.provider,
      providerCustomerId: event.providerCustomerId ?? row?.providerCustomerId ?? null,
      providerSubscriptionId: event.providerSubscriptionId ?? row?.providerSubscriptionId ?? null,
      updatedAt: new Date(),
    };
    await tx
      .insert(subscriptions)
      .values({ userId: event.userId, ...values })
      .onConflictDoUpdate({ target: subscriptions.userId, set: values });
    return { applied: true as const, state: next };
  });
}
