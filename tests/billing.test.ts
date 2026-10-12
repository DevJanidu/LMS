import { afterEach, describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";
import { AVAILABLE_INTERVALS, formatPrice, isPlanId, PLAN_IDS, PLANS, planPrice } from "@/lib/billing/plans";
import { applyBillingEvent, effectivePlan, entitlementsFor, FREE_STATE, type BillingEvent } from "@/lib/billing/subscription";
import { paidPlan, selectedPlanFromCookies } from "@/lib/billing/selection";
import { COMPARISON } from "@/components/marketing/comparison";

vi.mock("@/lib/db", () => ({ getDb: () => { throw new Error("database must not be queried"); } }));

const at = (iso: string) => new Date(iso);
const event = (patch: Partial<BillingEvent>): BillingEvent => ({
  provider: "test",
  eventId: crypto.randomUUID(),
  occurredAt: at("2026-10-01T00:00:00Z"),
  userId: "user",
  type: "subscription.activated",
  plan: "pro",
  currentPeriodEnd: at("2026-11-01T00:00:00Z"),
  ...patch,
});

describe("plan configuration", () => {
  it("prices the launch plans in LKR, monthly", () => {
    expect(formatPrice(planPrice("free")!)).toBe("Rs. 0");
    expect(formatPrice(planPrice("pro")!)).toBe("Rs. 1,999");
    expect(formatPrice(planPrice("plus")!)).toBe("Rs. 2,999");
    expect(AVAILABLE_INTERVALS).toEqual(["month"]);
    expect(planPrice("pro", "year")).toBeUndefined();
  });

  it("keeps Aven out of Free and gives Plus at least Pro's allowance", () => {
    expect(PLANS.free.entitlements.aven).toBe(false);
    expect(PLANS.free.entitlements.aiMonthlyBudgetUsd).toBe(0);
    expect(PLANS.plus.entitlements.aiMonthlyBudgetUsd).toBeGreaterThan(PLANS.pro.entitlements.aiMonthlyBudgetUsd);
    expect(PLAN_IDS.filter((id) => PLANS[id].recommended)).toEqual(["pro"]);
  });

  it("only accepts known plan identifiers", () => {
    expect(isPlanId("pro")).toBe(true);
    expect(isPlanId("enterprise")).toBe(false);
    expect(paidPlan("free")).toBeUndefined();
    expect(paidPlan("plus")).toBe("plus");
  });
});

describe("subscription events", () => {
  it("activates, renews and changes plans", () => {
    const active = applyBillingEvent(FREE_STATE, event({}));
    expect(active).toMatchObject({ plan: "pro", status: "active" });
    const upgraded = applyBillingEvent(active, event({ type: "subscription.plan_changed", plan: "plus", occurredAt: at("2026-10-05T00:00:00Z") }));
    expect(upgraded.plan).toBe("plus");
    const renewed = applyBillingEvent(upgraded, event({ type: "subscription.renewed", plan: "plus", occurredAt: at("2026-11-01T00:00:00Z"), currentPeriodEnd: at("2026-12-01T00:00:00Z") }));
    expect(renewed.currentPeriodEnd).toEqual(at("2026-12-01T00:00:00Z"));
  });

  it("ignores events older than the last applied one", () => {
    const active = applyBillingEvent(FREE_STATE, event({ occurredAt: at("2026-10-10T00:00:00Z") }));
    const stale = applyBillingEvent(active, event({ type: "subscription.canceled", occurredAt: at("2026-10-09T00:00:00Z") }));
    expect(stale).toBe(active);
  });

  it("removes paid access after a failed payment", () => {
    const failed = applyBillingEvent(applyBillingEvent(FREE_STATE, event({})), event({ type: "subscription.payment_failed", occurredAt: at("2026-10-02T00:00:00Z") }));
    expect(failed.status).toBe("past_due");
    expect(effectivePlan(failed, at("2026-10-03T00:00:00Z"))).toBe("free");
  });

  it("keeps paid access until the end of a cancelled period", () => {
    const scheduled = applyBillingEvent(applyBillingEvent(FREE_STATE, event({})), event({ type: "subscription.cancel_scheduled", occurredAt: at("2026-10-02T00:00:00Z") }));
    expect(scheduled.cancelAtPeriodEnd).toBe(true);
    expect(effectivePlan(scheduled, at("2026-10-20T00:00:00Z"))).toBe("pro");
    expect(effectivePlan(scheduled, at("2026-11-02T00:00:00Z"))).toBe("free");
    const ended = applyBillingEvent(scheduled, event({ type: "subscription.canceled", occurredAt: at("2026-11-01T00:00:00Z") }));
    expect(effectivePlan(ended)).toBe("free");
    expect(entitlementsFor(ended).aven).toBe(false);
  });

  it("ignores plan events without a plan", () => {
    expect(applyBillingEvent(FREE_STATE, event({ plan: undefined }))).toBe(FREE_STATE);
  });
});

describe("plan selection cookie", () => {
  it("reads only paid plans", () => {
    expect(selectedPlanFromCookies("a=1; acadence-plan=plus; b=2")).toBe("plus");
    expect(selectedPlanFromCookies("acadence-plan=free")).toBeUndefined();
    expect(selectedPlanFromCookies("acadence-plan=root")).toBeUndefined();
    expect(selectedPlanFromCookies("")).toBeUndefined();
  });
});

describe("entitlement enforcement", () => {
  afterEach(() => {
    delete process.env.BILLING_ENFORCEMENT;
  });

  it("does not restrict or query anything until billing is switched on", async () => {
    const { assertEntitlement, billingEnforced } = await import("@/lib/billing/entitlements");
    expect(billingEnforced()).toBe(false);
    await expect(assertEntitlement("user", "aven")).resolves.toBeUndefined();
  });
});

describe("marketing copy", () => {
  it("has a label for every comparison group, row and value", () => {
    const compare = en.marketing.compare as unknown as {
      groups: Record<string, string>;
      rows: Record<string, string>;
      values: Record<string, string>;
    };
    for (const group of COMPARISON) {
      expect(compare.groups[group.key]).toBeTypeOf("string");
      for (const row of group.rows) {
        expect(compare.rows[row.key]).toBeTypeOf("string");
        for (const value of Object.values(row.values))
          if (typeof value === "string") expect(compare.values[value]).toBeTypeOf("string");
      }
    }
  });

  it("never offers AI features on the Free plan card", () => {
    const free = en.marketing.pricing.plans.free.features.join(" ");
    expect(free).not.toMatch(/Aven|AI/);
    expect(en.marketing.pricing.plans.free.excluded).toContain("Aven AI");
  });
});
