"use client";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { UiComponentData } from "@/lib/aven/ui-components";
import ActionCard, { CardFact } from "./ActionCard";
type Analytics = UiComponentData<"study_analytics">;
export default function StudyAnalyticsCard({ data }: { data: Analytics }) {
  const t = useTranslations("aven.cards");
  const duration = (total: number) =>
    total >= 60
      ? t("durationHours", { hours: Math.floor(total / 60), minutes: total % 60 })
      : t("durationMinutes", { minutes: total });
  const change = data.previous ? data.minutes - data.previous.minutes : null;
  return (
    <ActionCard
      eyebrow={t("studyAnalytics")}
      title={t("lastDays", { days: data.periodDays })}
      footer={
        <Link href="/analytics" className="aven-text-button">
          {t("studyAnalytics")}
        </Link>
      }
    >
      <dl className="aven-facts">
        <CardFact label={t("studied")}>{duration(data.minutes)}</CardFact>
        <CardFact label={t("sessionsLogged")}>{data.sessions}</CardFact>
        {data.previous && (
          <CardFact label={t("previousPeriod")}>
            {duration(data.previous.minutes)}
          </CardFact>
        )}
        {change !== null && (
          <CardFact label={t("change")}>
            <span data-tone={change >= 0 ? "up" : "down"} className="aven-delta">
              {change >= 0 ? "+" : "−"}
              {duration(Math.abs(change))}
            </span>
          </CardFact>
        )}
      </dl>
      {!data.previous && <p className="aven-card-note">{t("noComparison")}</p>}
    </ActionCard>
  );
}
