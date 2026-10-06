"use client";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useNow, useWorkspace } from "@/lib/mock/store";
import { adminMetrics } from "@/lib/analytics/admin";
import { shiftDay } from "@/lib/analytics";
import { formatDate } from "@/lib/time";
import type { Workspace } from "@/types";
import { APP_NAME } from "@/lib/constants";
import ComponentCard from "@/components/common/ComponentCard";
import PageHeader from "@/components/studyflow/PageHeader";
import StatTile from "@/components/studyflow/StatTile";
import StudyChart from "@/components/analytics/StudyChart";
import EmptyState from "@/components/studyflow/EmptyState";
interface Props {
  initial: Workspace;
}
/** Platform health overview containing aggregate study activity only. */
export default function AdminOverview({ initial }: Props) {
  const data = useWorkspace(initial);
  const now = useNow();
  const t = useTranslations("studyflow");
  const locale = useLocale();
  const metrics = adminMetrics(
    data,
    now || Date.parse(initial.user.lastActiveAt),
  );
  const days = Array.from({ length: 14 }, (_, index) =>
    shiftDay(metrics.today, index - 13),
  );
  return (
    <>
      <PageHeader
        title={t("adminOverview", { appName: APP_NAME })}
        description={t("adminDescription")}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {(
          [
            "totalUsers",
            "activeUsers",
            "newUsers",
            "sessionsToday",
            "totalHours",
            "activeSubjects",
          ] as const
        ).map((key) => (
          <StatTile key={key} label={t(key)} value={metrics[key]} />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <ComponentCard
          title={t("dailyActiveLearners")}
          className="lg:col-span-2"
        >
          <StudyChart
            type="line"
            labels={days.map((day) =>
              formatDate(day, data.user.timezone, locale),
            )}
            values={days.map(metrics.dailyActive)}
            label={t("learners")}
          />
        </ComponentCard>
        <ComponentCard title={t("recentSignups")}>
          {data.users.length ? (
            [...data.users]
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
              .slice(0, 5)
              .map((user) => (
                <Link
                  key={user.id}
                  href={`/admin/users/${user.id}`}
                  className="block text-sm"
                >
                  <span className="block font-medium">{user.name}</span>
                  <span className="text-theme-xs text-gray-500 dark:text-gray-400">
                    {formatDate(user.createdAt, data.user.timezone, locale)}
                  </span>
                </Link>
              ))
          ) : (
            <EmptyState title={t("noUsers")} />
          )}
        </ComponentCard>
      </div>
    </>
  );
}
