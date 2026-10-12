"use client";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { EditIcon, TrashIcon, ChevronDownIcon } from "@/icons";
import ProgressBar from "@/components/studyflow/ProgressBar";
import type { GoalDetail, GoalMilestone } from "@/lib/goals/model";
interface Props {
  detail: GoalDetail;
  busy: boolean;
  snapshot?: boolean;
  onEdit: (milestone: GoalMilestone) => void;
  onDelete: (milestone: GoalMilestone) => void;
  onTasks: () => void;
}
export default function GoalMilestoneList({
  detail,
  busy,
  snapshot = false,
  onEdit,
  onDelete,
  onTasks,
}: Props) {
  const t = useTranslations("goals"),
    locale = useLocale();
  const date = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeZone: "UTC",
    }).format(new Date(`${value}T12:00:00Z`));
  return (
    <ol className="goal-roadmap">
      {(snapshot ? detail.milestones.slice(0, 4) : detail.milestones).map(
        (milestone) => {
          const percent = Math.round(
            detail.progress.milestoneProgress[milestone.id] ?? 0,
          );
          const tasks = detail.tasks.filter(
            (task) =>
              task.milestoneId === milestone.id && task.status !== "cancelled",
          );
          return (
            <li key={milestone.id}>
              <details className="goal-milestone">
                <summary>
                  <span
                    className={`goal-roadmap-dot ${percent === 100 ? "is-complete" : ""}`}
                  />
                  <div className="min-w-0 flex-1">
                    <strong>{milestone.title}</strong>
                    <p className="goal-meta">
                      {t(
                        percent === 100
                          ? "taskStatuses.completed"
                          : percent > 0
                            ? "taskStatuses.inProgress"
                            : "workspace.notStarted",
                      )}{" "}
                      ·{" "}
                      {t("workspace.taskCount", {
                        completed: tasks.filter(
                          (task) => task.status === "completed",
                        ).length,
                        total: tasks.length,
                      })}
                      {milestone.dueDate && ` · ${date(milestone.dueDate)}`}
                    </p>
                    <ProgressBar
                      value={percent}
                      label={t("progressValue", { value: percent })}
                    />
                  </div>
                  <span className="goal-percentage">{percent}%</span>
                  <ChevronDownIcon className="size-4" aria-hidden="true" />
                </summary>
                <div className="goal-milestone-details">
                  {milestone.description && (
                    <p className="goal-description">{milestone.description}</p>
                  )}
                  {milestone.dependencyIds.some(
                    (id) => (detail.progress.milestoneProgress[id] ?? 0) < 100,
                  ) && <p className="goal-warning">{t("blocked")}</p>}
                  <ul className="goal-milestone-tasks">
                    {tasks.map((task) => (
                      <li key={task.id}>
                        <button onClick={onTasks}>
                          {task.title}
                          <span>{t(`taskStatuses.${task.status}`)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className="goal-actions">
                    <button
                      disabled={busy}
                      onClick={() => onEdit(milestone)}
                      className="goal-text-action"
                    >
                      <EditIcon className="size-4" />
                      {t("editNamed", { title: milestone.title })}
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => onDelete(milestone)}
                      className="goal-icon-action goal-danger"
                      aria-label={t("deleteNamed", { title: milestone.title })}
                    >
                      <TrashIcon className="size-4" />
                    </button>
                    <Link
                      href={`/aven?goal=${detail.goal.id}&intent=plan`}
                      className="goal-text-action"
                    >
                      {t("askAven")}
                    </Link>
                  </div>
                </div>
              </details>
            </li>
          );
        },
      )}
      {!detail.milestones.length && (
        <li className="goal-empty-inline">{t("workspace.noMilestones")}</li>
      )}
    </ol>
  );
}
