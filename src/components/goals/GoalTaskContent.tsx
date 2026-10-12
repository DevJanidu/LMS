"use client";
import { useTranslations, useLocale } from "next-intl";
import type { GoalTask } from "@/lib/goals/model";
interface Props {
  task: GoalTask;
  milestone?: string;
  progress: number;
  blocked: boolean;
}
export default function GoalTaskContent({
  task,
  milestone,
  progress,
  blocked,
}: Props) {
  const t = useTranslations("goals"),
    locale = useLocale();
  const date = task.dueDate
    ? new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeZone: "UTC",
      }).format(new Date(`${task.dueDate}T12:00:00Z`))
    : null;
  return (
    <details className="goal-task-body goal-task-details">
      <summary>
        <strong>{task.title}</strong>
        <p className="goal-meta">
          {[
            milestone,
            date,
            task.estimatedMinutes
              ? t("nextBestAction.estimate", { minutes: task.estimatedMinutes })
              : null,
            t(`taskStatuses.${task.status}`),
            task.priority === "high" ? t("priorities.high") : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {blocked && <p className="goal-warning">{t("blocked")}</p>}
      </summary>
      <div className="goal-task-expanded">
        <p className="goal-description">{task.description}</p>
        {task.evidence && <p className="goal-description">{task.evidence}</p>}
        <p className="goal-meta">
          {t("progressValue", { value: progress })} ·{" "}
          {t("trackedMinutes", { count: Math.round(task.actualSeconds / 60) })}
        </p>
      </div>
    </details>
  );
}
