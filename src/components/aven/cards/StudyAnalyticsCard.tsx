"use client";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { UiComponentData } from "@/lib/aven/ui-components";
import ActionCard, { CardFact } from "./ActionCard";
type Analytics = UiComponentData<"study_analytics">;
/** Verified minutes per day as bars; values come from server-side aggregation only. */
function DailyBars({
  daily,
  label,
  format,
}: {
  daily: { date: string; minutes: number }[];
  label: string;
  format: (minutes: number) => string;
}) {
  const peak = Math.max(1, ...daily.map((day) => day.minutes));
  const weekday = (date: string) =>
    new Intl.DateTimeFormat("en", { weekday: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
  return (
    <figure className="aven-bars" aria-label={label}>
      <ol>
        {daily.map((day) => (
          <li key={day.date} title={`${day.date}: ${format(day.minutes)}`}>
            <span className="aven-bar-track">
              <span className="aven-bar" style={{ blockSize: `${Math.round((day.minutes / peak) * 100)}%` }} />
            </span>
            <span className="aven-bar-label" aria-hidden="true">
              {weekday(day.date)}
            </span>
            <span className="sr-only">{`${weekday(day.date)} ${day.date}: ${format(day.minutes)}`}</span>
          </li>
        ))}
      </ol>
    </figure>
  );
}
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
      {data.daily && data.daily.length > 1 && (
        <DailyBars daily={data.daily} label={t("dailyChart")} format={duration} />
      )}
      {!data.previous && <p className="aven-card-note">{t("noComparison")}</p>}
    </ActionCard>
  );
}
