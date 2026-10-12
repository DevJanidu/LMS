import { getBillingProvider } from "@/lib/billing/provider";
import { recordBillingEvent } from "@/lib/billing/entitlements";

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Provider → Acadence subscription updates. Entitlements change only here,
 * after signature verification — never from a client-side success redirect.
 */
export async function POST(request: Request) {
  const provider = getBillingProvider();
  if (!provider) return json({ ok: false, error: "billingNotConfigured" }, 503);
  const rawBody = await request.text();
  let event;
  try {
    event = await provider.verifyWebhook(rawBody, request.headers);
  } catch {
    return json({ ok: false, error: "invalidSignature" }, 400);
  }
  if (!event) return json({ ok: true, ignored: true });
  const result = await recordBillingEvent(event, JSON.parse(rawBody) as Record<string, unknown>);
  return json({ ok: true, applied: result.applied });
}
