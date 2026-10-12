import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { CheckIcon, CloseIcon } from "@/icons";
import { formatPrice, planPrice, PLANS, type PlanId } from "@/lib/billing/plans";

interface Props {
  plan: PlanId;
  selected?: boolean;
  current?: boolean;
  action: ReactNode;
}

export default function PricingCard({ plan, selected = false, current = false, action }: Props) {
  const t = useTranslations("marketing.pricing");
  const price = planPrice(plan);
  const included = t.raw(`plans.${plan}.features`) as string[];
  const excluded = t.raw(`plans.${plan}.excluded`) as string[];
  return (
    <article className="mk-plan" data-recommended={PLANS[plan].recommended} data-selected={selected} aria-labelledby={`mk-plan-${plan}`}>
      {PLANS[plan].recommended && <span className="mk-plan-badge">{t("recommended")}</span>}
      <div className="flex items-center justify-between gap-3">
        <h3 id={`mk-plan-${plan}`} className="text-h2">{t(`plans.${plan}.name`)}</h3>
        {current && <span className="mk-chip mk-chip-success">{t("currentPlan")}</span>}
      </div>
      <p className="mt-2 min-h-11 text-small mk-secondary">{t(`plans.${plan}.positioning`)}</p>
      <p className="mt-6 flex items-baseline gap-1.5">
        <span className="mk-price">{price ? formatPrice(price) : "—"}</span>
        <span className="text-small mk-muted">{t("perMonth")}</span>
      </p>
      <p className="mt-1 text-caption mk-muted">{t(`plans.${plan}.billingNote`)}</p>
      <div className="mt-6 grid">{action}</div>
      <div className="mt-7 border-t mk-hairline pt-6">
        {plan !== "free" && <p className="mb-3 text-small font-medium">{t(`plans.${plan}.includesPrevious`)}</p>}
        <ul className="mk-plan-features">
          {included.map((feature) => (
            <li key={feature} data-included="true"><CheckIcon aria-hidden="true" /><span>{feature}</span></li>
          ))}
          {excluded.map((feature) => (
            <li key={feature} data-included="false">
              <CloseIcon aria-hidden="true" />
              <span><span className="sr-only">{t("notIncluded")} </span>{feature}</span>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}
