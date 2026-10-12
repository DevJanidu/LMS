"use client";
import { useLocale, useTranslations } from "next-intl";
import {
  dailySeconds,
  shiftDay,
  weekStart,
  weeklyGoalPercent,
} from "@/lib/analytics";
import { getSessions } from "@/lib/workspace/queries";
import { duration } from "@/lib/time";
import type { Workspace } from "@/types";
import ProgressBar from "@/components/studyflow/ProgressBar";
import { CheckIcon } from "@/icons";
interface Props {
  data: Workspace;
  today: string;
  seconds: number;
}
/** This week's recorded time against the weekly target, with one mark per day. */
export default function WeeklyJourney({ data, today, seconds }: Props) {
  const t = useTranslations("studyflow");
  const locale = useLocale();
  const totals =
    data.analytics?.daily ??
    dailySeconds(getSessions(data), data.user.timezone);
  const start = weekStart(today, data.user.weekStartDay);
  const percent = weeklyGoalPercent(
    seconds / 60,
    data.user.weeklyTargetMinutes,
  );
  const weekday = (day: string, style: "narrow" | "long") =>
    new Intl.DateTimeFormat(locale, { weekday: style, timeZone: "UTC" }).format(
      new Date(`${day}T12:00:00Z`),
    );
  return (
    <section className="sf-week" aria-label={t("thisWeek")}>
      <div className="sf-stat-head">
        <p className="sf-stat-label">{t("thisWeek")}</p>
        <span className="sf-stat-figure">{percent}%</span>
      </div>
      <p className="sf-stat-value">{duration(seconds)}</p>
      <ProgressBar value={percent} label={t("weeklyGoal")} />
      <p className="sf-stat-note">
        {t("goalOf", {
          goal: duration(data.user.weeklyTargetMinutes * 60),
          percent,
        })}
      </p>
      <ol className="sf-week-days">
        {Array.from({ length: 7 }, (_, index) => {
          const day = shiftDay(start, index);
          const value = totals[day] ?? 0;
          const active = value >= data.settings.streakMinutes * 60;
          const summary = `${weekday(day, "long")}: ${value ? duration(value) : t("dashboard.noStudy")}`;
          return (
            <li
              key={day}
              className={`sf-week-day ${active ? "is-active" : ""} ${day === today ? "is-today" : ""}`}
              tabIndex={0}
              aria-label={summary}
              data-tooltip={summary}
            >
              <span aria-hidden="true">{weekday(day, "narrow")}</span>
              <span className="sf-week-mark" aria-hidden="true">
                {active ? <CheckIcon className="size-3.5" /> : day.slice(-2)}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
