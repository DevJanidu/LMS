import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { CheckIcon, CloseIcon } from "@/icons";
import { formatPrice, planPrice, PLANS, type PlanId } from "@/lib/billing/plans";

interface Props {
  plan: PlanId;
  current: boolean;
  selected: boolean;
  action: ReactNode;
}

/** Compact plan card; the feature list folds away while the comparison table is open. */
export default function BillingPlanCard({ plan, current, selected, action }: Props) {
  const t = useTranslations("marketing.pricing");
  const b = useTranslations("billing");
  const price = planPrice(plan);
  const included = t.raw(`plans.${plan}.features`) as string[];
  const excluded = t.raw(`plans.${plan}.excluded`) as string[];
  const recommended = PLANS[plan].recommended;
  return (
    <article id={`billing-plan-${plan}`} className="bl-card" data-recommended={recommended || undefined} data-current={current || undefined} data-selected={selected || undefined} aria-labelledby={`billing-plan-${plan}-name`}>
      {recommended && <span className="bl-ribbon">{b("popular")}</span>}
      <header className="bl-card-head">
        <h3 id={`billing-plan-${plan}-name`} className="bl-card-name">
          {t(`plans.${plan}.name`)}
          {current && <span className="bl-pill" data-tone="brand">{b("currentBadge")}</span>}
        </h3>
        <p className="bl-card-tagline">{t(`plans.${plan}.positioning`)}</p>
        <p className="bl-card-price">
          <span className="tabular-nums">{price ? formatPrice(price) : "—"}</span>
          <span className="bl-card-period">{t("perMonth")}</span>
        </p>
      </header>
      <div className="bl-card-action">{action}</div>
      <div className="bl-card-features">
        <div>
          {plan !== "free" && <p className="bl-card-includes">{t(`plans.${plan}.includesPrevious`)}</p>}
          <ul>
            {included.map(feature => <li key={feature}><CheckIcon aria-hidden="true" /><span>{feature}</span></li>)}
            {excluded.map(feature => (
              <li key={feature} data-excluded>
                <CloseIcon aria-hidden="true" />
                <span><span className="sr-only">{t("notIncluded")} </span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </article>
  );
}
