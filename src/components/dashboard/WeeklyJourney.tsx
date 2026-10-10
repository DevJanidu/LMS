"use client";
import { useLocale, useTranslations } from "next-intl";
import { dailySeconds, shiftDay, weekStart, weeklyGoalPercent } from "@/lib/analytics";
import { getSessions } from "@/lib/workspace/queries";
import { duration } from "@/lib/time";
import type { Workspace } from "@/types";
import ProgressBar from "@/components/studyflow/ProgressBar";
import { CheckIcon } from "@/icons";
interface Props { data: Workspace; today: string; seconds: number }
export default function WeeklyJourney({data, today, seconds}: Props) {
  const t = useTranslations("studyflow");
  const locale = useLocale();
  const totals = data.analytics?.daily ?? dailySeconds(getSessions(data), data.user.timezone);
  const start = weekStart(today, data.user.weekStartDay);
  const percent = weeklyGoalPercent(seconds / 60, data.user.weeklyTargetMinutes);
  const minutes = new Intl.NumberFormat(locale, { style: "unit", unit: "minute", unitDisplay: "narrow" });
  return <section className="sf-week"><p className="sf-eyebrow">{t("thisWeek")}</p><div className="sf-week-days">{Array.from({length: 7}, (_, index) => {
    const day = shiftDay(start, index);
    const value = totals[day] ?? 0;
    const active = value >= data.settings.streakMinutes * 60;
    return <div key={day} className={`sf-week-day ${active ? "is-active" : ""} ${day === today ? "is-today" : ""}`} aria-label={`${day}: ${duration(value)}`}><span>{new Intl.DateTimeFormat(locale, {weekday:"narrow",timeZone:"UTC"}).format(new Date(`${day}T12:00:00Z`))}</span><span className="sf-week-mark" aria-hidden="true">{active ? <CheckIcon className="size-4" /> : day.slice(-2)}</span><span>{value ? value < 3600 ? minutes.format(Math.floor(value / 60)) : duration(value) : "—"}</span></div>;
  })}</div><div className="mb-3 flex items-baseline justify-between gap-2"><strong className="text-stat">{duration(seconds)}</strong><span className="text-caption tabular-nums text-muted">{percent}%</span></div><ProgressBar value={percent} label={t("weeklyGoal")} /><p className="mt-3 text-caption text-muted">{t("goalOf", {goal: duration(data.user.weeklyTargetMinutes * 60), percent})}</p></section>;
}
