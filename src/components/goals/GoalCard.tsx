"use client";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { EditIcon, TrashIcon } from "@/icons";
import ProgressBar from "@/components/studyflow/ProgressBar";
import type { GoalDetail } from "@/lib/goals/model";
interface Props {
  detail: GoalDetail;
  onEdit: () => void;
  onDelete: () => void;
  onComplete: () => void;
  busy?: boolean;
}
export default function GoalCard({
  detail,
  onEdit,
  onDelete,
  onComplete,
  busy,
}: Props) {
  const t = useTranslations("goals"),
    locale = useLocale();
  const { goal, progress } = detail;
  const counts = detail.taskCounts ?? {
    completed: detail.tasks.filter((task) => task.status === "completed")
      .length,
    total: detail.tasks.filter((task) => task.status !== "cancelled").length,
  };
  const next =
    detail.tasks.find((task) => task.id === progress.nextTaskId)?.title ??
    detail.milestones[0]?.title;
  const date = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(goal.targetDate + "T12:00:00Z"));
  return (
    <article className="goal-card">
      <p className="goal-meta">
        {goal.category === "custom" && goal.customCategory
          ? goal.customCategory
          : t("categories." + goal.category)}{" "}
        · {t("statuses." + goal.status)}
      </p>
      <h2>
        <Link href={"/goals/" + goal.id} className="goal-card-link">
          {goal.title}
        </Link>
      </h2>
      <div className="goal-card-progress">
        <strong>{t("workspace.complete", { value: progress.percent })}</strong>
        <span>{t("workspace.taskCount", counts)}</span>
      </div>
      <ProgressBar
        value={progress.percent}
        label={t("progressValue", { value: progress.percent })}
      />
      <p className="goal-card-next">
        {next
          ? t("nextAction", { title: next })
          : t(
              goal.status === "completed"
                ? "workspace.goalAchieved"
                : "noNextTask",
            )}
      </p>
      <div className="goal-card-target">
        <span>{t("targetLabel", { date })}</span>
        <span className={"goal-health goal-health-" + progress.health}>
          {t("health." + progress.health)}
        </span>
      </div>
      <div className="goal-card-controls">
        <button
          disabled={busy}
          onClick={onComplete}
          className="goal-text-action"
        >
          {t(goal.status === "completed" ? "reopenGoal" : "markComplete")}
        </button>
        <div className="goal-actions">
          <button
            disabled={busy}
            onClick={onEdit}
            aria-label={t("editNamed", { title: goal.title })}
            className="goal-icon-action"
          >
            <EditIcon className="size-4" />
          </button>
          <button
            disabled={busy}
            onClick={onDelete}
            aria-label={t("deleteNamed", { title: goal.title })}
            className="goal-icon-action goal-danger"
          >
            <TrashIcon className="size-4" />
          </button>
        </div>
      </div>
    </article>
  );
}
