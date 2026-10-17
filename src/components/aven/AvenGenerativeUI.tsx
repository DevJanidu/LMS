"use client";
import { memo } from "react";
import { useTranslations } from "next-intl";
import {
  savedState,
  type UiComponent,
  type UiComponentType,
} from "@/lib/aven/ui-components";
import NextBestActionCard from "@/components/goals/NextBestActionCard";
import GoalProgressCard from "./cards/GoalProgressCard";
import TopicCoverageCard from "./cards/TopicCoverageCard";
import StudyAnalyticsCard from "./cards/StudyAnalyticsCard";
import TaskListCard from "./cards/TaskListCard";
import CircleLeaderboardCard from "./cards/CircleLeaderboardCard";
import ChecklistBlock from "./generative-ui/ChecklistBlock";
import QuizBlock from "./generative-ui/QuizBlock";
import FlashcardsBlock from "./generative-ui/FlashcardsBlock";
import DiagramBlock from "./generative-ui/DiagramBlock";
import StudyTargetsBlock from "./generative-ui/StudyTargetsBlock";
import StudyPlannerBlock from "./generative-ui/StudyPlannerBlock";
import AvenReveal from "./AvenReveal";
const eyebrows: Record<UiComponentType, string> = {
  goal_progress: "cards.goalProgress",
  next_actions: "cards.goalProgress",
  topic_coverage: "cards.topicCoverage",
  study_analytics: "cards.studyAnalytics",
  task_list: "cards.taskList",
  circle_leaderboard: "cards.leaderboard",
  checklist: "blocks.checklist",
  quiz: "blocks.quiz",
  flashcards: "blocks.flashcards",
  diagram: "blocks.diagram",
  study_targets: "blocks.targets.eyebrow",
  study_planner: "blocks.planner.eyebrow",
};
/** A placeholder that holds a card's place while verified data loads; it shows no data. */
function CardSkeleton({ type }: { type: UiComponentType }) {
  const t = useTranslations("aven");
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
        <p className="aven-card-note">{t("cards.loadingCard")}</p>
      </div>
    </article>
  );
}
interface Source {
  requestId?: string;
  context?: Record<string, string> | null;
  /** Interaction state can be saved only for replies the server has stored. */
  persist: boolean;
}
function Card({ component, source }: { component: UiComponent; source: Source }) {
  if (component.status !== "ready" || !component.data)
    return <CardSkeleton type={component.type} />;
  const common = { id: component.id, requestId: source.requestId, persist: source.persist };
  const saved = <T,>() => savedState<T>(source.context, component.id);
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
    case "checklist":
      return <ChecklistBlock {...common} data={component.data!} saved={saved()} />;
    case "quiz":
      return <QuizBlock {...common} data={component.data!} saved={saved()} />;
    case "flashcards":
      return <FlashcardsBlock {...common} data={component.data!} saved={saved()} />;
    case "diagram":
      return <DiagramBlock id={component.id} data={component.data!} />;
    case "study_targets":
      return <StudyTargetsBlock {...common} data={component.data!} saved={saved()} />;
    case "study_planner":
      return <StudyPlannerBlock id={component.id} requestId={source.requestId} data={component.data!} saved={saved()} />;
  }
}
/**
 * Renders registry components in arrival order. Each keeps a stable slot keyed by its id,
 * so a placeholder turns into its card in place, with an animated height change. Blocks
 * that are complete can be used while the rest of the reply is still streaming.
 */
function AvenGenerativeUI({
  components,
  requestId,
  context,
  persist = false,
}: {
  components: UiComponent[];
  requestId?: string;
  context?: Record<string, string> | null;
  persist?: boolean;
}) {
  const shown = components.filter((item) => item.status !== "removed");
  if (!shown.length) return null;
  const source = { requestId, context, persist };
  return (
    <div className="aven-card-stack">
      {shown.map((component) => (
        <div key={component.id} className="aven-card-enter">
          <AvenReveal>
            <Card component={component} source={source} />
          </AvenReveal>
        </div>
      ))}
    </div>
  );
}
export default memo(AvenGenerativeUI);
