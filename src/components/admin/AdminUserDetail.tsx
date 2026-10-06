"use client";
import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useWorkspace, useNow } from "@/lib/workspace/store";
import { getLearnerStatistics } from "@/lib/workspace/queries";
import {
  dailySeconds,
  localDay,
  periodSeconds,
  shiftDay,
  streaks,
  totalSeconds,
  weekStart,
} from "@/lib/analytics";
import { formatDate, duration } from "@/lib/time";
import type { Workspace } from "@/types";
import PageHeader from "@/components/studyflow/PageHeader";
import StatTile from "@/components/studyflow/StatTile";
import EmptyState from "@/components/studyflow/EmptyState";
import ProgressBar from "@/components/studyflow/ProgressBar";
import { SelectField } from "@/components/studyflow/FormFields";
import ComponentCard from "@/components/common/ComponentCard";
import StudyChart from "@/components/analytics/StudyChart";
import UserStatusAction from "./UserStatusAction";
interface Props {
  initial: Workspace;
  id: string;
}
/** Statistics projection excludes resources, notes and session note text. */
export default function AdminUserDetail({ initial, id }: Props) {
  const data = useWorkspace(initial);
  const now = useNow();
  const t = useTranslations("studyflow");
  const locale = useLocale();
  const stats = getLearnerStatistics(data, id);
  const [period, setPeriod] = useState("day");
  if (!stats) return <EmptyState headingLevel={1} title={t("userMissing")} />;
  const { user, sessions, subjects, progress } = stats;
  const today = localDay(
    now || Date.parse(initial.user.lastActiveAt),
    user.timezone,
  );
  const totals = data.adminLearnerAnalytics?.daily ?? dailySeconds(sessions, user.timezone);
  const streak = data.adminLearnerAnalytics ? { current: data.adminLearnerAnalytics.currentStreak, longest: data.adminLearnerAnalytics.longestStreak } : streaks(
    sessions,
    user.timezone,
    now || Date.parse(initial.user.lastActiveAt),
    data.settings.streakMinutes,
    user.longestStreak,
  );
  const days = Array.from({ length: period === "day" ? 7 : 4 }, (_, index) =>
    period === "day"
      ? shiftDay(today, index - 6)
      : shiftDay(weekStart(today, user.weekStartDay), (index - 3) * 7),
  );
  return (
    <>
      <PageHeader
        title={user.name}
        description={`${user.email} · ${t(user.status)}`}
        action={<UserStatusAction data={data} user={user} />}
      />
      <p className="mb-6 rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm text-brand-700 dark:border-brand-800 dark:bg-brand-500/10 dark:text-brand-300">
        {t("redesign.privacyBoundary")}
      </p>
      <div className="sf-metric-strip mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label={t("studyTime")}
          value={duration(data.adminLearnerAnalytics?.totalSeconds ?? totalSeconds(sessions))}
        />
        <StatTile label={t("sessions")} value={data.adminLearnerAnalytics?.sessionCount ?? sessions.length} />
        <StatTile
          label={t("currentStreak")}
          value={t("streakDays", { days: streak.current })}
        />
        <StatTile
          label={t("longestStreak")}
          value={t("streakDays", { days: streak.longest })}
        />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <ComponentCard title={t("studyTime")}>
          <SelectField
            label={t("period")}
            value={period}
            onChange={(event) => setPeriod(event.target.value)}
          >
            <option value="day">{t("daily")}</option>
            <option value="week">{t("weekly")}</option>
          </SelectField>
          <StudyChart
            labels={days.map((day) => formatDate(day, user.timezone, locale))}
            values={days.map((day) =>
              Math.round(
                (period === "day"
                  ? (totals[day] ?? 0)
                  : data.adminLearnerAnalytics ? Object.entries(totals).filter(([date]) => date >= day && date <= shiftDay(day, 6)).reduce((sum, [, seconds]) => sum + seconds, 0) : periodSeconds(
                      sessions,
                      user.timezone,
                      day,
                      shiftDay(day, 6),
                    )) / 60,
              ),
            )}
            label={t("minutes")}
          />
        </ComponentCard>
        <ComponentCard title={t("subjectProgress")}>
          {subjects.length ? (
            subjects.map((subject, index) => (
              <div key={subject.id}>
                <div className="mb-2 flex justify-between gap-3 text-sm">
                  <span>{t("privateSubject", { number: index + 1 })}</span>
                  <span>
                    {progress[subject.id]}% ·{" "}
                    {t("sessionCount", {
                      count: data.subjectStatistics?.[subject.id]?.sessions ?? sessions.filter(
                        (session) => session.subjectId === subject.id,
                      ).length,
                    })}
                  </span>
                </div>
                <ProgressBar
                  value={progress[subject.id]}
                  label={t("privateSubject", { number: index + 1 })}
                  color={subject.color}
                />
              </div>
            ))
          ) : (
            <EmptyState title={t("noSubjects")} />
          )}
        </ComponentCard>
      </div>
    </>
  );
}
