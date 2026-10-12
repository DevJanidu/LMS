"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui/Checkbox";
import { EditIcon, TrashIcon } from "@/icons";
import { Link } from "@/i18n/navigation";
import GoalActionMenu from "./GoalActionMenu";
import GoalTaskContent from "./GoalTaskContent";
import type { GoalDetail, GoalTask } from "@/lib/goals/model";
interface Props {
  detail: GoalDetail;
  busy: boolean;
  compact?: boolean;
  onAdd?: () => void;
  onToggle: (task: GoalTask) => void;
  onEdit: (task: GoalTask) => void;
  onDelete: (task: GoalTask) => void;
  onHabit: (task: GoalTask) => void;
}
export default function GoalTaskList({
  detail,
  busy,
  compact = false,
  onAdd,
  onToggle,
  onEdit,
  onDelete,
  onHabit,
}: Props) {
  const t = useTranslations("goals");
  const [filter, setFilter] = useState("pending"),
    [grouped, setGrouped] = useState(false);
  const priorities = { high: 0, normal: 1, low: 2 };
  const tasks = detail.tasks
    .filter((task) =>
      compact
        ? task.status !== "completed" && task.status !== "cancelled"
        : filter === "all" ||
          (filter === "pending"
            ? task.status !== "completed" && task.status !== "cancelled"
            : task.status === filter),
    )
    .sort(
      (a, b) =>
        Number(a.status === "completed" || a.status === "cancelled") -
          Number(b.status === "completed" || b.status === "cancelled") ||
        Number(detail.progress.blockedIds.includes(a.id)) -
          Number(detail.progress.blockedIds.includes(b.id)) ||
        priorities[a.priority] - priorities[b.priority] ||
        (a.dueDate ?? detail.goal.targetDate).localeCompare(
          b.dueDate ?? detail.goal.targetDate,
        ) ||
        a.title.localeCompare(b.title),
    );
  const visible = compact ? tasks.slice(0, 5) : tasks;
  const groups =
    grouped && !compact
      ? [
          ...detail.milestones.map((m) => ({
            title: m.title,
            tasks: visible.filter((task) => task.milestoneId === m.id),
          })),
          {
            title: t("workspace.ungrouped"),
            tasks: visible.filter((task) => !task.milestoneId),
          },
        ].filter((group) => group.tasks.length)
      : [{ title: "", tasks: visible }];
  return (
    <div className="goal-checklist">
      {!compact && (
        <div className="goal-task-toolbar">
          <div
            className="goal-task-filters"
            aria-label={t("workspace.taskFilters")}
          >
            {["pending", "all", "todo", "inProgress", "completed"].map(
              (value) => (
                <button
                  type="button"
                  key={value}
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                >
                  {t(
                    value === "pending"
                      ? "workspace.pending"
                      : value === "all"
                        ? "workspace.all"
                        : "taskStatuses." + value,
                  )}
                </button>
              ),
            )}
          </div>
          <button
            className="goal-text-action"
            aria-pressed={grouped}
            onClick={() => setGrouped(!grouped)}
          >
            {t("workspace.groupMilestone")}
          </button>
        </div>
      )}
      {groups.map((group) => (
        <div key={group.title}>
          {group.title && <h3 className="goal-task-group">{group.title}</h3>}
          <ul>
            {group.tasks.map((task) => {
              const blocked = detail.progress.blockedIds.includes(task.id);
              const milestone = detail.milestones.find(
                (m) => m.id === task.milestoneId,
              );
              return (
                <li
                  key={task.id}
                  className={
                    "goal-task-row " +
                    (task.status === "completed" ? "is-complete" : "")
                  }
                >
                  <div className="goal-task-top">
                    <label
                      className="goal-checkbox-target"
                      htmlFor={`goal-task-${task.id}`}
                    >
                      <Checkbox
                        id={`goal-task-${task.id}`}
                        checked={task.status === "completed"}
                        disabled={
                          busy ||
                          task.status === "cancelled" ||
                          (blocked && task.status !== "completed")
                        }
                        onCheckedChange={() => onToggle(task)}
                        aria-label={t(
                          task.status === "completed"
                            ? "workspace.reopenTask"
                            : "completeTask",
                          { title: task.title },
                        )}
                        className="!min-h-0 !min-w-0"
                      />
                    </label>
                    <GoalTaskContent
                      task={task}
                      milestone={milestone?.title}
                      blocked={blocked}
                      progress={detail.progress.taskProgress[task.id] ?? 0}
                    />
                    <GoalActionMenu
                      label={t("workspace.taskActions", { title: task.title })}
                    >
                      <button
                        type="button"
                        onClick={(event) => {
                          const details = event.currentTarget
                            .closest(".goal-task-row")
                            ?.querySelector<HTMLDetailsElement>(
                              ".goal-task-details",
                            );
                          if (details) {
                            details.open = true;
                            details.querySelector("summary")?.focus();
                          }
                        }}
                      >
                        {t("workspace.taskDetails")}
                      </button>
                      <button disabled={busy} onClick={() => onEdit(task)}>
                        <EditIcon className="size-4" />
                        {t("editTask")}
                      </button>
                      <Link
                        href={
                          task.subjectId
                            ? "/study?subject=" +
                              task.subjectId +
                              "&topic=" +
                              (task.topicId ?? "")
                            : "/study"
                        }
                      >
                        {t("studyTask")}
                      </Link>
                      <Link
                        href={
                          "/aven?goal=" +
                          detail.goal.id +
                          "&intent=startTask&taskId=" +
                          task.id
                        }
                      >
                        {t("askAven")}
                      </Link>
                      {task.recurringDays.length > 0 && (
                        <button disabled={busy} onClick={() => onHabit(task)}>
                          {t("logHabit")}
                        </button>
                      )}
                      <button
                        disabled={busy}
                        onClick={() => onDelete(task)}
                        className="goal-danger"
                      >
                        <TrashIcon className="size-4" />
                        {t("deleteNamed", { title: task.title })}
                      </button>
                    </GoalActionMenu>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {!visible.length && (
        <p className="goal-empty-inline">
          {t(detail.tasks.length ? "workspace.noMatchingTasks" : "noTasks")}
        </p>
      )}
      {compact && onAdd && (
        <button disabled={busy} onClick={onAdd} className="goal-text-action">
          {t("addTask")}
        </button>
      )}
    </div>
  );
}
