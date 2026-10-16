"use client";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { CreditCardIcon, LockIcon } from "@/icons";
import type { SettingsOverview } from "@/lib/services/settings-overview";
import SettingsCard from "./SettingsCard";

interface Props {
  plan: SettingsOverview["plan"];
  usage: SettingsOverview["usage"];
  storageLimitMB: number;
}

const megabytes = (bytes: number) => bytes / 1_048_576;

export default function PlanSection({ plan, usage, storageLimitMB }: Props) {
  const t = useTranslations("settings");
  const names = useTranslations("marketing.pricing.plans");
  return (
    <SettingsCard id="settings-plan" icon={<CreditCardIcon />} title={t("plan.title")} description={t("plan.description")}>
      {!plan ? (
        <p role="alert" className="sf-set-inline-error">{t("plan.unavailable")}</p>
      ) : (
        <div className="sf-set-plan">
          <div className="sf-set-plan-head">
            <div className="min-w-0">
              <span className="sf-set-plan-badge">{names(`${plan.id}.name`)}</span>
              <p className="sf-set-help">
                {plan.id === "free" ? t("plan.freeForever")
                  : plan.renewsAt ? t(plan.cancelAtPeriodEnd ? "plan.endsOn" : "plan.renewsOn", { date: new Date(plan.renewsAt) })
                  : t(`plan.status.${plan.status}`)}
              </p>
            </div>
            <div className="sf-set-actions">
              {plan.id === "free"
                ? <Link href="/billing" className="sf-set-button" data-variant="primary">{t("plan.upgrade")}</Link>
                : <Link href="/billing" className="sf-set-button" data-variant="secondary">{t("plan.manage")}</Link>}
            </div>
          </div>
          {usage ? (
            <dl className="sf-set-meters">
              <Meter label={t("plan.storage")} value={megabytes(usage.storageBytes)} max={storageLimitMB}
                text={t("plan.storageValue", { used: megabytes(usage.storageBytes).toFixed(1), limit: storageLimitMB })} />
              {usage.aiBudgetUsd > 0
                ? <Meter label={t("plan.ai")} value={usage.aiUsedUsd} max={usage.aiBudgetUsd} text={t("plan.aiValue", { percent: Math.min(100, Math.round((usage.aiUsedUsd / usage.aiBudgetUsd) * 100)) })} />
                : <div className="sf-set-meter"><dt>{t("plan.ai")}</dt><dd className="sf-set-help">{t("plan.aiNotIncluded")}</dd></div>}
              <div className="sf-set-meter"><dt>{t("plan.subjects")}</dt><dd className="sf-set-meter-value tabular-nums">{t("plan.subjectsValue", { count: usage.subjects })}</dd></div>
            </dl>
          ) : <p role="alert" className="sf-set-inline-error">{t("plan.usageUnavailable")}</p>}
        </div>
      )}
      <div className="sf-set-row">
        <div className="sf-set-row-text">
          <p className="sf-set-label">{t("plan.payment")}</p>
          <p className="sf-set-help">{plan?.checkoutAvailable ? t("plan.paymentNone") : t("plan.paymentUnavailable")}</p>
        </div>
        <div className="sf-set-row-control">
          <Link href="/billing" className="sf-set-link">{t("plan.viewBilling")}</Link>
        </div>
      </div>
      <p className="sf-set-trust"><LockIcon aria-hidden="true" />{t("plan.trust")}</p>
    </SettingsCard>
  );
}

function Meter({ label, value, max, text }: { label: string; value: number; max: number; text: string }) {
  const percent = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="sf-set-meter">
      <dt>{label}</dt>
      <dd>
        <span className="sf-set-meter-value tabular-nums">{text}</span>
        <span className="sf-set-meter-track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} data-high={percent >= 90 || undefined}>
          <span style={{ inlineSize: `${percent}%` }} />
        </span>
      </dd>
    </div>
  );
}
