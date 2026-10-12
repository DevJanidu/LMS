import { getTranslations } from "next-intl/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { goals } from "@/lib/db/schema";
import { getGoalCards } from "@/lib/goals/service";
import { Link } from "@/i18n/navigation";
import ProgressBar from "@/components/studyflow/ProgressBar";
import DashboardPanel, {
  PanelEmpty,
} from "@/components/dashboard/DashboardPanel";
/** The three nearest active goals with verified progress, next milestone and deadline. */
export default async function GoalPriorities({ userId }: { userId: string }) {
  const t = await getTranslations("studyflow.dashboard");
  const details = await (async () => {
    const rows = await getDb()
      .select({ id: goals.id })
      .from(goals)
      .where(
        and(
          eq(goals.userId, userId),
          inArray(goals.status, ["active", "planned", "missedTarget"]),
        ),
      )
      .orderBy(asc(goals.targetDate))
      .limit(3);
    return getGoalCards(
      userId,
      rows.map((row) => row.id),
    );
  })().catch(() => undefined);
  return (
    <DashboardPanel
      title={t("goalsTitle")}
      action={{ href: "/goals", label: t("allGoals") }}
    >
      {!details ? (
        <PanelEmpty message={t("unavailable")} />
      ) : details.length ? (
        <ul className="sf-panel-list">
          {details.map(({ goal, progress, milestones, tasks }) => {
            const next =
              milestones[0]?.title ??
              tasks.find((task) => task.id === progress.nextTaskId)?.title;
            return (
              <li key={goal.id} className="sf-goal-row">
                <div className="sf-row-head">
                  <Link href={`/goals/${goal.id}`} className="sf-row-title">
                    {goal.title}
                  </Link>
                  <span className="sf-row-figure">
                    {Math.round(progress.percent)}%
                  </span>
                </div>
                <ProgressBar
                  value={progress.percent}
                  label={t("progressLabel", { title: goal.title })}
                />
                <p className="sf-row-meta">
                  {[
                    next ? t("nextUp", { title: next }) : t("noNextStep"),
                    progress.daysRemaining < 0
                      ? t("overdue")
                      : t("daysLeft", { days: progress.daysRemaining }),
                  ].join(" · ")}
                </p>
                <Link
                  href={`/aven?goal=${goal.id}&intent=next`}
                  className="sf-row-action"
                >
                  {t("planNext")}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <PanelEmpty
          message={t("noGoals")}
          action={
            <Link href="/goals" className="sf-action-secondary">
              {t("createGoal")}
            </Link>
          }
        />
      )}
    </DashboardPanel>
  );
}
