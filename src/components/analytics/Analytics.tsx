"use client";
import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useWorkspace, useNow } from "@/lib/mock/store";
import { getSessions, getSubjects, getTopics } from "@/lib/mock";
import {
  dailySeconds,
  localDay,
  periodSeconds,
  shiftDay,
  streaks,
  totalSeconds,
  weekStart,
} from "@/lib/analytics";
import { duration, formatDate } from "@/lib/time";
import type { Workspace } from "@/types";
import ComponentCard from "@/components/common/ComponentCard";
import PageHeader from "@/components/studyflow/PageHeader";
import StatTile from "@/components/studyflow/StatTile";
import EmptyState from "@/components/studyflow/EmptyState";
import { SelectField } from "@/components/studyflow/FormFields";
import { primaryLink } from "@/components/studyflow/WorkspaceShell";
import StudyChart from "./StudyChart";
import HeatmapCalendar from "./HeatmapCalendar";
import StreakBadge from "./StreakBadge";
import LearningInsights from "./LearningInsights";
interface Props {
  initial: Workspace;
}
/** Simple time, streak and completion analytics derived from shared sessions. */
export default function Analytics({ initial }: Props) {
  const data = useWorkspace(initial);
  const t = useTranslations("studyflow");
  const locale = useLocale();
  const clock = useNow();
  const now = clock || Date.parse(initial.user.lastActiveAt);
  const today = localDay(now, data.user.timezone);
  const sessions = getSessions(data);
  const totals = dailySeconds(sessions, data.user.timezone);
  const streak = streaks(
    sessions,
    data.user.timezone,
    now,
    data.settings.streakMinutes,
    data.user.longestStreak,
  );
  const [period, setPeriod] = useState("week");
  const days = Array.from({ length: 7 }, (_, index) =>
    shiftDay(today, index - 6),
  );
  const subjects = getSubjects(data);
  const tiles = [
    ["today", duration(totals[today] ?? 0)],
    [
      "thisWeek",
      duration(
        periodSeconds(
          sessions,
          data.user.timezone,
          weekStart(today, data.user.weekStartDay),
          today,
        ),
      ),
    ],
    [
      "thisMonth",
      duration(
        periodSeconds(
          sessions,
          data.user.timezone,
          `${today.slice(0, 7)}-01`,
          today,
        ),
      ),
    ],
    ["currentStreak", t("streakDays", { days: streak.current })],
    ["longestStreak", t("streakDays", { days: streak.longest })],
    [
      "topicsThisMonth",
      String(
        getTopics(data).filter(
          (topic) =>
            topic.completedAt &&
            localDay(topic.completedAt, data.user.timezone).startsWith(
              today.slice(0, 7),
            ),
        ).length,
      ),
    ],
  ];
  return (
    <>
      <PageHeader
        title={t("analytics")}
        description={t("analyticsDescription")}
      />
      <div className="sf-metric-strip mb-8 grid sm:grid-cols-3 xl:grid-cols-6">
        {tiles.map(([key, value]) => (
          <StatTile key={key} label={t(key)} value={value} />
        ))}
      </div>
      <div className="mb-6">
        <StreakBadge
          days={streak.current}
          longest={streak.longest}
          minutes={data.settings.streakMinutes}
        />
        <span className="ms-3 text-theme-xs text-gray-500 dark:text-gray-400">
          {t("streakRule", { minutes: data.settings.streakMinutes })}
        </span>
      </div>
      {!sessions.length && (
        <div className="mb-6">
          <EmptyState
            title={t("noAnalytics")}
            description={t("noSessionsHelp")}
            action={
              <Link href="/study" className={primaryLink}>
                {t("startStudying")}
              </Link>
            }
          />
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <ComponentCard title={t("dailyStudyTime")}>
          <StudyChart
            labels={days.map((day) =>
              formatDate(day, data.user.timezone, locale),
            )}
            values={days.map((day) => Math.round((totals[day] ?? 0) / 60))}
            label={t("minutes")}
          />
        </ComponentCard>
        <ComponentCard title={t("timeBySubject")}>
          <SelectField
            label={t("period")}
            value={period}
            onChange={(event) => setPeriod(event.target.value)}
          >
            {["week", "month", "allTime"].map((key) => (
              <option key={key} value={key}>
                {t(key)}
              </option>
            ))}
          </SelectField>
          <StudyChart
            labels={subjects.map((subject) => subject.title)}
            values={subjects.map((subject) => {
              const selected = sessions.filter(
                (session) => session.subjectId === subject.id,
              );
              return Math.round(
                (period === "allTime"
                  ? totalSeconds(selected)
                  : periodSeconds(
                      selected,
                      data.user.timezone,
                      period === "week"
                        ? weekStart(today, data.user.weekStartDay)
                        : `${today.slice(0, 7)}-01`,
                      today,
                    )) / 60,
              );
            })}
            label={t("minutes")}
          />
        </ComponentCard>
        <ComponentCard title={t("studiedDays")} className="lg:col-span-2">
          <div className="max-w-lg">
            <HeatmapCalendar
              month={today.slice(0, 7)}
              totals={totals}
              weekStartDay={data.user.weekStartDay}
            />
          </div>
        </ComponentCard>
      </div>
      <LearningInsights data={data} weeklySeconds={periodSeconds(sessions,data.user.timezone,weekStart(today,data.user.weekStartDay),today)} />
    </>
  );
}
