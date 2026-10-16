"use server";
import { z } from "zod";
import { requireOnboardedLearner } from "@/lib/auth";
import { getBillingProvider } from "@/lib/billing/provider";
import { getAccountEnv } from "@/lib/env";

const checkoutSchema = z.object({ plan: z.enum(["pro", "plus"]) });

/**
 * Start a provider-hosted checkout. Returning a URL does not grant access:
 * the plan activates only when the provider's signed webhook confirms payment.
 */
export async function startCheckout(input: unknown): Promise<{ status: "redirect"; url: string } | { status: "unavailable" } | { status: "invalid" }> {
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid" };
  const user = await requireOnboardedLearner();
  const provider = getBillingProvider();
  if (!provider) return { status: "unavailable" };
  const base = getAccountEnv().APP_URL;
  const { url } = await provider.createCheckout({
    userId: user.id,
    email: user.email,
    plan: parsed.data.plan,
    interval: "month",
    successUrl: `${base}/billing?checkout=processing`,
    cancelUrl: `${base}/billing?plan=${parsed.data.plan}`,
  });
  return { status: "redirect", url };
}
