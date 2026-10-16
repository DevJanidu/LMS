"use client";
import { useTranslations } from "next-intl";
import { InfoIcon } from "@/icons";
import { COMPETITION_TIMEZONE, DAILY_CREDIT_CAP_SECONDS, HEARTBEAT_GRACE_SECONDS, SESSION_CREDIT_CAP_SECONDS } from "@/lib/circles/policy";

/** The published scoring rules, from the same constants the server uses. */
export default function ScoringRules() {
  const t = useTranslations("circles.rules");
  return (
    <details className="sc-rules">
      <summary><InfoIcon aria-hidden="true" />{t("title")}</summary>
      <ul>
        <li>{t("verified")}</li>
        <li>{t("manual")}</li>
        <li>{t("heartbeat", { seconds: HEARTBEAT_GRACE_SECONDS })}</li>
        <li>{t("caps", { session: SESSION_CREDIT_CAP_SECONDS / 3600, day: DAILY_CREDIT_CAP_SECONDS / 3600 })}</li>
        <li>{t("week", { timezone: COMPETITION_TIMEZONE })}</li>
        <li>{t("ties")}</li>
        <li>{t("finalize")}</li>
      </ul>
    </details>
  );
}
