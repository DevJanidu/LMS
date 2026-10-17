/**
 * Single source of truth for subscription plans, prices and entitlements.
 *
 * Display currency, billing currency and regional pricing are deliberately
 * separate fields so international pricing can be added without touching UI.
 * Prices are stored in minor units (cents) to avoid floating-point drift.
 */
export const PLAN_IDS = ["free", "pro", "plus"] as const;
export type PlanId = (typeof PLAN_IDS)[number];
export type BillingInterval = "month" | "year";
export type ProactiveLevel = "none" | "limited" | "enhanced";

export interface PlanPrice {
  /** Region code the price applies to; "default" is the launch price list. */
  region: "default";
  currency: "LKR";
  amountMinor: number;
  interval: BillingInterval;
}

export interface PlanEntitlements {
  coreLearning: true;
  aven: boolean;
  aiGoalPlanning: boolean;
  advancedAnalytics: boolean;
  proactive: ProactiveLevel;
  adaptiveRecovery: boolean;
  weeklyReviews: boolean;
  goalCoaching: boolean;
  /** Monthly Aven allowance in USD of model spend; 0 = no AI access. */
  aiMonthlyBudgetUsd: number;
  /** Aven models the plan may use (keys from aven/model-options); empty = none. */
  aiModels: readonly ("sol" | "luna")[];
}

export interface Plan {
  id: PlanId;
  recommended: boolean;
  prices: PlanPrice[];
  entitlements: PlanEntitlements;
}

/**
 * Launch quotas. These are operator-tunable allowances, not marketing claims:
 * review them against real model costs before enabling paid checkout.
 */
export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    recommended: false,
    prices: [{ region: "default", currency: "LKR", amountMinor: 0, interval: "month" }],
    entitlements: {
      coreLearning: true,
      aven: false,
      aiGoalPlanning: false,
      advancedAnalytics: false,
      proactive: "none",
      adaptiveRecovery: false,
      weeklyReviews: false,
      goalCoaching: false,
      aiMonthlyBudgetUsd: 0,
      aiModels: [],
    },
  },
  pro: {
    id: "pro",
    recommended: true,
    prices: [{ region: "default", currency: "LKR", amountMinor: 199_900, interval: "month" }],
    entitlements: {
      coreLearning: true,
      aven: true,
      aiGoalPlanning: true,
      advancedAnalytics: true,
      proactive: "limited",
      adaptiveRecovery: false,
      weeklyReviews: false,
      goalCoaching: false,
      aiMonthlyBudgetUsd: 3,
      aiModels: ["sol", "luna"],
    },
  },
  plus: {
    id: "plus",
    recommended: false,
    prices: [{ region: "default", currency: "LKR", amountMinor: 299_900, interval: "month" }],
    entitlements: {
      coreLearning: true,
      aven: true,
      aiGoalPlanning: true,
      advancedAnalytics: true,
      proactive: "enhanced",
      adaptiveRecovery: true,
      weeklyReviews: true,
      goalCoaching: true,
      aiMonthlyBudgetUsd: 6,
      aiModels: ["sol", "luna"],
    },
  },
};

/** Intervals with a configured price. The annual toggle appears only once one exists. */
export const AVAILABLE_INTERVALS: BillingInterval[] = [
  ...new Set(Object.values(PLANS).flatMap((plan) => plan.prices.map((price) => price.interval))),
];

export const isPlanId = (value: unknown): value is PlanId =>
  typeof value === "string" && (PLAN_IDS as readonly string[]).includes(value);

export function planPrice(id: PlanId, interval: BillingInterval = "month") {
  return PLANS[id].prices.find((price) => price.interval === interval && price.region === "default");
}

/** "Rs. 1,999" — whole rupees; LKR minor units are shown only when non-zero. */
export function formatPrice(price: Pick<PlanPrice, "amountMinor" | "currency">) {
  const major = price.amountMinor / 100;
  const formatted = new Intl.NumberFormat("en-LK", {
    minimumFractionDigits: Number.isInteger(major) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(major);
  return price.currency === "LKR" ? `Rs. ${formatted}` : `${price.currency} ${formatted}`;
}
