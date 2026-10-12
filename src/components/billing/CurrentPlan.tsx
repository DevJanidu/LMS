import { useFormatter, useTranslations } from "next-intl";
import type { PlanId } from "@/lib/billing/plans";
import type { SubscriptionState } from "@/lib/billing/subscription";

interface Props {
  plan: PlanId;
  state: SubscriptionState;
  enforced: boolean;
}

export default function CurrentPlan({ plan, state, enforced }: Props) {
  const t = useTranslations("billing");
  const p = useTranslations("marketing.pricing.plans");
  const format = useFormatter();
  const periodEnd = state.currentPeriodEnd ? format.dateTime(state.currentPeriodEnd, { dateStyle: "long" }) : null;
  return (
    <section className="mk-card p-5" aria-labelledby="billing-current">
      <p className="text-overline">{t("currentTitle")}</p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h2 id="billing-current" className="text-h1">{p(`${plan}.name`)}</h2>
        <span className={`mk-chip ${state.status === "past_due" ? "mk-chip-warning" : "mk-chip-success"}`}>{t(`status.${state.status}`)}</span>
      </div>
      {plan !== "free" && periodEnd && (
        <p className="mt-2 text-body mk-secondary">
          {state.cancelAtPeriodEnd ? t("endsOn", { date: periodEnd }) : t("renewsOn", { date: periodEnd })}
        </p>
      )}
      {state.status === "past_due" && <p className="mt-2 text-body text-warning-700 dark:text-warning-300">{t("pastDue")}</p>}
      {!enforced && <p className="mt-3 text-small mk-muted">{t("earlyAccess")}</p>}
    </section>
  );
}
