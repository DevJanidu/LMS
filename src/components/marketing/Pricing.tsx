import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { PLAN_IDS, PLANS, type PlanId } from "@/lib/billing/plans";
import { InfoIcon } from "@/icons";
import SectionHeading from "./SectionHeading";
import PricingCard from "./PricingCard";
import PlanComparison from "./PlanComparison";

interface Props {
  checkoutAvailable: boolean;
  selected?: PlanId;
  currentPlan?: PlanId;
  /** Billing page supplies checkout buttons; the marketing site links into signup. */
  renderAction?: (plan: PlanId) => ReactNode;
}

const href = (plan: PlanId) => (plan === "free" ? "/register" : `/billing?plan=${plan}`);

export default function Pricing({ checkoutAvailable, selected, currentPlan, renderAction }: Props) {
  const t = useTranslations("marketing.pricing");
  return (
    <section id="pricing" className="mk-section" aria-labelledby="mk-pricing-title">
      <div className="mk-container">
        <SectionHeading id="mk-pricing-title" center eyebrow={t("eyebrow")} title={t("title")} description={t("description")} />
        {/* Only monthly prices exist (see AVAILABLE_INTERVALS); add an interval toggle here once a yearly price is configured. */}
        <div className="mk-pricing mt-14">
          {PLAN_IDS.map((plan) => (
            <PricingCard
              key={plan}
              plan={plan}
              selected={selected === plan}
              current={currentPlan === plan}
              action={
                renderAction?.(plan) ?? (
                  <Link href={href(plan)} className={`mk-btn ${PLANS[plan].recommended ? "mk-btn-primary" : "mk-btn-secondary"}`}>
                    {t(`plans.${plan}.cta`)}
                  </Link>
                )
              }
            />
          ))}
        </div>
        <div className="mx-auto mt-8 grid max-w-3xl gap-2 text-center text-small mk-muted">
          <p>{t("currencyNote")}</p>
          {!checkoutAvailable && (
            <p className="mk-notice-bar justify-center text-start">
              <InfoIcon aria-hidden="true" />
              <span>{t("checkoutPending")}</span>
            </p>
          )}
          {checkoutAvailable && <p>{t("secureNote")}</p>}
        </div>
        <div className="mx-auto mt-14 max-w-5xl">
          <PlanComparison />
        </div>
      </div>
    </section>
  );
}
