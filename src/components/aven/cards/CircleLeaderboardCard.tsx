"use client";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { UiComponentData } from "@/lib/aven/ui-components";
import ActionCard, { CardFact } from "./ActionCard";
type Leaderboard = UiComponentData<"circle_leaderboard">;
export default function CircleLeaderboardCard({ data }: { data: Leaderboard }) {
  const t = useTranslations("aven.cards");
  const duration = (total: number) =>
    total >= 60
      ? t("durationHours", { hours: Math.floor(total / 60), minutes: total % 60 })
      : t("durationMinutes", { minutes: total });
  const ends = new Intl.DateTimeFormat("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(data.weekEndsAt));
  return (
    <ActionCard
      eyebrow={t("leaderboard")}
      title={t("weekEnds", { date: ends })}
      footer={
        <Link href="/circles" className="aven-text-button">
          {t("openCircles")}
        </Link>
      }
    >
      <dl className="aven-facts">
        {data.me.rank !== null && (
          <CardFact label={t("yourRank")}>
            {t("rankShort", { rank: data.me.rank })}
          </CardFact>
        )}
        <CardFact label={t("verifiedThisWeek")}>{duration(data.me.minutes)}</CardFact>
        {data.me.minutesBehindNext !== null && data.me.minutesBehindNext > 0 && (
          <CardFact label={t("behindNext")}>
            {duration(data.me.minutesBehindNext)}
          </CardFact>
        )}
      </dl>
      <ol className="aven-card-list">
        {data.rows.map((row) => (
          <li key={`${row.rank}:${row.name}`} data-me={row.me || undefined}>
            <span className="aven-rank">
              <span className="aven-rank-number">{row.rank}</span>
              <span>{row.name}</span>
            </span>
            <span className="aven-card-meta">{duration(row.minutes)}</span>
          </li>
        ))}
      </ol>
      <p className="aven-card-note">{t("verifiedOnly")}</p>
    </ActionCard>
  );
}
