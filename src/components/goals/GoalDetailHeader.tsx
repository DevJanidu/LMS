"use client";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ArrowRightIcon } from "@/icons";
import Button from "@/components/ui/button/Button";
import GoalActionMenu from "./GoalActionMenu";
import ProgressBar from "@/components/studyflow/ProgressBar";
import type { GoalDetail } from "@/lib/goals/model";
interface Props {
  detail: GoalDetail;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onComplete: () => void;
}
export default function GoalDetailHeader({
  detail,
  busy,
  onEdit,
  onDelete,
  onComplete,
}: Props) {
  const t = useTranslations("goals"),
    locale = useLocale();
  const { goal, progress, tasks } = detail;
  const target = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${goal.targetDate}T12:00:00Z`));
  return (
    <header className="goal-detail-header">
      <nav aria-label={t("workspace.breadcrumb")} className="goal-breadcrumb">
        <Link href="/goals">{t("title")}</Link>
        <ArrowRightIcon className="size-3 rtl:rotate-180" aria-hidden="true" />
        <span aria-current="page">{goal.title}</span>
      </nav>
      <div className="goal-heading-row">
        <div className="min-w-0">
          <h1>{goal.title}</h1>
          <p className="goal-meta">
            {goal.category === "custom" && goal.customCategory
              ? goal.customCategory
              : t(`categories.${goal.category}`)}{" "}
            · {t(`statuses.${goal.status}`)} ·{" "}
            {t("targetLabel", { date: target })}
          </p>
        </div>
        <div className="goal-actions">
          <Button variant="outline" disabled={busy} onClick={onEdit}>
            {t("editGoal")}
          </Button>
          <GoalActionMenu label={t("workspace.moreOptions")}>
            <button disabled={busy} onClick={onComplete}>
              {t(goal.status === "completed" ? "reopenGoal" : "markComplete")}
            </button>
            <button disabled={busy} onClick={onDelete} className="goal-danger">
              {t("deleteGoal")}
            </button>
          </GoalActionMenu>
        </div>
      </div>
      <div className="goal-progress-summary">
        <div>
          <strong>
            {t("workspace.complete", { value: progress.percent })}
          </strong>
          <span>
            {t("workspace.taskCount", {
              completed: tasks.filter((task) => task.status === "completed")
                .length,
              total: tasks.filter((task) => task.status !== "cancelled").length,
            })}
          </span>
          <span className={`goal-health goal-health-${progress.health}`}>
            {t(`health.${progress.health}`)}
          </span>
        </div>
        <ProgressBar
          value={progress.percent}
          label={t("progressValue", { value: progress.percent })}
        />
      </div>
    </header>
  );
}
