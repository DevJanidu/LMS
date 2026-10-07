"use client";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ArrowRightIcon } from "@/icons";
import { useNow, useWorkspace } from "@/lib/workspace/store";
import { getSessions, getSubjects, getTopics } from "@/lib/workspace/queries";
import {
  localDay,
  periodSeconds,
  shiftDay,
  streaks,
  weekStart,
} from "@/lib/analytics";
import { getOccurrences } from "@/lib/schedule";
import { duration, formatDate } from "@/lib/time";
import type { Workspace } from "@/types";
import EmptyState from "@/components/studyflow/EmptyState";
import { primaryLink } from "@/components/studyflow/styles";
import SubjectCard from "@/components/subjects/SubjectCard";
import WeeklyJourney from "./WeeklyJourney";
import TodayPlan from "./TodayPlan";

export default function Dashboard({ initial }: { initial: Workspace }) {
  const data = useWorkspace(initial);
  const t = useTranslations("studyflow");
  const locale = useLocale();
  const clock = useNow();
  const now = clock || Date.parse(initial.user.lastActiveAt);
  const today = localDay(now, data.user.timezone);
  const sessions = getSessions(data);
  const subjects = getSubjects(data).filter((s) => s.status === "active");
  const topics = getTopics(data);
  const todaySeconds = data.analytics?.todaySeconds ?? periodSeconds(sessions, data.user.timezone, today, today);
  const weekSeconds = data.analytics?.weekSeconds ?? periodSeconds(sessions, data.user.timezone, weekStart(today, data.user.weekStartDay), today);
  const streak = data.analytics ? { current: data.analytics.currentStreak, longest: data.analytics.longestStreak } : streaks(sessions, data.user.timezone, now, data.settings.streakMinutes, data.user.longestStreak);
  const blocks = getOccurrences(
    data.blocks.filter((b) => b.userId === data.user.id),
    shiftDay(today, -1),
    shiftDay(today, 7),
  ).filter((b) => Date.parse(b.endsAt) > now);
  const todaysBlocks = blocks.filter(
    (b) => localDay(b.startsAt, data.user.timezone) === today,
  );
  const hour = Number(
    new Intl.DateTimeFormat("en", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: data.user.timezone,
    }).format(now),
  );
  const greeting = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  // The existing live clock updates this when the learner's local period changes.
  const backgroundPeriod =
    hour >= 6 && hour < 12
      ? "morning"
      : hour >= 12 && hour < 18
        ? "afternoon"
        : hour >= 18 && hour < 21
          ? "evening"
          : "night";
  const completed = data.analytics?.topicsCompletedThisMonth ?? topics.filter(
    (topic) =>
      topic.completedAt &&
      localDay(topic.completedAt, data.user.timezone).startsWith(
        today.slice(0, 7),
      ),
  ).length;
  const message =
    todaySeconds > 0
      ? t("redesign.greetingStudied", { time: duration(todaySeconds) })
      : todaysBlocks.length
        ? t("redesign.greetingPlanned", { count: todaysBlocks.length })
        : streak.current > 0
          ? t("redesign.greetingStreak", { days: streak.current })
          : t("redesign.greetingReady");
  const ranked = [...subjects]
    .sort((a, b) => {
      const latest = (id: string) =>
        sessions.find((s) => s.subjectId === id)?.startedAt ?? "";
      const unfinished = (id: string) =>
        topics.some(
          (topic) => topic.subjectId === id && topic.status !== "completed",
        );
      return (
        Number(unfinished(b.id)) - Number(unfinished(a.id)) ||
        latest(b.id).localeCompare(latest(a.id))
      );
    })
    .slice(0, 3);
  const deadlines = [
    ...subjects
      .filter((s) => s.targetDate)
      .map((s) => ({
        id: s.id,
        title: s.title,
        date: s.targetDate!,
        href: `/subjects/${s.id}`,
      })),
    ...topics
      .filter((s) => s.targetDate && s.status !== "completed")
      .map((s) => ({
        id: s.id,
        title: s.title,
        date: s.targetDate!,
        href: `/subjects/${s.subjectId}`,
      })),
  ]
    .filter((d) => d.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3);
  return (
    <>
      <header className="sf-hero sf-dashboard-hero">
        <div className="sf-dashboard-greeting">
          <Image
            key={backgroundPeriod}
            src={`/images/${backgroundPeriod}.png`}
            alt=""
            fill
            sizes="(min-width: 1280px) 38vw, 100vw"
            loading="eager"
            className="sf-greeting-image"
          />
          <p className="sf-eyebrow">{t("redesign.personalWorkspace")}</p>
          <h1>
            {t(`redesign.${greeting}`, {
              name: data.user.name.trim().split(" ")[0],
            })}
          </h1>
          <p className="sf-hero-message">{message}</p>
        </div>
        <section
          className="sf-dashboard-today"
          aria-label={t("todayStudyTime")}
        >
          <div className="sf-dashboard-today-summary">
            <p className="sf-eyebrow">{t("todayStudyTime")}</p>
            <p className="sf-dashboard-today-value">{duration(todaySeconds)}</p>
            <p className="sf-dashboard-today-note">{t("everyMinute")}</p>
          </div>
          <dl className="sf-dashboard-milestones">
            <div>
              <dt>{t("currentStreak")}</dt>
              <dd>{t("streakDays", { days: streak.current })}</dd>
            </div>
            <div>
              <dt>{t("topicsThisMonth")}</dt>
              <dd>{completed}</dd>
            </div>
          </dl>
        </section>
        <WeeklyJourney data={data} today={today} seconds={weekSeconds} />
      </header>
      <div className="sf-dashboard-body">
        <div className="sf-dashboard-learning">
          <TodayPlan
            data={data}
            today={today}
            blocks={todaysBlocks}
            next={blocks[0]}
          />
          <section className="min-w-0">
            <div className="sf-section-heading">
              <h2>{t("continueLearning")}</h2>
              <Link href="/subjects">{t("redesign.allSubjects")} â†’</Link>
            </div>
            {ranked.length ? (
              <div className="sf-continue-grid">
                {ranked.map((subject) => (
                  <SubjectCard
                    key={subject.id}
                    subject={subject}
                    statistics={data.subjectStatistics?.[subject.id]}
                    topics={getTopics(data, subject.id)}
                    sessions={sessions.filter(
                      (s) => s.subjectId === subject.id,
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
          </section>
        </div>
        <aside className="sf-dashboard-context">
          <section>
            <div className="sf-section-heading">
              <h2>{t("upcomingDeadlines")}</h2>
            </div>
            {deadlines.length ? (
              <ul className="sf-dashboard-deadlines">
                {deadlines.map((item) => (
                  <li key={item.id}>
                    <Link href={item.href}>
                      <span className="sf-deadline-dot" aria-hidden="true" />
                      <span className="sf-deadline-copy">
                        <strong>{item.title}</strong>
                        <time>
                          {formatDate(item.date, data.user.timezone, locale)}
                        </time>
                      </span>
                      <ArrowRightIcon aria-hidden="true" className="sf-deadline-arrow size-4 rtl:rotate-180" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted text-sm">{t("noDeadlines")}</p>
            )}
          </section>
          <section className="sf-dashboard-recent">
            <div className="sf-section-heading">
              <h2>{t("recentSessions")}</h2>
              <Link href="/study/history">{t("viewHistory")} â†’</Link>
            </div>
            {sessions.length ? (
              <ul className="sf-dashboard-session-list">
                {sessions.slice(0, 4).map((session) => (
                  <li key={session.id}>
                    <div className="sf-dashboard-session-heading">
                      <strong>
                        {
                          data.subjects.find(
                            (subject) => subject.id === session.subjectId,
                          )?.title
                        }
                      </strong>
                      <span>{duration(session.durationSeconds)}</span>
                    </div>
                    {session.topicId && (
                      <p>
                        {
                          data.topics.find(
                            (topic) => topic.id === session.topicId,
                          )?.title
                        }
                      </p>
                    )}
                    <time>
                      {formatDate(
                        session.startedAt,
                        data.user.timezone,
                        locale,
                        true,
                      )}
                    </time>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                title={t("noSessions")}
                description={t("noSessionsHelp")}
                action={
                  <Link href="/study" className={primaryLink}>
                    {t("startStudying")}
                  </Link>
                }
              />
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
