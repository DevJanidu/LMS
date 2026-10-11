"use client";
import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui/Checkbox";
import { EditIcon, TrashIcon, PlayIcon } from "@/icons";
import { Link } from "@/i18n/navigation";
import type { GoalDetail, GoalTask } from "@/lib/goals/model";
interface Props {
  detail: GoalDetail;
  busy: boolean;
  onToggle: (task: GoalTask) => void;
  onEdit: (task: GoalTask) => void;
  onDelete: (task: GoalTask) => void;
  onHabit: (task: GoalTask) => void;
}
export default function GoalTaskList({
  detail,
  busy,
  onToggle,
  onEdit,
  onDelete,
  onHabit,
}: Props) {
  const t = useTranslations("goals");
  return (
    <div className="space-y-3">
      {detail.tasks.map((task) => {
        const blocked = detail.progress.blockedIds.includes(task.id),
          progress = detail.progress.taskProgress[task.id] ?? 0;
        return (
          <article
            key={task.id}
            className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900"
          >
            <div className="flex items-start gap-3">
              <Checkbox
                checked={task.status === "completed"}
                disabled={busy || (blocked && task.status !== "completed")}
                onCheckedChange={() => onToggle(task)}
                aria-label={t("completeTask", { title: task.title })}
                className="mt-1 !min-h-0 !min-w-0"
              />
              <div className="min-w-0 flex-1">
                <h3 className="text-primary dark:text-primary text-h3 break-words">
                  {task.title}
                </h3>
                <p className="text-secondary dark:text-secondary mt-1 text-small whitespace-pre-wrap">
                  {task.description}
                </p>
                <p className="text-muted dark:text-muted mt-2 text-caption">
                  {t(`taskStatuses.${task.status}`)} ·{" "}
                  {t("progressValue", { value: progress })} ·{" "}
                  {t("trackedMinutes", {
                    count: Math.round(task.actualSeconds / 60),
                  })}
                  {task.dueDate && ` · ${task.dueDate}`}
                </p>
                {blocked && (
                  <p className="mt-2 text-small text-warning-600 dark:text-warning-400">
                    {t("blocked")}
                  </p>
                )}
                {task.evidence && (
                  <p className="text-secondary dark:text-secondary mt-2 text-small break-words">
                    {task.evidence}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  disabled={busy}
                  aria-label={t("editNamed", { title: task.title })}
                  onClick={() => onEdit(task)}
                  className="text-secondary dark:text-secondary grid size-11 place-items-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <EditIcon className="size-4" />
                </button>
                <button
                  type="button"
                  disabled={busy}
                  aria-label={t("deleteNamed", { title: task.title })}
                  onClick={() => onDelete(task)}
                  className="grid size-11 place-items-center rounded-lg text-error-600 hover:bg-error-50 dark:text-error-400 dark:hover:bg-error-950/40"
                >
                  <TrashIcon className="size-4" />
                </button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-small">
              {task.subjectId && (
                <Link
                  href={`/study?subject=${task.subjectId}&topic=${task.topicId ?? ""}`}
                  className="inline-flex items-center gap-1 text-brand-600 dark:text-brand-300"
                >
                  <PlayIcon className="size-4" />
                  {t("studyTask")}
                </Link>
              )}
              {task.recurringDays.length > 0 && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onHabit(task)}
                  className="text-brand-600 dark:text-brand-300"
                >
                  {t("logHabit")}
                </button>
              )}
            </div>
          </article>
        );
      })}
      {!detail.tasks.length && (
        <p className="text-secondary dark:text-secondary py-6 text-small">
          {t("noTasks")}
        </p>
      )}
    </div>
  );
}
