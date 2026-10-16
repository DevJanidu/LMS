import { Suspense, type ReactNode } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { InfoIcon } from "@/icons";
import { formatPrice, planPrice, PLANS, type PlanId } from "@/lib/billing/plans";
import type { SubscriptionState } from "@/lib/billing/subscription";
import { billingUsage } from "@/lib/billing/usage";

interface Props {
  userId: string;
  plan: PlanId;
  state: SubscriptionState;
  enforced: boolean;
}

/** Compact strip: current plan, status, billing date, price, usage and the main actions. */
export default function BillingSummary({ userId, plan, state, enforced }: Props) {
  const t = useTranslations("billing");
  const p = useTranslations("marketing.pricing.plans");
  const format = useFormatter();
  const price = planPrice(plan);
  const periodEnd = state.currentPeriodEnd ? format.dateTime(state.currentPeriodEnd, { dateStyle: "medium" }) : null;
  const tone = plan === "free" ? "success" : state.status === "past_due" || state.status === "incomplete" ? "warning" : state.status === "canceled" ? "neutral" : "success";
  return (
    <section className="bl-summary" aria-labelledby="billing-current">
      <div className="bl-summary-plan">
        <div className="bl-summary-title">
          <h2 id="billing-current">{p(`${plan}.name`)}</h2>
          <span className="bl-pill" data-tone="brand">{t("currentBadge")}</span>
          <span className="bl-pill" data-tone={tone}>{plan === "free" ? t("status.active") : t(`status.${state.status}`)}</span>
        </div>
        <p className="bl-summary-meta">
          {plan === "free" ? t("freeForever") : periodEnd ? t(state.cancelAtPeriodEnd ? "endsShort" : "renewsShort", { date: periodEnd }) : t(`status.${state.status}`)}
          {price && plan !== "free" && <> · <span className="tabular-nums">{formatPrice(price)}</span> {t("perMonth")}</>}
        </p>
      </div>
      <div className="bl-summary-usage">
        <Suspense fallback={<UsageSkeleton />}>
          <Usage userId={userId} plan={plan} />
        </Suspense>
      </div>
      <div className="bl-summary-actions">
        {!enforced && (
          <span className="bl-early" tabIndex={0} title={t("earlyAccess")}>
            <InfoIcon aria-hidden="true" />{t("earlyAccessShort")}
            <span className="sr-only">. {t("earlyAccess")}</span>
          </span>
        )}
        {plan !== "plus" && <a href={`#billing-plan-${plan === "free" ? "pro" : "plus"}`} className="sf-set-button" data-variant="primary">{t("upgrade")}</a>}
        {plan !== "free" && (
          <button type="button" className="sf-set-button" data-variant="secondary" disabled title={t("manageBillingSoon")}>{t("manageBilling")}</button>
        )}
      </div>
      {state.status === "past_due" && <p className="bl-summary-alert" role="alert">{t("pastDue")}</p>}
    </section>
  );
}

async function Usage({ userId, plan }: { userId: string; plan: PlanId }) {
  const t = await getTranslations("billing");
  let usage: Awaited<ReturnType<typeof billingUsage>>;
  try { usage = await billingUsage(userId); }
  catch { return <p className="bl-meter-note">{t("usageUnavailable")}</p>; }
  const budget = PLANS[plan].entitlements.aiMonthlyBudgetUsd;
  const usedMB = usage.storageBytes / 1_048_576;
  return (
    <>
      {budget > 0
        ? <Meter label={t("aiUsage")} value={t("aiUsageValue", { percent: Math.min(100, Math.round((usage.aiUsedUsd / budget) * 100)) })} percent={(usage.aiUsedUsd / budget) * 100} />
        : <Meter label={t("aiUsage")} value={t("aiNotIncluded")} />}
      <Meter label={t("storage")} value={t("storageValue", { used: usedMB.toFixed(1), limit: usage.storageLimitMB })} percent={(usedMB / usage.storageLimitMB) * 100} />
    </>
  );
}

function Meter({ label, value, percent }: { label: string; value: ReactNode; percent?: number }) {
  const width = percent === undefined ? undefined : Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div className="bl-meter">
      <p className="bl-meter-head"><span>{label}</span><span className="tabular-nums">{value}</span></p>
      {width !== undefined && (
        <span className="bl-meter-track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={width} data-high={width >= 90 || undefined}>
          <span style={{ inlineSize: `${width}%` }} />
        </span>
      )}
    </div>
  );
}

function UsageSkeleton() {
  return (
    <>
      {[0, 1].map(key => (
        <div key={key} className="bl-meter" aria-hidden="true">
          <span className="sf-set-skeleton" />
          <span className="sf-set-skeleton" data-thin />
        </div>
      ))}
    </>
  );
}
