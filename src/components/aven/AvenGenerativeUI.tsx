"use client";
import { memo } from "react";
import { useTranslations } from "next-intl";
import type { UiComponent, UiComponentType } from "@/lib/aven/ui-components";
import NextBestActionCard from "@/components/goals/NextBestActionCard";
import GoalProgressCard from "./cards/GoalProgressCard";
import TopicCoverageCard from "./cards/TopicCoverageCard";
import StudyAnalyticsCard from "./cards/StudyAnalyticsCard";
import TaskListCard from "./cards/TaskListCard";
import CircleLeaderboardCard from "./cards/CircleLeaderboardCard";
import AvenReveal from "./AvenReveal";
const eyebrows: Record<UiComponentType, string> = {
  goal_progress: "goalProgress",
  next_actions: "goalProgress",
  topic_coverage: "topicCoverage",
  study_analytics: "studyAnalytics",
  task_list: "taskList",
  circle_leaderboard: "leaderboard",
};
/** A placeholder that holds a card's place while verified data loads; it shows no data. */
function CardSkeleton({ type }: { type: UiComponentType }) {
  const t = useTranslations("aven.cards");
  return (
    <article className="aven-card" aria-busy="true" data-loading>
      <header className="aven-card-header">
        <div className="min-w-0 flex-1">
          <p className="aven-card-eyebrow">{t(eyebrows[type])}</p>
          <div className="aven-skeleton mt-2 h-5 w-1/2" />
        </div>
      </header>
      <div className="aven-card-body">
        <div className="aven-skeleton h-2 w-full" />
        <p className="aven-card-note">{t("loadingCard")}</p>
      </div>
    </article>
  );
}
function Card({ component }: { component: UiComponent }) {
  if (component.status !== "ready" || !component.data)
    return <CardSkeleton type={component.type} />;
  switch (component.type) {
    case "goal_progress":
      return (
        <div className="aven-card-stack">
          {component.data!.goals.map((goal) => (
            <GoalProgressCard key={goal.id} goal={goal} />
          ))}
        </div>
      );
    case "next_actions":
      return <NextBestActionCard actions={component.data!.actions} askAven={false} />;
    case "topic_coverage":
      return <TopicCoverageCard data={component.data!} />;
    case "study_analytics":
      return <StudyAnalyticsCard data={component.data!} />;
    case "task_list":
      return <TaskListCard data={component.data!} />;
    case "circle_leaderboard":
      return <CircleLeaderboardCard data={component.data!} />;
  }
}
/**
 * Renders registry components in arrival order. Each keeps a stable slot keyed by its id,
 * so a placeholder turns into its card in place, with an animated height change.
 */
function AvenGenerativeUI({ components }: { components: UiComponent[] }) {
  const shown = components.filter((item) => item.status !== "removed");
  if (!shown.length) return null;
  return (
    <div className="aven-card-stack">
      {shown.map((component) => (
        <div key={component.id} className="aven-card-enter">
          <AvenReveal>
            <Card component={component} />
          </AvenReveal>
        </div>
      ))}
    </div>
  );
}
export default memo(AvenGenerativeUI);
