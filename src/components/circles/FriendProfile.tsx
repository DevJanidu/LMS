"use client";
import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { compactDuration } from "@/lib/time";
import { ArrowRightIcon, LockIcon } from "@/icons";
import AnalyticsCard from "@/components/analytics/AnalyticsCard";
import PersonAvatar from "./PersonAvatar";
import WeekPicker from "./WeekPicker";
import { useCircles } from "./useCircles";
import { PanelError, PanelSkeleton } from "./PanelState";

interface FriendWeek { person: { name: string; image: string | null } | null; week: string; shareSubjects: boolean; totalSeconds: number; days: { day: string; seconds: number; subjects: { name: string; seconds: number }[] }[] }

/** A friend's verified study, limited to what their privacy settings share. */
export default function FriendProfile({ friendId, currentWeek }: { friendId: string; currentWeek: string }) {
  const t = useTranslations("circles.profile");
  const format = useFormatter();
  const [week, setWeek] = useState(currentWeek);
  const data = useCircles<FriendWeek>({ view: "friendHistory", id: friendId, week });
  const crumbs = (
    <nav aria-label={t("breadcrumb")}>
      <ol className="an-breadcrumb">
        <li><Link href="/circles?tab=friends">{t("back")}</Link></li>
        <li aria-hidden="true"><ArrowRightIcon className="rtl:rotate-180" /></li>
        <li aria-current="page">{data.data?.person?.name ?? t("title")}</li>
      </ol>
    </nav>
  );
  if (data.loading && !data.data) return <div className="sc-page">{crumbs}<PanelSkeleton rows={5} /></div>;
  if (data.error === "recordUnavailable") {
    return (
      <div className="sc-page">
        {crumbs}
        <div className="sc-empty-state"><LockIcon aria-hidden="true" /><p className="sc-empty-title">{t("privateTitle")}</p><p className="sc-empty">{t("privateBody")}</p></div>
      </div>
    );
  }
  if (data.error || !data.data) return <div className="sc-page">{crumbs}<PanelError code={data.error} onRetry={data.reload} /></div>;
  const value = data.data;
  const best = Math.max(1, ...value.days.map(day => day.seconds));
  return (
    <div className="sc-page">
      {crumbs}
      <header className="sc-group-header">
        <PersonAvatar name={value.person?.name ?? ""} image={value.person?.image} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="an-title">{value.person?.name}</h1>
          <p className="an-subtitle">{t("subtitle")}</p>
        </div>
      </header>
      <AnalyticsCard id="circles-friend-week" title={t("weekTitle")} description={value.shareSubjects ? t("withSubjects") : t("withoutSubjects")} action={<WeekPicker week={week} current={currentWeek} onChange={setWeek} />}>
        <p className="sc-total"><span>{t("total")}</span><strong className="tabular-nums">{compactDuration(value.totalSeconds)}</strong></p>
        {value.days.length ? (
          <ul className="sc-list">
            {value.days.map(day => (
              <li key={day.day} className="sc-day">
                <span className="sc-person-name">{format.dateTime(new Date(`${day.day}T12:00:00Z`), { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" })}</span>
                <span className="sc-bar" aria-hidden="true"><span style={{ inlineSize: `${Math.round((day.seconds / best) * 100)}%` }} /></span>
                <span className="tabular-nums">{compactDuration(day.seconds)}</span>
                {day.subjects.length > 0 && <span className="sc-muted sc-day-subjects">{day.subjects.map(subject => `${subject.name} ${compactDuration(subject.seconds)}`).join(" · ")}</span>}
              </li>
            ))}
          </ul>
        ) : <p className="sc-empty">{t("noStudy")}</p>}
      </AnalyticsCard>
    </div>
  );
}
