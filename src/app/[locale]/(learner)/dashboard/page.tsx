import { requireLearner } from "@/lib/auth";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  dashboardBodyWorkspace,
  dashboardScheduleBlocks,
  dashboardStatsWorkspace,
} from "@/lib/services/focused-workspace";
import { users } from "@/lib/db/schema";
import Dashboard from "@/components/dashboard/Dashboard";
import DashboardGreeting from "@/components/dashboard/DashboardGreeting";
import { Suspense } from "react";
import GoalPriorities from "@/components/goals/GoalPriorities";
import DashboardNextAction, {
  NextActionSkeleton,
} from "@/components/dashboard/DashboardNextAction";
import UpcomingDeadlines from "@/components/dashboard/UpcomingDeadlines";
import { PanelSkeleton } from "@/components/dashboard/DashboardPanel";

type DashboardSection = "today" | "week";
type Account = typeof users.$inferSelect;
async function StatsSection({
  section,
  user,
}: {
  section: DashboardSection;
  user: Account;
}) {
  return (
    <Dashboard
      initial={await dashboardStatsWorkspace(user)}
      section={section}
    />
  );
}
async function MessageSection({ user }: { user: Account }) {
  const [stats, blocks] = await Promise.all([
    dashboardStatsWorkspace(user),
    dashboardScheduleBlocks(user),
  ]);
  const initial = {
    ...stats,
    blocks,
    pageFields: [...(stats.pageFields ?? []), "blocks" as const],
  };
  return <Dashboard initial={initial} section="message" />;
}
// Both sections read the same request-cached workspace, so the data is loaded once.
async function BodySection({
  user,
  section,
}: {
  user: Account;
  section: "plan" | "body";
}) {
  return (
    <Dashboard initial={await dashboardBodyWorkspace(user)} section={section} />
  );
}
const statSkeleton = (
  <div data-workspace-loading className="space-y-3">
    <div className="sf-skeleton h-3 w-24" />
    <div className="sf-skeleton h-8 w-32" />
    <div className="sf-skeleton h-3 w-40" />
  </div>
);

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireLearner();
  return (
    <>
      {/* 1. What have I accomplished? */}
      <header className="sf-hero sf-dashboard-hero">
        <DashboardGreeting name={user.name}>
          <Suspense
            fallback={
              <p className="sf-hero-message" data-workspace-loading>
                <span className="sf-skeleton block h-5 w-48" />
              </p>
            }
          >
            <MessageSection user={user} />
          </Suspense>
        </DashboardGreeting>
        <div className="sf-dashboard-progress">
          <Suspense fallback={statSkeleton}>
            <StatsSection user={user} section="today" />
          </Suspense>
          <Suspense fallback={statSkeleton}>
            <StatsSection user={user} section="week" />
          </Suspense>
        </div>
      </header>
      {/* 2. What should I do next? */}
      <Suspense fallback={<NextActionSkeleton />}>
        <DashboardNextAction userId={user.id} />
      </Suspense>
      {/* 3. Am I on track? Goals, today's sessions and deadlines as one journey. */}
      <div className="sf-journey">
        <Suspense fallback={<PanelSkeleton />}>
          <GoalPriorities userId={user.id} />
        </Suspense>
        <Suspense fallback={<PanelSkeleton />}>
          <BodySection user={user} section="plan" />
        </Suspense>
        <Suspense fallback={<PanelSkeleton />}>
          <UpcomingDeadlines userId={user.id} timezone={user.timezone} />
        </Suspense>
      </div>
      <Suspense
        fallback={
          <div className="sf-dashboard-body" data-workspace-loading>
            <div className="sf-skeleton h-64" />
            <div className="sf-skeleton h-64" />
          </div>
        }
      >
        <BodySection user={user} section="body" />
      </Suspense>
    </>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "studyflow" });
  return { title: t("dashboard.navLabel") };
}
