"use client";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useNow, useWorkspace } from "@/lib/workspace/store";
import { getSessions, getSubjects, getTopics } from "@/lib/workspace/queries";
import { dailySeconds, localDay, periodSeconds, shiftDay, streaks, subjectProgress, totalSeconds, weekStart } from "@/lib/analytics";
import { duration } from "@/lib/time";
import type { Workspace } from "@/types";
import { ArrowRightIcon, BookCheckIcon, CalenderIcon, FlameIcon, InfoIcon, PieChartIcon, TimeIcon, TimerIcon, TrophyIcon } from "@/icons";
import { primaryLink } from "@/components/studyflow/styles";
import StudyChart from "./StudyChart";
import AnalyticsCard from "./AnalyticsCard";
import KpiCard from "./KpiCard";
import StudiedDaysCalendar from "./StudiedDaysCalendar";
import TopicCompletion from "./TopicCompletion";
import WeeklyGoalProgress from "./WeeklyGoalProgress";
import RevisitSubjects, { type RevisitItem } from "./RevisitSubjects";

interface Props { initial: Workspace }
type Period = "week" | "month" | "allTime";

/** Study time, streaks, subject balance and completion, from the learner's own sessions. */
export default function Analytics({ initial }: Props) {
  const data = useWorkspace(initial);
  const t = useTranslations("analytics");
  const s = useTranslations("studyflow");
  const locale = useLocale();
  const clock = useNow(60000);
  const now = clock || Date.parse(initial.loadedAt ?? initial.user.lastActiveAt);
  const timezone = data.user.timezone;
  const today = localDay(now, timezone);
  const startWeek = weekStart(today, data.user.weekStartDay);
  const startMonth = `${today.slice(0, 7)}-01`;
  const sessions = getSessions(data);
  const summary = data.analytics;
  const totals = summary?.daily ?? dailySeconds(sessions, timezone);
  const streak = summary ? { current: summary.currentStreak, longest: summary.longestStreak }
    : streaks(sessions, timezone, now, data.settings.streakMinutes, data.user.longestStreak);
  const weekSecondsValue = summary?.weekSeconds ?? periodSeconds(sessions, timezone, startWeek, today);
  const monthSecondsValue = summary?.monthSeconds ?? periodSeconds(sessions, timezone, startMonth, today);
  const topicsThisMonth = summary?.topicsCompletedThisMonth ?? getTopics(data).filter(topic => topic.completedAt && localDay(topic.completedAt, timezone).startsWith(today.slice(0, 7))).length;
  const hasSessions = (summary?.sessionCount ?? sessions.length) > 0;
  const [period, setPeriod] = useState<Period>("week");

  const days = Array.from({ length: 7 }, (_, index) => shiftDay(today, index - 6));
  const dailyMinutes = days.map(day => Math.round((totals[day] ?? 0) / 60));
  const subjects = getSubjects(data);
  const active = subjects.filter(subject => subject.status === "active");
  const bySubject = subjects.map(subject => {
    const own = sessions.filter(session => session.subjectId === subject.id);
    const seconds = summary?.subjectSeconds[subject.id]?.[period]
      ?? (period === "allTime" ? totalSeconds(own) : periodSeconds(own, timezone, period === "week" ? startWeek : startMonth, today));
    return { title: subject.title, minutes: Math.round(seconds / 60) };
  }).filter(row => row.minutes > 0).sort((a, b) => b.minutes - a.minutes).slice(0, 8);

  const stats = (id: string) => {
    const known = data.subjectStatistics?.[id];
    if (known) return known;
    const topics = getTopics(data, id).filter(topic => !topic.archived);
    return { completed: topics.filter(topic => topic.status === "completed").length, total: topics.length, progress: subjectProgress(topics), lastStudiedAt: sessions.find(session => session.subjectId === id)?.startedAt };
  };
  const topicTotals = active.reduce((sum, subject) => { const value = stats(subject.id); return { completed: sum.completed + value.completed, total: sum.total + value.total }; }, { completed: 0, total: 0 });
  const revisit: RevisitItem[] = active.map(subject => ({ id: subject.id, title: subject.title, ...stats(subject.id) }))
    .filter(item => item.total > item.completed)
    .sort((a, b) => (a.lastStudiedAt ?? "").localeCompare(b.lastStudiedAt ?? ""))
    .slice(0, 5);

  return (
    <div className="an-page">
      <header className="an-header">
        <nav aria-label={s("breadcrumb")}>
          <ol className="an-breadcrumb">
            <li><Link href="/dashboard">{s("dashboard.navLabel")}</Link></li>
            <li aria-hidden="true"><ArrowRightIcon className="rtl:rotate-180" /></li>
            <li aria-current="page">{t("title")}</li>
          </ol>
        </nav>
        <h1 className="an-title">{t("title")}</h1>
        <p className="an-subtitle">{t("subtitle")}</p>
      </header>

      <section aria-label={t("kpisLabel")} className="an-kpis">
        <KpiCard icon={<TimeIcon />} label={t("today")} value={duration(totals[today] ?? 0)} />
        <KpiCard icon={<CalenderIcon />} label={t("thisWeek")} value={duration(weekSecondsValue)} />
        <KpiCard icon={<PieChartIcon />} label={t("thisMonth")} value={duration(monthSecondsValue)} />
        <KpiCard icon={<FlameIcon />} tone="warm" label={t("currentStreak")} value={t("days", { count: streak.current })} />
        <KpiCard icon={<TrophyIcon />} tone="warm" label={t("longestStreak")} value={t("days", { count: streak.longest })} />
        <KpiCard icon={<BookCheckIcon />} tone="success" label={t("topicsCompleted")} value={String(topicsThisMonth)} hint={t("thisMonthHint")} />
      </section>
      <p className="an-rule"><InfoIcon aria-hidden="true" />{t("studyDayRule", { minutes: data.settings.streakMinutes })}</p>

      {!hasSessions && (
        <section className="an-welcome" aria-labelledby="analytics-welcome">
          <span className="an-welcome-icon" aria-hidden="true"><TimerIcon /></span>
          <div className="min-w-0 flex-1">
            <h2 id="analytics-welcome">{t("emptyTitle")}</h2>
            <p>{t("emptyBody")}</p>
          </div>
          <Link href="/study" className={primaryLink}>{s("startStudying")}</Link>
        </section>
      )}

      <div className="an-grid">
        <AnalyticsCard id="analytics-daily" className="an-span-7" title={t("dailyTitle")} description={t("dailyDescription")}>
          {dailyMinutes.some(Boolean)
            ? <StudyChart labels={days.map(day => new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`)))} values={dailyMinutes} label={s("minutes")} minutes height={240} />
            : <EmptyChart text={t("dailyEmpty")} />}
        </AnalyticsCard>
        <AnalyticsCard id="analytics-subjects" className="an-span-5" title={t("subjectsTitle")} description={t("subjectsDescription")}
          action={
            <label className="an-select-wrap">
              <span className="sr-only">{t("period")}</span>
              <select className="an-select" value={period} onChange={event => setPeriod(event.target.value as Period)}>
                {(["week", "month", "allTime"] as const).map(key => <option key={key} value={key}>{t(`periods.${key}`)}</option>)}
              </select>
            </label>
          }>
          {bySubject.length
            ? <StudyChart labels={bySubject.map(row => row.title)} values={bySubject.map(row => row.minutes)} label={s("minutes")} minutes horizontal height={Math.max(180, bySubject.length * 44 + 60)} />
            : <EmptyChart text={t(`subjectsEmpty.${period}`)} />}
        </AnalyticsCard>

        <AnalyticsCard id="analytics-days" className="an-span-5" title={t("studiedDaysTitle")} description={t("studiedDaysDescription")}>
          <StudiedDaysCalendar month={today.slice(0, 7)} today={today} totals={totals} weekStartDay={data.user.weekStartDay} thresholdMinutes={data.settings.streakMinutes} />
        </AnalyticsCard>
        <div className="an-span-7 an-stack">
          <div className="an-pair">
            <AnalyticsCard id="analytics-topics" title={t("topicsTitle")} description={t("topicsDescription")}>
              {topicTotals.total
                ? <TopicCompletion completed={topicTotals.completed} total={topicTotals.total} thisMonth={topicsThisMonth} />
                : <p className="an-empty-inline">{t("topicsEmpty")} <Link href="/subjects" className="an-link">{t("addTopics")}</Link></p>}
            </AnalyticsCard>
            <AnalyticsCard id="analytics-goal" title={t("weeklyGoal")} description={t("weeklyGoalDescription")}>
              <WeeklyGoalProgress seconds={weekSecondsValue} targetMinutes={data.user.weeklyTargetMinutes} />
            </AnalyticsCard>
          </div>
          <AnalyticsCard id="analytics-revisit" title={t("revisitTitle")} description={t("revisitDescription")}>
            <RevisitSubjects items={revisit} hasSubjects={active.length > 0} now={now} />
          </AnalyticsCard>
        </div>
      </div>
    </div>
  );
}

function EmptyChart({ text }: { text: string }) {
  return (
    <div className="an-chart-empty">
      <span className="an-chart-empty-bars" aria-hidden="true"><span /><span /><span /><span /><span /></span>
      <p>{text}</p>
    </div>
  );
}
