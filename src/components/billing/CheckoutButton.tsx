"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { startCheckout } from "@/app/[locale]/billing-actions";
import { runServerAction } from "@/lib/client/server-actions";
import type { PlanId } from "@/lib/billing/plans";

interface Props {
  plan: Exclude<PlanId, "free">;
  primary?: boolean;
}

/** Sends the learner to the provider-hosted checkout; access changes only via webhook. */
export default function CheckoutButton({ plan, primary = false }: Props) {
  const t = useTranslations("billing");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const start = async () => {
    setPending(true);
    setError("");
    try {
      const result = await runServerAction(() => startCheckout({ plan }));
      if (result.status === "redirect") {
        window.location.assign(result.url);
        return;
      }
      setError(t(result.status === "unavailable" ? "checkoutUnavailable" : "checkoutFailed"));
    } catch {
      setError(t("checkoutFailed"));
    }
    setPending(false);
  };
  return (
    <div className="grid gap-1.5">
      <button type="button" className="sf-set-button" data-variant={primary ? "primary" : "secondary"} onClick={start} disabled={pending} aria-busy={pending}>
        {pending ? t("redirecting") : t(`choose.${plan}`)}
      </button>
      {error && <p role="alert" className="bl-card-note" data-tone="error">{error}</p>}
    </div>
  );
}
