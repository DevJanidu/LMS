import { PLANS, type PlanEntitlements, type PlanId } from "./plans";

export type SubscriptionStatus = "active" | "trialing" | "past_due" | "canceled" | "incomplete";

export interface SubscriptionState {
  plan: PlanId;
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  lastEventAt: Date | null;
}

/**
 * Provider-neutral event. Each provider adapter translates its verified
 * webhook payload into this shape; nothing else may change entitlements.
 */
export interface BillingEvent {
  provider: string;
  eventId: string;
  occurredAt: Date;
  userId: string;
  type:
    | "subscription.activated"
    | "subscription.renewed"
    | "subscription.plan_changed"
    | "subscription.payment_failed"
    | "subscription.cancel_scheduled"
    | "subscription.canceled";
  plan?: PlanId;
  currentPeriodEnd?: Date;
  providerCustomerId?: string;
  providerSubscriptionId?: string;
}

export const FREE_STATE: SubscriptionState = {
  plan: "free",
  status: "active",
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  lastEventAt: null,
};

/** Pure state transition; out-of-order (older) events leave state unchanged. */
export function applyBillingEvent(current: SubscriptionState, event: BillingEvent): SubscriptionState {
  if (current.lastEventAt && event.occurredAt < current.lastEventAt) return current;
  const base = { ...current, lastEventAt: event.occurredAt };
  switch (event.type) {
    case "subscription.activated":
    case "subscription.renewed":
    case "subscription.plan_changed":
      if (!event.plan) return current;
      return {
        ...base,
        plan: event.plan,
        status: "active",
        currentPeriodEnd: event.currentPeriodEnd ?? current.currentPeriodEnd,
        cancelAtPeriodEnd: event.type === "subscription.plan_changed" ? current.cancelAtPeriodEnd : false,
      };
    case "subscription.payment_failed":
      return { ...base, status: "past_due" };
    case "subscription.cancel_scheduled":
      return { ...base, cancelAtPeriodEnd: true, currentPeriodEnd: event.currentPeriodEnd ?? current.currentPeriodEnd };
    case "subscription.canceled":
      return { ...FREE_STATE, status: "canceled", lastEventAt: event.occurredAt };
  }
}

/**
 * The plan a learner can use right now. Paid access continues through the
 * paid period after a scheduled cancellation, and stops for unpaid states.
 */
export function effectivePlan(state: SubscriptionState, now = new Date()): PlanId {
  if (state.plan === "free") return "free";
  if (state.status !== "active" && state.status !== "trialing") return "free";
  if (state.currentPeriodEnd && state.currentPeriodEnd < now) return "free";
  return state.plan;
}

export function entitlementsFor(state: SubscriptionState, now = new Date()): PlanEntitlements {
  return PLANS[effectivePlan(state, now)].entitlements;
}
