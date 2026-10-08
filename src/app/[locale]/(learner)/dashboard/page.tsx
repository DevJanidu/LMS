import { requireLearner } from "@/lib/auth";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { dashboardBodyWorkspace, dashboardScheduleBlocks, dashboardStatsWorkspace } from "@/lib/services/focused-workspace";
import { users } from "@/lib/db/schema";
import Dashboard from "@/components/dashboard/Dashboard";
import DashboardGreeting from "@/components/dashboard/DashboardGreeting";
import { Suspense } from "react";

type DashboardSection = "today" | "week";
type Account = typeof users.$inferSelect;
async function StatsSection({ section, user }: { section: DashboardSection; user: Account }) {
  return <Dashboard initial={await dashboardStatsWorkspace(user)} section={section} />;
}
async function MessageSection({ user }: { user: Account }) {
  const [stats, blocks] = await Promise.all([dashboardStatsWorkspace(user), dashboardScheduleBlocks(user)]);
  const initial = { ...stats, blocks, pageFields: [...(stats.pageFields ?? []), "blocks" as const] };
  return <Dashboard initial={initial} section="message" />;
}
async function BodySection({ user }: { user: Account }) {
  return <Dashboard initial={await dashboardBodyWorkspace(user)} section="body" />;
}

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireLearner();
  return <>
    <header className="sf-hero sf-dashboard-hero">
      <DashboardGreeting name={user.name}>
        <Suspense fallback={<p className="sf-hero-message" data-workspace-loading><span className="block h-5 w-48 animate-pulse rounded bg-gray-200 dark:bg-gray-800" /></p>}><MessageSection user={user} /></Suspense>
      </DashboardGreeting>
      <Suspense fallback={<div data-workspace-loading className="h-60 animate-pulse rounded-xl bg-gray-200 dark:bg-gray-800" />}><StatsSection user={user} section="today" /></Suspense>
      <Suspense fallback={<div data-workspace-loading className="h-60 animate-pulse rounded-xl bg-gray-200 dark:bg-gray-800" />}><StatsSection user={user} section="week" /></Suspense>
    </header>
    <Suspense fallback={<div className="sf-dashboard-body" data-workspace-loading><div className="h-80 animate-pulse rounded-xl bg-gray-200 dark:bg-gray-800" /><div className="h-80 animate-pulse rounded-xl bg-gray-200 dark:bg-gray-800" /></div>}><BodySection user={user} /></Suspense>
  </>;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "studyflow" });
  return { title: t("dashboard") };
}
