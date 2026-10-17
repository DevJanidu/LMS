"use client";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { UiComponentData } from "@/lib/aven/ui-components";
import ActionCard from "./ActionCard";
import { formatDay } from "./formatters";
type Tasks = UiComponentData<"task_list">;
export default function TaskListCard({ data }: { data: Tasks }) {
  const t = useTranslations("aven.cards");
  return (
    <ActionCard
      eyebrow={t("taskList")}
      title={data.goalTitle}
      status={
        <span className="aven-pill">
          {t("remainingTasks", { count: data.remaining })}
        </span>
      }
      footer={
        <Link href={`/goals/${data.goalId}`} className="aven-text-button">
          {t("openGoal")}
        </Link>
      }
    >
      <ul className="aven-card-list">
        {data.tasks.map((task) => (
          <li key={task.id}>
            <span className="aven-task-title">
              <span
                className="aven-task-dot"
                data-status={task.status}
                aria-hidden="true"
              />
              <span>{task.title}</span>
            </span>
            <span className="aven-task-meta">
              {task.priority !== "normal" && t.has(`priority.${task.priority}`) && (
                <span className="aven-card-meta">{t(`priority.${task.priority}`)}</span>
              )}
              {t.has(`taskStatus.${task.status}`) && (
                <span className="sr-only">{t(`taskStatus.${task.status}`)}</span>
              )}
              {task.overdue ? (
                <span className="aven-pill" data-tone="overdue">
                  {t("overdueBadge")}
                </span>
              ) : (
                task.dueDate && (
                  <span className="aven-card-meta">
                    {t("dueOn", { date: formatDay(task.dueDate) })}
                  </span>
                )
              )}
            </span>
          </li>
        ))}
      </ul>
    </ActionCard>
  );
}
