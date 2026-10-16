import { cookies } from "next/headers";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireOnboardedLearner } from "@/lib/auth";
import { getBillingOverview } from "@/lib/billing/entitlements";
import { getBillingProvider } from "@/lib/billing/provider";
import { PLAN_IDS, PLANS } from "@/lib/billing/plans";
import { paidPlan, SELECTED_PLAN_COOKIE } from "@/lib/billing/selection";
import CheckoutButton from "@/components/billing/CheckoutButton";
import BillingSummary from "@/components/billing/BillingSummary";
import BillingPlanCard from "@/components/billing/BillingPlanCard";
import BillingPlans from "@/components/billing/BillingPlans";
import BillingCompareTable from "@/components/billing/BillingCompareTable";
import { InfoIcon, LockIcon } from "@/icons";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ plan?: string; checkout?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireOnboardedLearner();
  const query = await searchParams;
  const t = await getTranslations("billing");
  const p = await getTranslations("marketing.pricing.plans");
  const [{ state, plan, enforced }, jar] = await Promise.all([getBillingOverview(user.id), cookies()]);
  const selected = paidPlan(query.plan) ?? paidPlan(jar.get(SELECTED_PLAN_COOKIE)?.value);
  const checkoutAvailable = getBillingProvider() !== null;
  // At most one short notice keeps the page within a laptop viewport.
  const notice = query.checkout === "processing" ? t("processing")
    : selected && selected !== plan ? t("selected", { plan: p(`${selected}.name`) })
    : !checkoutAvailable ? t("checkoutPending") : null;
  return (
    <div className="bl-page">
      <header className="bl-head">
        <div className="min-w-0">
          <h1 className="bl-title">{t("title")}</h1>
          <p className="bl-subtitle">{t("description")}</p>
        </div>
        {notice && <p className="bl-notice" role="status"><InfoIcon aria-hidden="true" /><span>{notice}</span></p>}
      </header>
      <BillingSummary userId={user.id} plan={plan} state={state} enforced={enforced} />
      <BillingPlans comparison={<BillingCompareTable current={plan} />}>
        {PLAN_IDS.map((id) => (
          <BillingPlanCard
            key={id}
            plan={id}
            current={plan === id}
            selected={selected === id}
            action={
              id === plan ? (
                <button type="button" className="sf-set-button" data-variant="current" disabled>{t("currentPlanButton")}</button>
              ) : id === "free" ? (
                <p className="bl-card-note">{t("downgradeNote")}</p>
              ) : checkoutAvailable ? (
                <CheckoutButton plan={id} primary={selected ? selected === id : PLANS[id].recommended} />
              ) : (
                <button type="button" className="sf-set-button" data-variant={PLANS[id].recommended ? "primary" : "secondary"} disabled>{t("comingSoon")}</button>
              )
            }
          />
        ))}
      </BillingPlans>
      <p className="bl-foot"><LockIcon aria-hidden="true" /><span>{t("receiptsBody")}</span></p>
    </div>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "billing" });
  return { title: t("title") };
}
