import { isPlanId, type PlanId } from "./plans";

/**
 * Remembers a plan chosen on the pricing page across signup and onboarding.
 * It is only a UI preference — it never grants access.
 */
export const SELECTED_PLAN_COOKIE = "acadence-plan";
export const SELECTED_PLAN_MAX_AGE = 60 * 60 * 24;

export function paidPlan(value: unknown): Exclude<PlanId, "free"> | undefined {
  return isPlanId(value) && value !== "free" ? value : undefined;
}

export function selectedPlanFromCookies(cookieHeader: string): Exclude<PlanId, "free"> | undefined {
  const match = new RegExp(`(?:^|;\\s*)${SELECTED_PLAN_COOKIE}=([^;]+)`).exec(cookieHeader);
  return paidPlan(match?.[1]);
}
