import "server-only";
import type { BillingInterval, PlanId } from "./plans";
import type { BillingEvent } from "./subscription";

/**
 * Integration boundary for a hosted-checkout payment provider (e.g. PayHere,
 * Paddle, Stripe). Card details are never collected by Acadence: checkout and
 * the billing portal are always provider-hosted pages.
 */
export interface BillingProvider {
  id: string;
  createCheckout(input: {
    userId: string;
    email: string;
    plan: Exclude<PlanId, "free">;
    interval: BillingInterval;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ url: string }>;
  /** Hosted page for receipts, payment methods and cancellation, when supported. */
  createPortalSession?(input: { userId: string; providerCustomerId: string; returnUrl: string }): Promise<{ url: string }>;
  /**
   * Verify the webhook signature against the raw body and translate it into a
   * provider-neutral event. Must throw for unsigned or tampered requests.
   * Returns null for verified events that do not affect entitlements.
   */
  verifyWebhook(rawBody: string, headers: Headers): Promise<BillingEvent | null>;
}

/**
 * No provider is configured yet. Register an adapter here once credentials
 * exist; until then checkout is unavailable and no payment is ever simulated.
 */
export function getBillingProvider(): BillingProvider | null {
  return null;
}
