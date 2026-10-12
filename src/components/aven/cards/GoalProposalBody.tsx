"use client";
import { useTranslations } from "next-intl";
import type { AvenProposal } from "@/lib/aven/validation";
import { CardFact } from "./ActionCard";
import { formatDay } from "./formatters";
import DurationText from "./DurationText";
type GoalPlan = Extract<AvenProposal, { kind: "goalPlan" }>;
export default function GoalProposalBody({ value }: { value: GoalPlan }) {
  const t = useTranslations("aven.cards");
  const workload = value.tasks.reduce(
    (sum, task) => sum + (task.value.estimatedMinutes ?? 0),
    0,
  );
  return (
    <>
      {value.goal.description && (
        <p className="aven-card-text">{value.goal.description}</p>
      )}
      <dl className="aven-facts">
        <CardFact label={t("deadline")}>
          {formatDay(value.goal.targetDate)}
        </CardFact>
        {value.milestones.length > 0 && (
          <CardFact label={t("milestones")}>{value.milestones.length}</CardFact>
        )}
        {value.tasks.length > 0 && (
          <CardFact label={t("estimatedWorkload")}>
            <DurationText minutes={workload} />
            <span className="text-muted dark:text-muted">
              {" · "}
              {t("taskCount", { count: value.tasks.length })}
            </span>
          </CardFact>
        )}
      </dl>
      {value.milestones.length > 0 && (
        <section>
          <h4 className="aven-card-section">{t("milestones")}</h4>
          <ol className="aven-card-list">
            {value.milestones.map((milestone) => (
              <li key={milestone.key}>
                <span>{milestone.value.title}</span>
                {milestone.value.dueDate && (
                  <span className="aven-card-meta">
                    {formatDay(milestone.value.dueDate)}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
      {value.tasks.length > 0 && (
        <section>
          <h4 className="aven-card-section">{t("tasks")}</h4>
          <ul className="aven-card-list">
            {value.tasks.slice(0, 12).map((task) => (
              <li key={task.key}>
                <span>{task.value.title}</span>
                <span className="aven-card-meta">
                  <DurationText minutes={task.value.estimatedMinutes ?? 0} />
                  {task.value.dueDate && ` · ${formatDay(task.value.dueDate)}`}
                </span>
              </li>
            ))}
          </ul>
          {value.tasks.length > 12 && (
            <p className="aven-card-meta">
              {t("moreTasks", { count: value.tasks.length - 12 })}
            </p>
          )}
        </section>
      )}
    </>
  );
}
