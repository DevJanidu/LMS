"use client";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useNow, useWorkspace } from "@/lib/workspace/store";
import { adminMetrics } from "@/lib/analytics/admin";
import { shiftDay, localDay } from "@/lib/analytics";
import { formatDate } from "@/lib/time";
import type { Workspace } from "@/types";
import ComponentCard from "@/components/common/ComponentCard";
import StatTile from "@/components/studyflow/StatTile";
import StudyChart from "@/components/analytics/StudyChart";
import EmptyState from "@/components/studyflow/EmptyState";
import AdminOperations from "./AdminOperations";
export default function AdminOverview({initial}: {initial:Workspace}) {
  const data = useWorkspace(initial);
  const clock = useNow();
  const now = clock || Date.parse(initial.loadedAt ?? initial.user.lastActiveAt);
  const t = useTranslations("studyflow");
  const locale = useLocale();
  const metrics = adminMetrics(data,now);
  const hour = Number(new Intl.DateTimeFormat("en",{hour:"numeric",hourCycle:"h23",timeZone:data.user.timezone}).format(now));
  const days = Array.from({length:30},(_,i)=>shiftDay(metrics.today,i-29));
  return <>
    <header className="sf-hero"><div className="flex flex-wrap items-center justify-between gap-3"><p className="sf-eyebrow">{t("redesign.platformOverview")}</p><p className="text-sm text-muted">{formatDate(metrics.today,data.user.timezone,locale)}</p></div><h1>{t(`redesign.${hour<12?"morning":hour<18?"afternoon":"evening"}`,{name:data.user.name.split(" ")[0]})}</h1><p className="sf-hero-message">{t("redesign.adminGreeting")}</p></header>
    <div className="grid gap-6 xl:grid-cols-3"><section className="sf-admin-pulse xl:col-span-2" aria-label={t("redesign.platformPulse")}><StatTile label={t("totalUsers")} value={metrics.totalUsers} /><StatTile label={t("activeUsers")} value={metrics.activeUsers} detail={t("adminActiveDefinition")} /><StatTile label={t("sessionsToday")} value={metrics.sessionsToday} /><StatTile label={t("totalHours")} value={metrics.totalHours} /><StatTile label={t("newUsers")} value={metrics.newUsers} /><StatTile label={t("activeSubjects")} value={metrics.activeSubjects} /></section><AdminOperations data={data} /></div>
    <div className="mt-7 grid gap-6 xl:grid-cols-2"><ComponentCard title={t("redesign.learnerGrowth")} desc={t("redesign.last30")}><StudyChart type="line" labels={days.map(d=>formatDate(d,data.user.timezone,locale))} values={days.map(day=>data.platform?.growth[day] ?? data.users.filter(u=>localDay(u.createdAt,data.user.timezone)<=day).length)} label={t("totalUsers")} /></ComponentCard><ComponentCard title={t("dailyActiveLearners")} desc={t("redesign.activeDefinition")}><StudyChart labels={days.map(d=>formatDate(d,data.user.timezone,locale))} values={days.map(metrics.dailyActive)} label={t("learners")} /></ComponentCard></div>
    <div className="sf-metric-strip my-7 grid sm:grid-cols-3"><StatTile label={t("dailyActive")} value={metrics.daily} /><StatTile label={t("monthlyActive")} value={metrics.monthly} /><StatTile label={t("averageSession")} value={t("redesign.minutesValue",{count:metrics.averageMinutes})} /></div>
    <section><div className="sf-section-heading"><h2>{t("recentSignups")}</h2><Link href="/admin/users">{t("users")} →</Link></div>{data.users.length ? <div className="sf-panel overflow-x-auto"><table className="w-full text-start"><thead><tr>{["name","email","joined","lastActive","status"].map(k=><th key={k} className="px-5 py-3 text-start">{t(k)}</th>)}</tr></thead><tbody>{[...data.users].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,5).map(user=><tr key={user.id} className="border-t border-gray-200 dark:border-gray-800"><td className="px-5 py-4"><Link className="font-medium text-brand-600 dark:text-brand-300" href={`/admin/users/${user.id}`}>{user.name}</Link></td><td className="px-5 py-4 text-muted">{user.email}</td><td className="px-5 py-4 whitespace-nowrap">{formatDate(user.createdAt,data.user.timezone,locale)}</td><td className="px-5 py-4 whitespace-nowrap">{formatDate(user.lastActiveAt,data.user.timezone,locale)}</td><td className="px-5 py-4">{t(user.status)}</td></tr>)}</tbody></table></div> : <EmptyState title={t("noUsers")} />}</section>
  </>;
}
