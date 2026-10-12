import { PLANS, type PlanId } from "@/lib/billing/plans";

/** true/false render as ✓/—; strings are message keys under `marketing.compare.values`. */
type Cell = boolean | string;
export interface ComparisonGroup {
  key: string;
  rows: { key: string; values: Record<PlanId, Cell> }[];
}

const all = { free: true, pro: true, plus: true };
const paid = { free: false, pro: true, plus: true };
const by = <T extends Cell>(pick: (plan: PlanId) => T) =>
  ({ free: pick("free"), pro: pick("pro"), plus: pick("plus") }) as Record<PlanId, Cell>;
const e = (plan: PlanId) => PLANS[plan].entitlements;

export const COMPARISON: ComparisonGroup[] = [
  {
    key: "learning",
    rows: [
      { key: "subjects", values: all },
      { key: "timer", values: all },
      { key: "history", values: all },
    ],
  },
  {
    key: "planning",
    rows: [
      { key: "planner", values: all },
      { key: "goals", values: all },
      { key: "tasks", values: all },
    ],
  },
  {
    key: "analytics",
    rows: [
      { key: "basicAnalytics", values: all },
      { key: "advancedAnalytics", values: by((plan) => e(plan).advancedAnalytics) },
    ],
  },
  {
    key: "aven",
    rows: [
      { key: "chat", values: by((plan) => e(plan).aven) },
      { key: "goalPlanning", values: by((plan) => e(plan).aiGoalPlanning) },
      { key: "schedules", values: by((plan) => e(plan).aiGoalPlanning) },
      { key: "recommendations", values: paid },
      { key: "allowance", values: { free: false, pro: "standard", plus: "higher" } },
    ],
  },
  {
    key: "companion",
    rows: [
      { key: "reminders", values: by((plan) => (e(plan).proactive === "none" ? false : e(plan).proactive)) },
      { key: "recovery", values: by((plan) => e(plan).adaptiveRecovery) },
      { key: "weeklyReviews", values: by((plan) => e(plan).weeklyReviews) },
      { key: "coaching", values: by((plan) => e(plan).goalCoaching) },
    ],
  },
  {
    key: "resources",
    rows: [
      { key: "library", values: all },
      { key: "files", values: all },
    ],
  },
  {
    key: "support",
    rows: [
      { key: "export", values: all },
      { key: "deletion", values: all },
    ],
  },
];
