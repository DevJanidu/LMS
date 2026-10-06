"use client";
import { useTranslations, useLocale } from "next-intl";
import { useNow, useWorkspace } from "@/lib/mock/store";
import { adminMetrics } from "@/lib/analytics/admin";
import { localDay, shiftDay } from "@/lib/analytics";
import { formatDate } from "@/lib/time";
import type { Workspace } from "@/types";
import PageHeader from "@/components/studyflow/PageHeader";
import StatTile from "@/components/studyflow/StatTile";
import ComponentCard from "@/components/common/ComponentCard";
import StudyChart from "@/components/analytics/StudyChart";
interface Props {
  initial: Workspace;
}
/** Aggregate learner activity and study effort. */
export default function AdminAnalytics({ initial }: Props) {
  const data = useWorkspace(initial);
  const t = useTranslations("studyflow");
  const locale = useLocale();
  const clock = useNow();
  const metrics = adminMetrics(
    data,
    clock || Date.parse(initial.user.lastActiveAt),
  );
  const days = Array.from({ length: 7 }, (_, index) =>
    shiftDay(metrics.today, index - 6),
  );
  const tiles = [
    ["dailyActive", metrics.daily],
    ["weeklyActive", metrics.weekly],
    ["monthlyActive", metrics.monthly],
    ["averageSession", `${metrics.averageMinutes}m`],
    ["totalHours", metrics.totalHours],
    ["subjectsCreated", metrics.subjectsCreated],
    ["topicsCompleted", metrics.topicsCompleted],
  ];
  return (
    <>
      <PageHeader
        title={t("platformAnalytics")}
        description={t("adminDescription")}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {tiles.map(([key, value]) => (
          <StatTile key={key} label={t(String(key))} value={value} />
        ))}
      </div>
      <ComponentCard title={t("sessionsPerDay")}>
        <StudyChart
          labels={days.map((day) =>
            formatDate(day, data.user.timezone, locale),
          )}
          values={days.map(
            (day) =>
              data.sessions.filter(
                (session) =>
                  session.status === "valid" &&
                  localDay(session.startedAt, data.user.timezone) === day,
              ).length,
          )}
          label={t("sessions")}
        />
      </ComponentCard>
    </>
  );
}
