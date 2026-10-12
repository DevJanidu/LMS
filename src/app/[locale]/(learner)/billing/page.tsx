import { cookies } from "next/headers";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireLearner } from "@/lib/auth";
import { getBillingOverview } from "@/lib/billing/entitlements";
import { getBillingProvider } from "@/lib/billing/provider";
import { PLAN_IDS, PLANS } from "@/lib/billing/plans";
import { paidPlan, SELECTED_PLAN_COOKIE } from "@/lib/billing/selection";
import PageHeader from "@/components/studyflow/PageHeader";
import PricingCard from "@/components/marketing/PricingCard";
import PlanComparison from "@/components/marketing/PlanComparison";
import CheckoutButton from "@/components/billing/CheckoutButton";
import CurrentPlan from "@/components/billing/CurrentPlan";
import { InfoIcon } from "@/icons";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ plan?: string; checkout?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireLearner();
  const query = await searchParams;
  const t = await getTranslations("billing");
  const p = await getTranslations("marketing.pricing.plans");
  const [{ state, plan, enforced }, jar] = await Promise.all([getBillingOverview(user.id), cookies()]);
  const selected = paidPlan(query.plan) ?? paidPlan(jar.get(SELECTED_PLAN_COOKIE)?.value);
  const checkoutAvailable = getBillingProvider() !== null;
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="grid gap-6">
        {query.checkout === "processing" && (
          <p className="mk-notice-bar" role="status"><InfoIcon aria-hidden="true" /><span>{t("processing")}</span></p>
        )}
        {selected && selected !== plan && (
          <p className="mk-notice-bar"><InfoIcon aria-hidden="true" /><span>{t("selected", { plan: p(`${selected}.name`) })}</span></p>
        )}
        {!checkoutAvailable && (
          <p className="mk-notice-bar"><InfoIcon aria-hidden="true" /><span>{t("checkoutPending")}</span></p>
        )}
        <CurrentPlan plan={plan} state={state} enforced={enforced} />
        <div className="mk-pricing mt-4">
          {PLAN_IDS.map((id) => (
            <PricingCard
              key={id}
              plan={id}
              selected={selected === id}
              current={plan === id}
              action={
                id === plan ? (
                  <span className="mk-btn mk-btn-secondary pointer-events-none opacity-70" aria-disabled="true">{t("currentPlanButton")}</span>
                ) : id === "free" ? (
                  <p className="text-center text-small mk-muted">{t("downgradeNote")}</p>
                ) : checkoutAvailable ? (
                  <CheckoutButton plan={id} primary={selected ? selected === id : PLANS[id].recommended} />
                ) : (
                  <span className="mk-btn mk-btn-secondary pointer-events-none opacity-70" aria-disabled="true">{t("comingSoon")}</span>
                )
              }
            />
          ))}
        </div>
        <PlanComparison />
        <section className="mk-card p-5" aria-labelledby="billing-receipts">
          <h2 id="billing-receipts" className="text-h2">{t("receiptsTitle")}</h2>
          <p className="mt-2 text-body mk-secondary">{t("receiptsBody")}</p>
        </section>
      </div>
    </>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "billing" });
  return { title: t("title") };
}
