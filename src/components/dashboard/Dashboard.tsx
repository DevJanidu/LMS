"use client";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useNow, useWorkspace } from "@/lib/mock/store";
import { getSessions, getSubjects, getTopics } from "@/lib/mock";
import {
  localDay,
  periodSeconds,
  shiftDay,
  streaks,
  weeklyGoalPercent,
  weekStart,
} from "@/lib/analytics";
import { getOccurrences } from "@/lib/mock/schedule";
import { duration, formatDate } from "@/lib/time";
import type { Workspace } from "@/types";
import ComponentCard from "@/components/common/ComponentCard";
import PageHeader from "@/components/studyflow/PageHeader";
import StatTile from "@/components/studyflow/StatTile";
import ProgressBar from "@/components/studyflow/ProgressBar";
import EmptyState from "@/components/studyflow/EmptyState";
import { primaryLink } from "@/components/studyflow/WorkspaceShell";
import SubjectCard from "@/components/subjects/SubjectCard";
import SessionTable from "@/components/study/SessionTable";
interface Props {
  initial: Workspace;
}
/** Today's study overview with no dashboard chart clutter. */
export default function Dashboard({ initial }: Props) {
  const data = useWorkspace(initial);
  const t = useTranslations("studyflow");
  const locale = useLocale();
  const clock = useNow();
  const now = clock || Date.parse(initial.user.lastActiveAt);
  const today = localDay(now, data.user.timezone);
  const sessions = getSessions(data);
  const subjects = getSubjects(data).filter(
    (subject) => subject.status === "active",
  );
  const week = periodSeconds(
    sessions,
    data.user.timezone,
    weekStart(today, data.user.weekStartDay),
    today,
  );
  const goal = weeklyGoalPercent(week / 60, data.user.weeklyTargetMinutes);
  const streak = streaks(
    sessions,
    data.user.timezone,
    now,
    data.settings.streakMinutes,
    data.user.longestStreak,
  );
  const blocks = getOccurrences(
    data.blocks.filter((block) => block.userId === data.user.id),
    shiftDay(today, -1),
    shiftDay(today, 7),
  );
  const todaysBlocks = blocks.filter(
    (block) => localDay(block.startsAt, data.user.timezone) === today,
  );
  const nextBlock = blocks.find((item) => Date.parse(item.startsAt) > now);
  const deadlines = [
    ...subjects
      .filter((subject) => subject.targetDate)
      .map((subject) => ({
        id: subject.id,
        title: subject.title,
        date: subject.targetDate!,
        href: `/subjects/${subject.id}`,
      })),
    ...getTopics(data)
      .filter((topic) => topic.targetDate && topic.status !== "completed")
      .map((topic) => ({
        id: topic.id,
        title: topic.title,
        date: topic.targetDate!,
        href: `/subjects/${topic.subjectId}`,
      })),
  ]
    .filter((item) => item.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 4);
  const completed = getTopics(data).filter(
    (topic) =>
      topic.completedAt &&
      localDay(topic.completedAt, data.user.timezone).startsWith(
        today.slice(0, 7),
      ),
  ).length;
  return (
    <>
      <PageHeader
        title={t("greeting", { name: data.user.name.split(" ")[0] })}
        description={t("dashboardDescription")}
        action={
          <Link href="/study" className={primaryLink}>
            {t("startStudying")}
          </Link>
        }
      />
      <div className="mb-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label={t("todayStudyTime")}
          value={duration(
            periodSeconds(sessions, data.user.timezone, today, today),
          )}
          detail={t("everyMinute")}
        />
        <StatTile
          label={t("weeklyGoal")}
          value={duration(week)}
          detail={t("goalOf", {
            goal: duration(data.user.weeklyTargetMinutes * 60),
            percent: goal,
          })}
        >
          <ProgressBar value={goal} label={t("weeklyGoal")} />
        </StatTile>
        <StatTile
          label={t("studyStreak")}
          value={t("streakDays", { days: streak.current })}
          detail={t("longest", { days: streak.longest })}
        />
        <StatTile
          label={t("topicsThisMonth")}
          value={completed}
          detail={t("oneTopicAtATime")}
        />
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="min-w-0 space-y-6 xl:col-span-2">
          <ComponentCard title={t("subjectProgress")}>
            {subjects.length ? (
              <div className="space-y-3">
                {subjects.map((subject) => (
                  <SubjectCard
                    key={subject.id}
                    subject={subject}
                    topics={getTopics(data, subject.id)}
                    sessions={sessions.filter(
                      (session) => session.subjectId === subject.id,
                    )}
                    timezone={data.user.timezone}
                    compact
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                title={t("noSubjects")}
                description={t("noSubjectsHelp")}
                action={
                  <Link href="/subjects?add=1" className={primaryLink}>
                    {t("addSubject")}
                  </Link>
                }
              />
            )}
          </ComponentCard>
          <ComponentCard title={t("recentSessions")}>
            <SessionTable sessions={sessions.slice(0, 5)} data={data} />
            <Link
              href="/study/history"
              className="text-sm text-brand-600 dark:text-brand-300"
            >
              {t("viewHistory")}
            </Link>
          </ComponentCard>
        </div>
        <div className="space-y-6">
          <ComponentCard title={t("todaySchedule")}>
            {nextBlock && (
              <p className="text-theme-xs text-gray-500 dark:text-gray-400">
                {t("nextStudyBlock")}: {nextBlock.title} ·{" "}
                {formatDate(
                  nextBlock.startsAt,
                  data.user.timezone,
                  locale,
                  true,
                )}
              </p>
            )}
            {todaysBlocks.length ? (
              todaysBlocks.map((item) => (
                <Link
                  key={`${item.block.id}-${item.date}`}
                  href="/calendar"
                  className="block rounded-xl border-s-4 border-brand-400 bg-gray-50 p-4 dark:border-brand-400 dark:bg-gray-800"
                >
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="mt-1 text-theme-xs text-gray-500 dark:text-gray-400">
                    {formatDate(
                      item.startsAt,
                      data.user.timezone,
                      locale,
                      true,
                    )}{" "}
                    ·{" "}
                    {duration(
                      (Date.parse(item.endsAt) - Date.parse(item.startsAt)) /
                        1000,
                    )}
                  </p>
                </Link>
              ))
            ) : (
              <EmptyState
                title={t("noBlocksToday")}
                action={
                  <Link href="/calendar?add=1" className={primaryLink}>
                    {t("scheduleStudy")}
                  </Link>
                }
              />
            )}
          </ComponentCard>
          <ComponentCard title={t("upcomingDeadlines")}>
            {deadlines.length ? (
              deadlines.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className="flex justify-between gap-3 text-sm"
                >
                  <span>{item.title}</span>
                  <span className="shrink-0 text-gray-500 dark:text-gray-400">
                    {formatDate(item.date, data.user.timezone, locale)}
                  </span>
                </Link>
              ))
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t("noDeadlines")}
              </p>
            )}
          </ComponentCard>
          {sessions[0] && (
            <ComponentCard title={t("continueLearning")}>
              <p className="text-sm">
                {
                  data.subjects.find(
                    (subject) => subject.id === sessions[0].subjectId,
                  )?.title
                }
              </p>
              <Link
                href={`/study?subject=${sessions[0].subjectId}&topic=${sessions[0].topicId ?? ""}`}
                className="text-sm text-brand-600 dark:text-brand-300"
              >
                {t("continue")}
              </Link>
            </ComponentCard>
          )}
        </div>
      </div>
      <div className="mt-7">
        <ComponentCard title={t("quickActions")}>
          <div className="flex flex-wrap gap-3">
            {[
              ["addSubject", "/subjects?add=1"],
              ["addTopic", `/subjects/${subjects[0]?.id ?? ""}`],
              ["addResource", "/resources?add=1"],
              ["scheduleStudy", "/calendar?add=1"],
              ["startStudying", "/study"],
            ].map(([key, href]) => (
              <Link
                key={key}
                href={href}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                {t(key)}
              </Link>
            ))}
          </div>
        </ComponentCard>
      </div>
    </>
  );
}
